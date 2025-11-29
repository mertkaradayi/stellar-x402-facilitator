import type { Request, Response } from "express";
import type { SettleResponse, StellarErrorReason } from "../types.js";
import { extractPaymentPayload, STELLAR_NETWORKS } from "../types.js";
import { SettleRequestSchema } from "../schemas.js";
import { settleStellarPayment } from "../stellar/settle.js";
import { getTxHashFromXdr } from "../stellar/verify.js";
import {
  hasTransactionBeenUsed,
  getCachedSettlement,
  getResourceForTransaction,
  markPaymentAsSettled,
} from "../storage/replay-store.js";

export async function settleRoute(req: Request, res: Response): Promise<void> {
  // Step 1: Validate request with Zod schema
  const parseResult = SettleRequestSchema.safeParse(req.body);

  if (!parseResult.success) {
    // Extract the first error for a more specific message
    const firstError = parseResult.error.errors[0];
    const errorPath = firstError?.path?.join(".") || "";

    console.log("[/settle] Zod validation failed:", parseResult.error.errors);

    // Map Zod errors to x402 error codes
    let errorReason: StellarErrorReason = "invalid_payload";
    if (errorPath.includes("x402Version")) {
      errorReason = "invalid_x402_version";
    } else if (errorPath.includes("paymentRequirements")) {
      errorReason = "invalid_payment_requirements";
    } else if (errorPath.includes("network")) {
      errorReason = "invalid_network";
    } else if (errorPath.includes("scheme")) {
      errorReason = "invalid_scheme";
    }

    res.json({
      success: false,
      errorReason,
      transaction: "",
      network: "",
    } satisfies SettleResponse);
    return;
  }

  const { x402Version, paymentHeader, paymentPayload: payloadObj, paymentRequirements } = parseResult.data;

  console.log("[/settle] Received request:", {
    x402Version,
    paymentHeader: paymentHeader ? paymentHeader.slice(0, 100) + "..." : undefined,
    paymentPayload: payloadObj ? "provided" : undefined,
    paymentRequirements: paymentRequirements ? JSON.stringify(paymentRequirements).slice(0, 200) : undefined,
  });

  // Step 2: Extract and validate the payment payload from either format
  // Note: Zod already validated paymentPayload if provided, but we need to handle paymentHeader (base64)
  const validation = extractPaymentPayload(paymentHeader, payloadObj);
  if (!validation.valid) {
    console.log("[/settle] Payload extraction failed:", validation.error);
    res.json({
      success: false,
      errorReason: "invalid_payload" as StellarErrorReason,
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

  // Step 3: Extract transaction hash for replay protection and idempotency
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
          errorReason: "invalid_exact_stellar_payload_transaction_already_used" as StellarErrorReason,
          payer,
          transaction: "",
          network,
        } satisfies SettleResponse);
        return;
      }
    }
  }

  // Step 4: Perform Stellar settlement
  try {
    const response = await settleStellarPayment(paymentPayload, paymentRequirements);
    console.log("[/settle] Response:", response);

    // If settlement succeeded, mark as settled for idempotency and replay protection
    if (response.success && response.transaction) {
      await markPaymentAsSettled(response.transaction, paymentRequirements.resource, response);
    }

    res.json(response);
  } catch (error) {
    console.error("[/settle] Error:", error);
    res.json({
      success: false,
      errorReason: "unexpected_settle_error" as StellarErrorReason,
      payer,
      transaction: "",
      network,
    } satisfies SettleResponse);
  }
}
