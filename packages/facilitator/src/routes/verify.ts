import type { Request, Response } from "express";
import type { FacilitatorRequest, VerifyResponse } from "../types.js";
import { extractPaymentPayload, STELLAR_NETWORKS } from "../types.js";
import { verifyStellarPayment, getTxHashFromXdr } from "../stellar/verify.js";
import { hasTransactionBeenUsed } from "../storage/replay-store.js";

export async function verifyRoute(req: Request, res: Response): Promise<void> {
  const { x402Version, paymentHeader, paymentPayload: payloadObj, paymentRequirements } = req.body as FacilitatorRequest;

  console.log("[/verify] Received request:", {
    x402Version,
    paymentHeader: paymentHeader ? paymentHeader.slice(0, 100) + "..." : undefined,
    paymentPayload: payloadObj ? "provided" : undefined,
    paymentRequirements: paymentRequirements ? JSON.stringify(paymentRequirements).slice(0, 200) : undefined,
  });

  // Validate request x402Version
  if (x402Version !== 1) {
    res.json({
      isValid: false,
      invalidReason: `Unsupported request x402Version: ${x402Version}`,
    } satisfies VerifyResponse);
    return;
  }

  // Validate paymentHeader or paymentPayload exists
  if (!paymentHeader && !payloadObj) {
    res.json({
      isValid: false,
      invalidReason: "Either paymentHeader or paymentPayload is required",
    } satisfies VerifyResponse);
    return;
  }

  // Validate paymentRequirements exists
  if (!paymentRequirements) {
    res.json({
      isValid: false,
      invalidReason: "paymentRequirements is required",
    } satisfies VerifyResponse);
    return;
  }

  // Extract and validate the payment payload from either format
  const validation = extractPaymentPayload(paymentHeader, payloadObj);
  if (!validation.valid) {
    console.log("[/verify] Validation failed:", validation.error);
    res.json({
      isValid: false,
      invalidReason: validation.error,
    } satisfies VerifyResponse);
    return;
  }

  const paymentPayload = validation.payload;
  console.log("[/verify] Decoded payload:", {
    x402Version: paymentPayload.x402Version,
    scheme: paymentPayload.scheme,
    network: paymentPayload.network,
  });

  // Replay protection: Check if this transaction has already been used
  const signedTxXdr = paymentPayload.payload?.signedTxXdr;
  const payer = paymentPayload.payload?.sourceAccount;
  
  if (signedTxXdr) {
    const networkConfig = STELLAR_NETWORKS[paymentPayload.network as keyof typeof STELLAR_NETWORKS];
    if (networkConfig) {
      const txHash = getTxHashFromXdr(signedTxXdr, networkConfig.networkPassphrase);
      if (txHash && await hasTransactionBeenUsed(txHash)) {
        console.log(`[/verify] Transaction ${txHash.slice(0, 16)}... already used`);
        res.json({
          isValid: false,
          invalidReason: "Transaction has already been used for a previous payment",
          payer,
        } satisfies VerifyResponse);
        return;
      }
    }
  }

  try {
    // Use real Stellar verification
    const response = await verifyStellarPayment(paymentPayload, paymentRequirements);
    console.log("[/verify] Response:", response);
    res.json(response);
  } catch (error) {
    console.error("[/verify] Error:", error);
    res.json({
      isValid: false,
      invalidReason: error instanceof Error ? error.message : "Verification failed",
      payer,
    } satisfies VerifyResponse);
  }
}
