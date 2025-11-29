// x402 Protocol Types for Stellar

export interface PaymentRequirements {
  scheme: "exact";
  network: "stellar-testnet" | "stellar";
  maxAmountRequired: string;
  asset: string;
  payTo: string;
  resource: string;
  description: string;
  mimeType?: string;
  maxTimeoutSeconds: number;
  outputSchema?: object | null;
  extra?: object | null;
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

export interface PaymentPayload {
  x402Version: number;
  scheme: "exact";
  network: "stellar-testnet" | "stellar";
  payload: StellarPayload;
}

export interface VerifyRequest {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
}

export interface VerifyResponse {
  isValid: boolean;
  invalidReason?: string | null;
  payer: string;
}

export interface SettleRequest {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
}

export interface SettleResponse {
  success: boolean;
  error?: string | null;
  transaction: string;
  network: string;
  payer: string;
}

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



