import type { Request, Response } from "express";
import type { FacilitatorRequest, VerifyResponse } from "../types.js";
import { decodeAndValidatePaymentHeader, STELLAR_NETWORKS } from "../types.js";
import { verifyStellarPayment, getTxHashFromXdr } from "../stellar/verify.js";
import { hasTransactionBeenUsed } from "../replay-protection.js";

export async function verifyRoute(req: Request, res: Response): Promise<void> {
  const { x402Version, paymentHeader, paymentRequirements } = req.body as FacilitatorRequest;

  console.log("[/verify] Received request:", {
    x402Version,
    paymentHeader: paymentHeader ? paymentHeader.slice(0, 100) + "..." : undefined,
    paymentRequirements: paymentRequirements ? JSON.stringify(paymentRequirements).slice(0, 200) : undefined,
  });

  // Validate request x402Version
  if (x402Version !== 1) {
    const response: VerifyResponse = {
      isValid: false,
      invalidReason: `Unsupported request x402Version: ${x402Version}`,
    };
    res.json(response);
    return;
  }

  // Validate paymentHeader exists
  if (!paymentHeader) {
    const response: VerifyResponse = {
      isValid: false,
      invalidReason: "paymentHeader is required",
    };
    res.json(response);
    return;
  }

  // Validate paymentRequirements exists
  if (!paymentRequirements) {
    const response: VerifyResponse = {
      isValid: false,
      invalidReason: "paymentRequirements is required",
    };
    res.json(response);
    return;
  }

  // Decode and validate the paymentHeader (base64 -> JSON -> validate fields)
  const validation = decodeAndValidatePaymentHeader(paymentHeader);
  if (!validation.valid) {
    console.log("[/verify] Validation failed:", validation.error);
    const response: VerifyResponse = {
      isValid: false,
      invalidReason: validation.error,
    };
    res.json(response);
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
  if (signedTxXdr) {
    const networkConfig = STELLAR_NETWORKS[paymentPayload.network as keyof typeof STELLAR_NETWORKS];
    if (networkConfig) {
      const txHash = getTxHashFromXdr(signedTxXdr, networkConfig.networkPassphrase);
      if (txHash && hasTransactionBeenUsed(txHash)) {
        console.log(`[/verify] Transaction ${txHash.slice(0, 16)}... already used`);
        const response: VerifyResponse = {
          isValid: false,
          invalidReason: "Transaction has already been used for a previous payment",
        };
        res.json(response);
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
    const response: VerifyResponse = {
      isValid: false,
      invalidReason: error instanceof Error ? error.message : "Verification failed",
    };
    res.json(response);
  }
}
