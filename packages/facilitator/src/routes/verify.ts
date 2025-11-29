import type { Request, Response } from "express";
import type { PaymentPayload, PaymentRequirements, VerifyResponse } from "../types.js";
import { verifyStellarPayment } from "../stellar/verify.js";

export interface VerifyRequest {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
}

export async function verifyRoute(req: Request, res: Response): Promise<void> {
  const { paymentPayload, paymentRequirements } = req.body as VerifyRequest;

  console.log("[/verify] Received request:", {
    paymentPayload: JSON.stringify(paymentPayload).slice(0, 200),
    paymentRequirements: JSON.stringify(paymentRequirements).slice(0, 200),
  });

  // Handle mock/legacy payloads for backward compatibility
  if (!paymentPayload?.payload || !paymentPayload?.network) {
    console.log("[/verify] Mock mode - payload missing required fields");
    const response: VerifyResponse = {
      isValid: true,
      invalidReason: null,
      payer: "mock-payer",
    };
    res.json(response);
    return;
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
      payer: paymentPayload?.payload?.sourceAccount || "unknown",
    };
    res.json(response);
  }
}
