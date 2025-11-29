import { NextRequest, NextResponse } from "next/server";

const FACILITATOR_URL = process.env.FACILITATOR_URL || "http://localhost:4022";

// Configuration for payment requirements
const PAYMENT_CONFIG = {
  payTo: process.env.PAY_TO_ADDRESS || "GC63PSERYMUUUJKYSSFQ7FKRAU5UPIP3XUC6X7DLMZUB7SSCPW5BSIRT", // Your testnet address
  asset: process.env.ASSET_CONTRACT || "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC", // Testnet USDC
  maxAmountRequired: "100000", // 0.1 USDC (6 decimals) - small amount for testing
  network: "stellar-testnet",
};

// The premium content (revealed after payment)
const PREMIUM_CONTENT = `
🎊 Congratulations! You've successfully unlocked this premium content using the x402 protocol!

This content was protected by a Stellar-native payment gateway. The transaction was:
1. Verified by the facilitator
2. Settled on the Stellar testnet
3. Confirmed before revealing this content

You're now part of the future of internet payments!
`.trim();

export async function GET(request: NextRequest) {
  const xPaymentHeader = request.headers.get("X-PAYMENT");

  // No payment header? Return 402 Payment Required
  if (!xPaymentHeader) {
    return NextResponse.json(
      {
        x402Version: 1,
        error: "X-PAYMENT header is required",
        accepts: [
          {
            scheme: "exact",
            network: PAYMENT_CONFIG.network,
            maxAmountRequired: PAYMENT_CONFIG.maxAmountRequired,
            asset: PAYMENT_CONFIG.asset,
            payTo: PAYMENT_CONFIG.payTo,
            resource: "/api/content",
            description: "Premium content access",
            mimeType: "application/json",
            maxTimeoutSeconds: 300,
            outputSchema: null,
            extra: null,
          },
        ],
      },
      { status: 402 }
    );
  }

  // Decode the payment header
  let paymentPayload;
  try {
    paymentPayload = JSON.parse(atob(xPaymentHeader));
  } catch {
    return NextResponse.json(
      { error: "Invalid X-PAYMENT header format" },
      { status: 400 }
    );
  }

  // Call facilitator to verify
  const verifyResponse = await fetch(`${FACILITATOR_URL}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      paymentPayload,
      paymentRequirements: {
        scheme: "exact",
        network: PAYMENT_CONFIG.network,
        maxAmountRequired: PAYMENT_CONFIG.maxAmountRequired,
        asset: PAYMENT_CONFIG.asset,
        payTo: PAYMENT_CONFIG.payTo,
      },
    }),
  });

  const verifyResult = await verifyResponse.json();

  if (!verifyResult.isValid) {
    return NextResponse.json(
      {
        x402Version: 1,
        error: verifyResult.invalidReason || "Payment verification failed",
        accepts: [
          {
            scheme: "exact",
            network: PAYMENT_CONFIG.network,
            maxAmountRequired: PAYMENT_CONFIG.maxAmountRequired,
            asset: PAYMENT_CONFIG.asset,
            payTo: PAYMENT_CONFIG.payTo,
            resource: "/api/content",
            description: "Premium content access",
            mimeType: "application/json",
            maxTimeoutSeconds: 300,
          },
        ],
      },
      { status: 402 }
    );
  }

  // Call facilitator to settle
  const settleResponse = await fetch(`${FACILITATOR_URL}/settle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      paymentPayload,
      paymentRequirements: {
        scheme: "exact",
        network: PAYMENT_CONFIG.network,
        maxAmountRequired: PAYMENT_CONFIG.maxAmountRequired,
        asset: PAYMENT_CONFIG.asset,
        payTo: PAYMENT_CONFIG.payTo,
      },
    }),
  });

  const settleResult = await settleResponse.json();

  if (!settleResult.success) {
    return NextResponse.json(
      { error: settleResult.error || "Payment settlement failed" },
      { status: 500 }
    );
  }

  // Payment successful! Return the content
  const paymentResponse = btoa(
    JSON.stringify({
      success: true,
      transaction: settleResult.transaction,
      network: settleResult.network,
      payer: settleResult.payer,
    })
  );

  return NextResponse.json(
    { content: PREMIUM_CONTENT },
    {
      status: 200,
      headers: {
        "X-PAYMENT-RESPONSE": paymentResponse,
        "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE",
      },
    }
  );
}

