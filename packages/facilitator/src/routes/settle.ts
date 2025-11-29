import type { Request, Response } from "express";
import type { FacilitatorRequest, SettleResponse } from "../types.js";
import { extractPaymentPayload, STELLAR_NETWORKS } from "../types.js";
import { settleStellarPayment } from "../stellar/settle.js";
import { getTxHashFromXdr } from "../stellar/verify.js";
import {
  hasTransactionBeenUsed,
  getCachedSettlement,
  getResourceForTransaction,
  markPaymentAsSettled,
} from "../storage/replay-store.js";

export async function settleRoute(req: Request, res: Response): Promise<void> {
  const { x402Version, paymentHeader, paymentPayload: payloadObj, paymentRequirements } = req.body as FacilitatorRequest;

  console.log("[/settle] Received request:", {
    x402Version,
    paymentHeader: paymentHeader ? paymentHeader.slice(0, 100) + "..." : undefined,
    paymentPayload: payloadObj ? "provided" : undefined,
    paymentRequirements: paymentRequirements ? JSON.stringify(paymentRequirements).slice(0, 200) : undefined,
  });

  // Validate request x402Version
  if (x402Version !== 1) {
    res.json({
      success: false,
      errorReason: `Unsupported request x402Version: ${x402Version}`,
      transaction: "",
      network: "",
    } satisfies SettleResponse);
    return;
  }

  // Validate paymentHeader or paymentPayload exists
  if (!paymentHeader && !payloadObj) {
    res.json({
      success: false,
      errorReason: "Either paymentHeader or paymentPayload is required",
      transaction: "",
      network: "",
    } satisfies SettleResponse);
    return;
  }

  // Validate paymentRequirements exists
  if (!paymentRequirements) {
    res.json({
      success: false,
      errorReason: "paymentRequirements is required",
      transaction: "",
      network: "",
    } satisfies SettleResponse);
    return;
  }

  // Extract and validate the payment payload from either format
  const validation = extractPaymentPayload(paymentHeader, payloadObj);
  if (!validation.valid) {
    console.log("[/settle] Validation failed:", validation.error);
    res.json({
      success: false,
      errorReason: validation.error,
      transaction: "",
      network: "",
    } satisfies SettleResponse);
    return;
  }

  const paymentPayload = validation.payload;
  const payer = paymentPayload.payload?.sourceAccount;
  const network = paymentPayload.network;
  
  console.log("[/settle] Decoded payload:", {
    x402Version: paymentPayload.x402Version,
    scheme: paymentPayload.scheme,
    network,
  });

  // Extract transaction hash for replay protection and idempotency
  const signedTxXdr = paymentPayload.payload?.signedTxXdr;
  const networkConfig = STELLAR_NETWORKS[paymentPayload.network as keyof typeof STELLAR_NETWORKS];

  if (signedTxXdr && networkConfig) {
    const txHash = getTxHashFromXdr(signedTxXdr, networkConfig.networkPassphrase);

    if (txHash) {
      // Check idempotency: if already settled, return cached result
      const cached = await getCachedSettlement(txHash);
      if (cached) {
        console.log(`[/settle] Returning cached settlement for ${txHash.slice(0, 16)}...`);
        res.json(cached);
        return;
      }

      // Check replay protection: if used for different resource, reject
      if (await hasTransactionBeenUsed(txHash)) {
        const usedForResource = await getResourceForTransaction(txHash);
        console.log(
          `[/settle] Transaction ${txHash.slice(0, 16)}... already used for resource: ${usedForResource}`
        );
        res.json({
          success: false,
          errorReason: "Transaction has already been used for a previous payment",
          payer,
          transaction: "",
          network,
        } satisfies SettleResponse);
        return;
      }
    }
  }

  try {
    // Use real Stellar settlement
    const response = await settleStellarPayment(paymentPayload, paymentRequirements);
    console.log("[/settle] Response:", response);

    // If settlement succeeded, mark as settled for idempotency and replay protection
    if (response.success && response.transaction) {
      await markPaymentAsSettled(
        response.transaction,
        paymentRequirements.resource,
        response
      );
    }

    res.json(response);
  } catch (error) {
    console.error("[/settle] Error:", error);
    res.json({
      success: false,
      errorReason: error instanceof Error ? error.message : "Settlement failed",
      payer,
      transaction: "",
      network,
    } satisfies SettleResponse);
  }
}
