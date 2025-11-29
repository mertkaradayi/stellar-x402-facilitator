import type { Request, Response } from "express";
import type { PaymentPayload, PaymentRequirements, SettleResponse } from "../types.js";
import { settleStellarPayment } from "../stellar/settle.js";

export interface SettleRequest {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
}

export async function settleRoute(req: Request, res: Response): Promise<void> {
  const { paymentPayload, paymentRequirements } = req.body as SettleRequest;

  console.log("[/settle] Received request:", {
    paymentPayload: JSON.stringify(paymentPayload).slice(0, 200),
    paymentRequirements: JSON.stringify(paymentRequirements).slice(0, 200),
  });

  // Handle mock/legacy payloads for backward compatibility
  if (!paymentPayload?.payload || !paymentPayload?.network) {
    console.log("[/settle] Mock mode - payload missing required fields");
    const response: SettleResponse = {
      success: true,
      error: null,
      transaction: "mock-tx-hash-" + Date.now(),
      network: "stellar-testnet",
      payer: "mock-payer",
    };
    res.json(response);
    return;
  }

  try {
    // Use real Stellar settlement
    const response = await settleStellarPayment(paymentPayload, paymentRequirements);
    console.log("[/settle] Response:", response);
    res.json(response);
  } catch (error) {
    console.error("[/settle] Error:", error);
    const response: SettleResponse = {
      success: false,
      error: error instanceof Error ? error.message : "Settlement failed",
      transaction: "",
      network: paymentPayload?.network || "stellar-testnet",
      payer: paymentPayload?.payload?.sourceAccount || "unknown",
    };
    res.json(response);
  }
}
