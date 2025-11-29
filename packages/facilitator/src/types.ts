// x402 Protocol Types for Stellar

export interface PaymentRequirements {
  scheme: "exact";
  network: "stellar-testnet" | "stellar";
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  outputSchema?: object | null; // Only this field is optional per spec
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: object | null; // Required but can be null
}

export interface StellarPayload {
  // The signed transaction envelope (XDR format, base64 encoded)
  signedTxXdr: string;
  // Source account (payer's public key)
  sourceAccount: string;
  // Amount in stroops (1 XLM = 10^7 stroops, 1 USDC = 10^6 units)
  amount: string;
  // Destination account (payTo address)
  destination: string;
  // Asset: contract address for Soroban tokens or "native" for XLM
  asset: string;
  // Expiration: ledger number after which the tx is invalid
  validUntilLedger: number;
  // Unique nonce for replay protection
  nonce: string;
}

// The decoded payment payload (what's inside the base64 X-PAYMENT header)
export interface PaymentPayload {
  x402Version: number;
  scheme: string;
  network: string;
  payload: StellarPayload;
}

// x402 Spec-compliant request body for /verify and /settle
export interface FacilitatorRequest {
  x402Version: number;
  paymentHeader: string; // Raw X-PAYMENT header string (base64 encoded)
  paymentRequirements: PaymentRequirements;
}

// x402 Spec-compliant /verify response
export interface VerifyResponse {
  isValid: boolean;
  invalidReason: string | null;
}

// x402 Spec-compliant /settle response
export interface SettleResponse {
  success: boolean;
  error: string | null;
  txHash: string | null;
  networkId: string | null;
}

// Supported (scheme, network) combinations - must match /supported endpoint
export const SUPPORTED_KINDS = [
  { scheme: "exact", network: "stellar-testnet" },
  // { scheme: "exact", network: "stellar" }, // Enable when ready for mainnet
] as const;

// Network configuration
export const STELLAR_NETWORKS = {
  "stellar-testnet": {
    horizonUrl: "https://horizon-testnet.stellar.org",
    sorobanRpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
  },
  stellar: {
    horizonUrl: "https://horizon.stellar.org",
    sorobanRpcUrl: "https://soroban.stellar.org",
    networkPassphrase: "Public Global Stellar Network ; September 2015",
  },
} as const;

// Validation result types
interface PaymentHeaderValidationSuccess {
  valid: true;
  payload: PaymentPayload;
}

interface PaymentHeaderValidationFailure {
  valid: false;
  error: string;
}

export type PaymentHeaderValidation = PaymentHeaderValidationSuccess | PaymentHeaderValidationFailure;

/**
 * Decode and validate the paymentHeader according to x402 spec.
 * 
 * Steps:
 * 1. Base64 decode the paymentHeader string
 * 2. JSON parse the decoded string
 * 3. Validate required fields: x402Version, scheme, network, payload
 * 4. Validate (scheme, network) is a supported combination
 */
export function decodeAndValidatePaymentHeader(paymentHeader: string): PaymentHeaderValidation {
  // Step 1: Base64 decode
  let decoded: string;
  try {
    decoded = Buffer.from(paymentHeader, "base64").toString("utf-8");
  } catch {
    return { valid: false, error: "Invalid paymentHeader: failed to base64 decode" };
  }

  // Step 2: JSON parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return { valid: false, error: "Invalid paymentHeader: failed to parse JSON" };
  }

  // Step 3: Validate it's an object
  if (!parsed || typeof parsed !== "object") {
    return { valid: false, error: "Invalid paymentHeader: expected JSON object" };
  }

  const obj = parsed as Record<string, unknown>;

  // Step 4: Validate required field: x402Version
  if (obj.x402Version === undefined) {
    return { valid: false, error: "Invalid paymentHeader: missing x402Version" };
  }
  if (obj.x402Version !== 1) {
    return { valid: false, error: `Invalid paymentHeader: unsupported x402Version ${obj.x402Version}` };
  }

  // Step 5: Validate required field: scheme
  if (!obj.scheme || typeof obj.scheme !== "string") {
    return { valid: false, error: "Invalid paymentHeader: missing or invalid scheme" };
  }

  // Step 6: Validate required field: network
  if (!obj.network || typeof obj.network !== "string") {
    return { valid: false, error: "Invalid paymentHeader: missing or invalid network" };
  }

  // Step 7: Validate required field: payload
  if (!obj.payload || typeof obj.payload !== "object") {
    return { valid: false, error: "Invalid paymentHeader: missing or invalid payload" };
  }

  // Step 8: Validate (scheme, network) is a supported combination
  const isSupported = SUPPORTED_KINDS.some(
    kind => kind.scheme === obj.scheme && kind.network === obj.network
  );
  if (!isSupported) {
    return { 
      valid: false, 
      error: `Unsupported (scheme, network) combination: (${obj.scheme}, ${obj.network})` 
    };
  }

  // All validations passed
  return {
    valid: true,
    payload: obj as unknown as PaymentPayload,
  };
}

// Legacy helper - kept for backward compatibility but prefer decodeAndValidatePaymentHeader
export function decodePaymentHeader(paymentHeader: string): PaymentPayload {
  const result = decodeAndValidatePaymentHeader(paymentHeader);
  if (!result.valid) {
    throw new Error(result.error);
  }
  return result.payload;
}
