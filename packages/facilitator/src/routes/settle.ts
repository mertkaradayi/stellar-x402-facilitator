import type { Request, Response } from "express";
import type { FacilitatorRequest, SettleResponse } from "../types.js";
import { decodeAndValidatePaymentHeader } from "../types.js";
import { settleStellarPayment } from "../stellar/settle.js";

export async function settleRoute(req: Request, res: Response): Promise<void> {
  const { x402Version, paymentHeader, paymentRequirements } = req.body as FacilitatorRequest;

  console.log("[/settle] Received request:", {
    x402Version,
    paymentHeader: paymentHeader ? paymentHeader.slice(0, 100) + "..." : undefined,
    paymentRequirements: paymentRequirements ? JSON.stringify(paymentRequirements).slice(0, 200) : undefined,
  });

  // Validate request x402Version
  if (x402Version !== 1) {
    const response: SettleResponse = {
      success: false,
      error: `Unsupported request x402Version: ${x402Version}`,
      txHash: null,
      networkId: null,
    };
    res.json(response);
    return;
  }

  // Validate paymentHeader exists
  if (!paymentHeader) {
    const response: SettleResponse = {
      success: false,
      error: "paymentHeader is required",
      txHash: null,
      networkId: null,
    };
    res.json(response);
    return;
  }

  // Validate paymentRequirements exists
  if (!paymentRequirements) {
    const response: SettleResponse = {
      success: false,
      error: "paymentRequirements is required",
      txHash: null,
      networkId: null,
    };
    res.json(response);
    return;
  }

  // Decode and validate the paymentHeader (base64 -> JSON -> validate fields)
  const validation = decodeAndValidatePaymentHeader(paymentHeader);
  if (!validation.valid) {
    console.log("[/settle] Validation failed:", validation.error);
    const response: SettleResponse = {
      success: false,
      error: validation.error,
      txHash: null,
      networkId: null,
    };
    res.json(response);
    return;
  }

  const paymentPayload = validation.payload;
  console.log("[/settle] Decoded payload:", {
    x402Version: paymentPayload.x402Version,
    scheme: paymentPayload.scheme,
    network: paymentPayload.network,
  });

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
      txHash: null,
      networkId: paymentPayload?.network || null,
    };
    res.json(response);
  }
}
