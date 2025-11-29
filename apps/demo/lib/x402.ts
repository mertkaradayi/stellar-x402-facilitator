// x402 Client Helpers for Stellar with Freighter

export interface PaymentRequirements {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  asset: string;
  payTo: string;
  resource: string;
  description: string;
  maxTimeoutSeconds: number;
}

export interface PaymentRequiredResponse {
  x402Version: number;
  error: string;
  accepts: PaymentRequirements[];
}

export interface StellarPayload {
  signedTxXdr: string;
  sourceAccount: string;
  amount: string;
  destination: string;
  asset: string;
  validUntilLedger: number;
  nonce: string;
}

export interface PaymentPayload {
  x402Version: number;
  scheme: "exact";
  network: string;
  payload: StellarPayload;
}

export interface SettlementResponse {
  success: boolean;
  transaction: string;
  network: string;
  payer: string;
}

// Generate a random nonce for replay protection
function generateNonce(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Create a payment payload with signed transaction
export function createStellarPaymentPayload(
  requirements: PaymentRequirements,
  sourceAccount: string,
  signedTxXdr: string,
  validUntilLedger: number
): PaymentPayload {
  return {
    x402Version: 1,
    scheme: "exact",
    network: requirements.network,
    payload: {
      signedTxXdr,
      sourceAccount,
      amount: requirements.maxAmountRequired,
      destination: requirements.payTo,
      asset: requirements.asset,
      validUntilLedger,
      nonce: generateNonce(),
    },
  };
}

// Create a mock payment payload (for testing without real signing)
export function createMockStellarPaymentPayload(
  requirements: PaymentRequirements,
  sourceAccount: string
): PaymentPayload {
  return {
    x402Version: 1,
    scheme: "exact",
    network: requirements.network,
    payload: {
      signedTxXdr: "", // Empty = mock mode
      sourceAccount,
      amount: requirements.maxAmountRequired,
      destination: requirements.payTo,
      asset: requirements.asset,
      validUntilLedger: 0,
      nonce: generateNonce(),
    },
  };
}

// Encode payment payload as base64 for X-PAYMENT header
export function encodePaymentHeader(payload: PaymentPayload): string {
  return btoa(JSON.stringify(payload));
}

// Decode X-PAYMENT-RESPONSE header
export function decodePaymentResponse(header: string): SettlementResponse {
  return JSON.parse(atob(header));
}

// Build transaction XDR for Freighter signing (uses native XLM for simplicity)
export async function buildPaymentTransactionXdr(
  sourceAccount: string,
  destination: string,
  amount: string, // In stroops
  asset: string
): Promise<{ xdr: string; validUntilLedger: number }> {
  // Dynamic import to avoid SSR issues
  const Stellar = await import("@stellar/stellar-sdk");
  
  const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
  const HORIZON_URL = "https://horizon-testnet.stellar.org";
  
  const server = new Stellar.Horizon.Server(HORIZON_URL);
  
  // Load the source account
  const account = await server.loadAccount(sourceAccount);
  
  // Get current ledger for timeout
  const ledgerResponse = await fetch(`${HORIZON_URL}/ledgers?order=desc&limit=1`);
  const ledgerData = await ledgerResponse.json();
  const currentLedger = ledgerData._embedded?.records?.[0]?.sequence || 0;
  const validUntilLedger = currentLedger + 100;
  
  let transaction: Stellar.Transaction;
  
  if (asset === "native") {
    // Native XLM payment
    const xlmAmount = (Number(amount) / 10_000_000).toFixed(7);
    
    transaction = new Stellar.TransactionBuilder(account, {
      fee: "100000",
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        Stellar.Operation.payment({
          destination,
          asset: Stellar.Asset.native(),
          amount: xlmAmount,
        })
      )
      .setTimeout(300)
      .build();
  } else {
    // Soroban token transfer (e.g., USDC)
    // All Stellar assets use 7 decimals - same as native XLM
    // For now, fallback to native XLM
    // TODO: Full Soroban token support
    const xlmAmount = (Number(amount) / 10_000_000).toFixed(7);
    
    transaction = new Stellar.TransactionBuilder(account, {
      fee: "100000",
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        Stellar.Operation.payment({
          destination,
          asset: Stellar.Asset.native(),
          amount: xlmAmount,
        })
      )
      .setTimeout(300)
      .build();
  }

  return {
    xdr: transaction.toXDR(),
    validUntilLedger,
  };
}

// Fetch with x402 payment handling
export async function fetchWithX402(
  url: string,
  options: {
    sourceAccount?: string;
    signTransaction?: (xdr: string) => Promise<string>;
    onPaymentRequired?: (requirements: PaymentRequirements) => void;
    onSigning?: () => void;
    onSettling?: () => void;
  } = {}
): Promise<{
  ok: boolean;
  status: number;
  data: unknown;
  paymentResponse?: SettlementResponse;
  error?: string;
}> {
  // First request - may get 402
  const response = await fetch(url);

  if (response.status === 402) {
    const body: PaymentRequiredResponse = await response.json();
    const requirements = body.accepts[0];

    if (!requirements) {
      return {
        ok: false,
        status: 402,
        data: null,
        error: "No payment requirements provided",
      };
    }

    options.onPaymentRequired?.(requirements);

    if (!options.sourceAccount) {
      return {
        ok: false,
        status: 402,
        data: body,
        error: "Wallet not connected",
      };
    }

    let paymentPayload: PaymentPayload;

    if (options.signTransaction) {
      // Build and sign real transaction
      options.onSigning?.();
      
      try {
        const { xdr, validUntilLedger } = await buildPaymentTransactionXdr(
          options.sourceAccount,
          requirements.payTo,
          requirements.maxAmountRequired,
          requirements.asset
        );

        const signedXdr = await options.signTransaction(xdr);

        paymentPayload = createStellarPaymentPayload(
          requirements,
          options.sourceAccount,
          signedXdr,
          validUntilLedger
        );
      } catch (err) {
        return {
          ok: false,
          status: 402,
          data: body,
          error: err instanceof Error ? err.message : "Failed to sign transaction",
        };
      }
    } else {
      // Mock mode
      paymentPayload = createMockStellarPaymentPayload(
        requirements,
        options.sourceAccount
      );
    }

    // Retry with payment header
    options.onSettling?.();
    
    const paidResponse = await fetch(url, {
      headers: {
        "X-PAYMENT": encodePaymentHeader(paymentPayload),
      },
    });

    if (paidResponse.ok) {
      const data = await paidResponse.json();
      const paymentResponseHeader = paidResponse.headers.get("X-PAYMENT-RESPONSE");
      const paymentResponse = paymentResponseHeader
        ? decodePaymentResponse(paymentResponseHeader)
        : undefined;

      return {
        ok: true,
        status: 200,
        data,
        paymentResponse,
      };
    } else {
      const errorData = await paidResponse.json().catch(() => ({}));
      return {
        ok: false,
        status: paidResponse.status,
        data: errorData,
        error: (errorData as { error?: string }).error || "Payment failed",
      };
    }
  }

  // Not a 402, return the response as-is
  if (response.ok) {
    return {
      ok: true,
      status: response.status,
      data: await response.json(),
    };
  } else {
    return {
      ok: false,
      status: response.status,
      data: await response.json().catch(() => null),
      error: `Request failed with status ${response.status}`,
    };
  }
}
