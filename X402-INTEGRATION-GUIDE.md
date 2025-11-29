# x402 Protocol Integration Guide for Other Chains

This document specifies the **exact formats** required to implement the x402 protocol for blockchain networks other than Stellar. All formats are derived from the Coinbase x402 specification.

Source: https://github.com/coinbase/x402

---

## Table of Contents

1. [Protocol Flow (Sequence Diagram)](#protocol-flow-sequence-diagram)
2. [Core Protocol Formats (Chain-Agnostic)](#core-protocol-formats-chain-agnostic)
3. [Chain-Specific Implementation Requirements](#chain-specific-implementation-requirements)
4. [Facilitator API Implementation](#facilitator-api-implementation)
5. [Validation Requirements](#validation-requirements)
6. [Example: Stellar Implementation Reference](#example-stellar-implementation-reference)

---

## Protocol Flow (Sequence Diagram)

The x402 protocol follows this sequence of interactions:

### Standard Flow

1. **Client → Server:** `GET /api` - Client requests protected resource
2. **Server → Client:** `402 Payment Required` - Server responds with payment requirements
3. **Client:** Selects payment method and creates payment payload
4. **Client → Server:** `GET /api` with `X-PAYMENT: <base64-payload>` header
5. **Server → Facilitator:** `POST /verify` - Server verifies payment with facilitator
6. **Facilitator → Server:** Verification response (`{ isValid, invalidReason }`)
7. **Server:** (Optional) Does work to fulfill request (prepare response data)
8. **Server → Facilitator:** `POST /settle` - Server requests payment settlement
9. **Facilitator → Blockchain:** Submit transaction with signature
10. **Blockchain → Facilitator:** Transaction confirmed
11. **Facilitator → Server:** Settlement response (`{ success, error, txHash, networkId }`)
12. **Server → Client:** Response with `X-PAYMENT-RESPONSE` header containing settlement details

### Optimized Flow (Faster Response Times)

For faster API response times, the server can optionally:

- **Return response after verification (step 6)** without awaiting settlement
- **Return response after initiating settlement (step 8)** without awaiting blockchain confirmation

In this optimized flow:
- The server returns the resource to the client immediately after verification or settlement initiation
- Settlement continues asynchronously in the background
- Additional latency is only the facilitator API round trip time, not the blockchain confirmation time
- The `X-PAYMENT-RESPONSE` header may indicate pending settlement

**Trade-offs:**
- ✅ Faster API response times
- ✅ Better user experience (lower latency)
- ⚠️ Payment may still be pending when response is returned
- ⚠️ Requires handling of settlement failures after response is sent

### Current Implementation Flow

Our Stellar implementation follows the **standard flow** and:
- ✅ Verifies payment before settlement
- ✅ Awaits blockchain confirmation before returning response
- ✅ Includes settlement details in `X-PAYMENT-RESPONSE` header
- ⚠️ Does not perform "work to fulfill request" between verify and settle (calls settle immediately after verify)

**Note:** The "do work" step (step 7) is optional and can be performed:
- Before settlement (between verify and settle)
- After settlement (after blockchain confirmation)
- In parallel with settlement (for faster responses)

---

## Core Protocol Formats (Chain-Agnostic)

These formats are **mandatory** and must be implemented exactly as specified, regardless of the blockchain.

### 1. HTTP 402 Response (Payment Required)

When a resource requires payment, the server **MUST** return HTTP status `402` with this exact body structure:

```typescript
{
  x402Version: number;           // REQUIRED - Must be 1
  accepts: PaymentRequirements[]; // REQUIRED - Array of accepted payment options
  error: string;                  // REQUIRED - Human-readable error message
}
```

**Example:**
```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "ethereum-sepolia",
      "maxAmountRequired": "1000000000000000000",
      "resource": "/api/content",
      "description": "Premium content access",
      "mimeType": "application/json",
      "outputSchema": null,
      "payTo": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "maxTimeoutSeconds": 300,
      "asset": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "extra": null
    }
  ]
}
```

---

### 2. PaymentRequirements Object

All fields are **required** except `outputSchema` which is optional. The `extra` field is required but can be `null`.

```typescript
{
  scheme: string;                    // REQUIRED - Payment scheme identifier (e.g., "exact")
  network: string;                   // REQUIRED - Network identifier (e.g., "ethereum-sepolia", "base-mainnet")
  maxAmountRequired: string;         // REQUIRED - uint256 as string, in atomic units (wei, satoshi, stroops, etc.)
  resource: string;                  // REQUIRED - URL of the protected resource
  description: string;               // REQUIRED - Human-readable description of what payment unlocks
  mimeType: string;                  // REQUIRED - Expected response MIME type (e.g., "application/json")
  outputSchema?: object | null;      // OPTIONAL - JSON schema for response validation (only optional field)
  payTo: string;                     // REQUIRED - Recipient address on the blockchain
  maxTimeoutSeconds: number;         // REQUIRED - Maximum time in seconds to wait for payment confirmation
  asset: string;                     // REQUIRED - Token contract address or native asset identifier
  extra: object | null;              // REQUIRED - Scheme-specific data (can be null)
}
```

**Field Validation Rules:**
- `scheme`: Must be a non-empty string
- `network`: Must be a non-empty string
- `maxAmountRequired`: Must be a valid uint256 string (no decimals, atomic units only)
- `resource`: Must be a valid URL path
- `description`: Must be a non-empty string
- `mimeType`: Must be a valid MIME type string
- `outputSchema`: Optional, can be `null` or a valid JSON schema object
- `payTo`: Must be a valid blockchain address format for the network
- `maxTimeoutSeconds`: Must be a positive integer
- `asset`: Must be a valid contract address or native asset identifier
- `extra`: Required field, but value can be `null` or an object

---

### 3. X-PAYMENT Header

The client sends payment information in the `X-PAYMENT` HTTP header as **base64-encoded JSON**.

**Header Format:**
```
X-PAYMENT: <base64-encoded-json>
```

**Decoded JSON Structure:**
```typescript
{
  x402Version: number;    // REQUIRED - Must be 1
  scheme: string;         // REQUIRED - Must match one of the accepted schemes
  network: string;        // REQUIRED - Must match one of the accepted networks
  payload: any;           // REQUIRED - Scheme-dependent payment data (chain-specific)
}
```

**Encoding Process:**
1. Create the JSON object with `x402Version`, `scheme`, `network`, and `payload`
2. Stringify the JSON object
3. Base64 encode the string
4. Set as the `X-PAYMENT` header value

**Decoding Process (Facilitator):**
1. Read the `X-PAYMENT` header value
2. Base64 decode the string
3. JSON parse the decoded string
4. Validate required fields: `x402Version === 1`, `scheme`, `network`, `payload`

---

### 4. X-PAYMENT-RESPONSE Header (Optional)

The resource server can optionally include settlement details in the `X-PAYMENT-RESPONSE` header (base64-encoded JSON).

**Decoded JSON Structure (typical usage):**
```typescript
{
  success: boolean;      // Payment settlement status
  txHash: string;        // Transaction hash
  networkId: string;     // Network identifier
}
```

**Note:** The exact shape is not strictly defined in the spec, but this structure is commonly used.

---

## Chain-Specific Implementation Requirements

While the core protocol is chain-agnostic, each blockchain requires specific implementations for the `payload` field and validation logic.

### Required Chain-Specific Components

#### 1. Payload Structure

The `payload` field in the X-PAYMENT header is **chain-specific**. You must define:

```typescript
interface ChainSpecificPayload {
  // Required fields depend on the chain
  // Examples:
  signedTransaction: string;      // Signed transaction (format depends on chain)
  sourceAddress: string;          // Payer's address
  amount: string;                 // Amount in atomic units
  destination: string;            // Recipient address (must match payTo)
  asset: string;                  // Asset identifier
  nonce?: string;                 // Replay protection nonce (if applicable)
  // ... other chain-specific fields
}
```

#### 2. Amount Units

Each chain uses different atomic units. You must document:

| Chain | Native Asset | Atomic Unit | Decimals | Example |
|-------|--------------|-------------|----------|---------|
| Ethereum | ETH | wei | 18 | `1000000000000000000` = 1 ETH |
| Bitcoin | BTC | satoshi | 8 | `100000000` = 1 BTC |
| Stellar | XLM | stroop | 7 | `10000000` = 1 XLM |
| Solana | SOL | lamport | 9 | `1000000000` = 1 SOL |

**Important:** `maxAmountRequired` in PaymentRequirements must always be in atomic units as a string.

#### 3. Asset Encoding

Define how assets are represented:

- **Native assets:** Use a special identifier (e.g., `"native"`, `"ETH"`, `"BTC"`)
- **ERC-20 tokens:** Use contract address (e.g., `"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"`)
- **Other standards:** Document the format (e.g., SPL tokens, Soroban contracts)

#### 4. Network Identifiers

Define standard network identifiers for your chain:

```typescript
// Example for Ethereum
const NETWORKS = {
  "ethereum-mainnet": { ... },
  "ethereum-sepolia": { ... },
  "base-mainnet": { ... },
  "base-sepolia": { ... },
} as const;
```

#### 5. Transaction Format

Document how signed transactions are represented:

- **Ethereum:** RLP-encoded, hex string, or EIP-1559 format
- **Bitcoin:** Raw transaction hex or PSBT
- **Stellar:** XDR (base64)
- **Solana:** Base58-encoded transaction

---

## Facilitator API Implementation

The facilitator **MUST** implement these three endpoints exactly as specified.

### GET /supported

Returns the list of supported (scheme, network) combinations.

**Response:**
```typescript
{
  kinds: [
    { scheme: string, network: string }
  ]
}
```

**Example:**
```json
{
  "kinds": [
    { "scheme": "exact", "network": "ethereum-sepolia" },
    { "scheme": "exact", "network": "base-mainnet" }
  ]
}
```

---

### POST /verify

Verifies that a payment is valid before settlement.

**Request:**
```typescript
{
  x402Version: number;              // REQUIRED - Must be 1
  paymentHeader: string;             // REQUIRED - Raw X-PAYMENT header (base64 string)
  paymentRequirements: PaymentRequirements; // REQUIRED - Payment requirements from 402 response
}
```

**Response:**
```typescript
{
  isValid: boolean;                   // REQUIRED - Whether payment is valid
  invalidReason: string | null;       // REQUIRED - Error message if invalid, null if valid
}
```

**Important:** The response **MUST** contain exactly these two fields. No additional fields are allowed.

**Validation Requirements:**
1. `x402Version` must be 1
2. `paymentHeader` must be valid base64 and decode to valid JSON
3. Decoded header must have `x402Version === 1`, `scheme`, `network`, `payload`
4. `scheme` and `network` must match `paymentRequirements`
5. `payload` must be valid for the chain
6. Payment amount must be >= `maxAmountRequired`
7. Destination must match `payTo`
8. Asset must match `asset` (if specified)
9. Transaction must not have been used before (replay protection)

---

### POST /settle

Submits the payment transaction to the blockchain.

**Request:**
```typescript
{
  x402Version: number;              // REQUIRED - Must be 1
  paymentHeader: string;             // REQUIRED - Raw X-PAYMENT header (base64 string)
  paymentRequirements: PaymentRequirements; // REQUIRED - Payment requirements from 402 response
}
```

**Response:**
```typescript
{
  success: boolean;                  // REQUIRED - Whether settlement succeeded
  error: string | null;              // REQUIRED - Error message if failed, null if succeeded
  txHash: string | null;            // REQUIRED - Transaction hash if successful, null if failed
  networkId: string | null;         // REQUIRED - Network identifier if successful, null if failed
}
```

**Important:** 
- Field names are **exactly** `txHash` and `networkId` (NOT `transaction` and `network`)
- Response must contain exactly these four fields

**Settlement Requirements:**
1. Validate payment (same as `/verify`)
2. Check replay protection (transaction not already used)
3. Submit transaction to blockchain
4. Return transaction hash and network ID on success
5. Handle errors gracefully and return descriptive error messages

---

## Validation Requirements

### Payment Header Validation

The facilitator **MUST** validate the X-PAYMENT header as follows:

1. **Base64 Decode:** Decode the header string
2. **JSON Parse:** Parse the decoded string as JSON
3. **Type Check:** Ensure result is an object
4. **Required Fields:**
   - `x402Version` must exist and equal `1`
   - `scheme` must exist and be a non-empty string
   - `network` must exist and be a non-empty string
   - `payload` must exist and be an object
5. **Supported Combination:** `(scheme, network)` must be in the supported list

### Payment Requirements Validation

When validating against `PaymentRequirements`:

1. **Network Match:** `network` from header must match `paymentRequirements.network`
2. **Scheme Match:** `scheme` from header must match `paymentRequirements.scheme`
3. **Amount Check:** Payment amount (from payload) must be >= `maxAmountRequired`
4. **Destination Check:** Payment destination (from payload) must equal `payTo`
5. **Asset Check:** Payment asset (from payload) must match `asset` (if specified in requirements)

### Chain-Specific Validation

Each chain implementation must validate:

1. **Transaction Format:** Signed transaction is valid for the chain
2. **Account Existence:** Source account exists on the blockchain
3. **Balance Sufficiency:** Source account has sufficient balance
4. **Transaction Validity:** Transaction is well-formed and can be submitted
5. **Replay Protection:** Transaction has not been used before

---

## Example: Stellar Implementation Reference

The Stellar implementation serves as a reference for how to structure chain-specific code.

### Stellar Payload Structure

```typescript
interface StellarPayload {
  signedTxXdr: string;        // Signed Stellar transaction (XDR format, base64)
  sourceAccount: string;       // Payer's public key (G...)
  amount: string;              // Amount in stroops (7 decimals: 1 unit = 10^7 stroops)
  destination: string;        // Recipient's public key (must match payTo)
  asset: string;              // Contract address (C...) or "native" for XLM
  validUntilLedger: number;   // Transaction expiration ledger
  nonce: string;              // Unique nonce for replay protection
}
```

### Stellar Amount Units

- **Atomic Unit:** stroop
- **Decimals:** 7 (fixed for all assets)
- **Conversion:** 1 unit = 10,000,000 stroops
- **Example:** `"1000000"` = 0.1 XLM/USDC/any asset

### Stellar Asset Encoding

- **Native XLM:** `"native"`
- **Soroban Tokens:** Contract address starting with `C...`
- **Example:** `"CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"` (USDC on testnet)

### Stellar Network Identifiers

- `"stellar-testnet"` - Stellar Testnet
- `"stellar"` - Stellar Mainnet

### Stellar Verification Steps

1. Parse XDR transaction
2. Validate transaction structure
3. Check payment operation exists
4. Verify destination matches `payTo`
5. Verify amount >= `maxAmountRequired`
6. Verify asset matches
7. Check account balance (for native XLM)
8. Check replay protection

### Stellar Settlement Steps

1. Parse signed XDR transaction
2. Optionally wrap in fee-bump (if facilitator key configured)
3. Submit to Horizon API
4. Return transaction hash and network ID

---

## Implementation Checklist

When implementing x402 for a new chain, ensure:

### Core Protocol
- [ ] HTTP 402 response format matches exactly
- [ ] PaymentRequirements object has all required fields
- [ ] X-PAYMENT header encoding/decoding works correctly
- [ ] Base64 encoding/decoding is correct

### Facilitator API
- [ ] GET /supported returns correct format
- [ ] POST /verify accepts correct request format
- [ ] POST /verify returns exactly `{ isValid, invalidReason }`
- [ ] POST /settle accepts correct request format
- [ ] POST /settle returns exactly `{ success, error, txHash, networkId }`

### Chain-Specific
- [ ] Payload structure is documented
- [ ] Amount units are documented (atomic units)
- [ ] Asset encoding is documented
- [ ] Network identifiers are standardized
- [ ] Transaction format is documented
- [ ] Verification logic validates all requirements
- [ ] Settlement logic submits transactions correctly
- [ ] Replay protection is implemented
- [ ] Error handling is comprehensive

### Testing
- [ ] Test with valid payments
- [ ] Test with invalid payments (wrong amount, wrong destination, etc.)
- [ ] Test replay protection
- [ ] Test network mismatch
- [ ] Test scheme mismatch
- [ ] Test invalid transaction formats
- [ ] Test insufficient balance scenarios

---

## Summary: Exact Field Names

| Component | Field Names | Notes |
|-----------|-------------|-------|
| 402 Response | `x402Version`, `accepts`, `error` | All required |
| PaymentRequirements | `scheme`, `network`, `maxAmountRequired`, `resource`, `description`, `mimeType`, `payTo`, `maxTimeoutSeconds`, `asset`, `extra` | `outputSchema` optional, `extra` can be null |
| X-PAYMENT | `x402Version`, `scheme`, `network`, `payload` | Base64 encoded |
| POST /verify request | `x402Version`, `paymentHeader`, `paymentRequirements` | All required |
| POST /verify response | `isValid`, `invalidReason` | **Only these 2 fields** |
| POST /settle request | `x402Version`, `paymentHeader`, `paymentRequirements` | All required |
| POST /settle response | `success`, `error`, `txHash`, `networkId` | **Exactly these 4 fields** |
| GET /supported response | `kinds` | Array of `{ scheme, network }` |

---

## Additional Notes

### Trust-Minimized Settlement

The facilitator should follow trust-minimized principles:

1. **Never modify client transactions:** The client's signed transaction should be submitted as-is (except for optional fee sponsorship)
2. **Validate before settlement:** Always verify payment matches requirements before submitting
3. **Replay protection:** Prevent the same transaction from being used multiple times
4. **Idempotent settlement:** Same transaction should return cached result if already settled

### Fee Sponsorship (Optional)

Some chains support fee sponsorship (e.g., Stellar fee-bump, EIP-1559 maxFeePerGas). If implemented:

- Client's transaction should remain unchanged
- Only fee payment mechanism should change
- Core payment parameters must still be validated

### Replay Protection

Implement replay protection to prevent:

- Same transaction unlocking multiple resources
- Double-spending attacks
- Resource server accepting duplicate payments

**Implementation options:**
- In-memory cache (for development/demos)
- Persistent storage (Redis, PostgreSQL) for production
- Chain-specific mechanisms (nonces, sequence numbers)

---

## References

- Coinbase x402 Specification: https://github.com/coinbase/x402
- Stellar Implementation: See `packages/facilitator/src/stellar/` in this repository
- X402 Spec Reference: See `X402-SPEC.md` in this repository

