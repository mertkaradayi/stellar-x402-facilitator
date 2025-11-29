// x402 Protocol Types for Stellar

// ============================================================================
// Error Codes (matching Coinbase x402 spec pattern)
// ============================================================================

export const StellarErrorReasons = [
  // Generic x402 errors (from Coinbase spec)
  "insufficient_funds",
  "invalid_network",
  "invalid_payload",
  "invalid_payment_requirements",
  "invalid_scheme",
  "invalid_payment",
  "payment_expired",
  "unsupported_scheme",
  "invalid_x402_version",
  "invalid_transaction_state",
  "unexpected_settle_error",
  "unexpected_verify_error",
  // Stellar-specific errors (following Coinbase naming pattern: invalid_exact_{network}_payload_*)
  "invalid_exact_stellar_payload_missing_signed_tx_xdr",
  "invalid_exact_stellar_payload_invalid_xdr",
  "invalid_exact_stellar_payload_source_account_not_found",
  "invalid_exact_stellar_payload_insufficient_balance",
  "invalid_exact_stellar_payload_amount_mismatch",
  "invalid_exact_stellar_payload_destination_mismatch",
  "invalid_exact_stellar_payload_asset_mismatch",
  "invalid_exact_stellar_payload_network_mismatch",
  "invalid_exact_stellar_payload_missing_required_fields",
  "invalid_exact_stellar_payload_transaction_expired",
  "invalid_exact_stellar_payload_transaction_already_used",
  "settle_exact_stellar_transaction_failed",
  "settle_exact_stellar_fee_bump_failed",
] as const;

export type StellarErrorReason = (typeof StellarErrorReasons)[number];

// ============================================================================
// PaymentRequirements (per x402 spec section 5.1.2)
// ============================================================================

export interface PaymentRequirements {
  scheme: "exact";
  network: "stellar-testnet" | "stellar";
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  outputSchema?: Record<string, unknown> | null; // Optional per spec
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra?: Record<string, unknown> | null; // Optional per Coinbase spec
}

export interface StellarPayload {
  // The signed transaction envelope (XDR format, base64 encoded)
  signedTxXdr: string;
  // Source account (payer's public key)
  sourceAccount: string;
  // Amount in stroops (all Stellar assets use 7 decimals: 1 unit = 10^7 stroops)
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
// Supports both formats:
// 1. paymentHeader: base64 encoded string (legacy/HTTP transport)
// 2. paymentPayload: decoded JSON object (Coinbase useFacilitator.ts format)
export interface FacilitatorRequest {
  x402Version: number;
  paymentHeader?: string; // Raw X-PAYMENT header string (base64 encoded)
  paymentPayload?: PaymentPayload; // Decoded payment payload object
  paymentRequirements: PaymentRequirements;
}

// x402 Spec-compliant /verify response
// Per Coinbase x402 spec: { isValid, invalidReason?, payer? }
export interface VerifyResponse {
  isValid: boolean;
  invalidReason?: string;
  payer?: string;
}

// x402 Spec-compliant /settle response
// Per Coinbase x402 spec: { success, errorReason?, payer?, transaction, network }
export interface SettleResponse {
  success: boolean;
  errorReason?: string;
  payer?: string;
  transaction: string;
  network: string;
}

// Supported (scheme, network) combinations - must match /supported endpoint
// Per x402 spec: each kind must include x402Version, scheme, network
export const SUPPORTED_KINDS = [
  { x402Version: 1, scheme: "exact", network: "stellar-testnet" },
  // { x402Version: 1, scheme: "exact", network: "stellar" }, // Enable when ready for mainnet
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
 * Extract and validate payment payload from either format:
 * 1. paymentHeader: base64 encoded string
 * 2. paymentPayload: decoded JSON object
 * 
 * This supports both the HTTP transport format and Coinbase's useFacilitator format.
 */
export function extractPaymentPayload(
  paymentHeader?: string,
  paymentPayload?: PaymentPayload
): PaymentHeaderValidation {
  // Prefer paymentPayload if provided (Coinbase format)
  if (paymentPayload && typeof paymentPayload === "object") {
    return validatePaymentPayload(paymentPayload);
  }
  
  // Fall back to paymentHeader (base64 encoded string)
  if (paymentHeader) {
    return decodeAndValidatePaymentHeader(paymentHeader);
  }
  
  return { 
    valid: false, 
    error: "Either paymentHeader or paymentPayload is required" 
  };
}

/**
 * Validate a decoded payment payload object
 */
export function validatePaymentPayload(payload: unknown): PaymentHeaderValidation {
  // Validate it's an object
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "Invalid paymentPayload: expected JSON object" };
  }

  const obj = payload as Record<string, unknown>;

  // Validate required field: x402Version
  if (obj.x402Version === undefined) {
    return { valid: false, error: "Invalid paymentPayload: missing x402Version" };
  }
  if (obj.x402Version !== 1) {
    return { valid: false, error: `Invalid paymentPayload: unsupported x402Version ${obj.x402Version}` };
  }

  // Validate required field: scheme
  if (!obj.scheme || typeof obj.scheme !== "string") {
    return { valid: false, error: "Invalid paymentPayload: missing or invalid scheme" };
  }

  // Validate required field: network
  if (!obj.network || typeof obj.network !== "string") {
    return { valid: false, error: "Invalid paymentPayload: missing or invalid network" };
  }

  // Validate required field: payload
  if (!obj.payload || typeof obj.payload !== "object") {
    return { valid: false, error: "Invalid paymentPayload: missing or invalid payload" };
  }

  // Validate (scheme, network) is a supported combination
  const isSupported = SUPPORTED_KINDS.some(
    kind => kind.scheme === obj.scheme && kind.network === obj.network
  );
  if (!isSupported) {
    return { 
      valid: false, 
      error: `Unsupported (scheme, network) combination: (${obj.scheme}, ${obj.network})` 
    };
  }

  return {
    valid: true,
    payload: obj as unknown as PaymentPayload,
  };
}

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
