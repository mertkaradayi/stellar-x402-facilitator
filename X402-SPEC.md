# x402 Protocol Specification Reference

This document extracts the **exact requirements** from the Coinbase x402 specification.

Source: https://github.com/coinbase/x402

---

## 1. HTTP 402 Response (Payment Required)

When a resource requires payment, the server returns HTTP 402 with this body:

```typescript
{
  x402Version: number;           // Must be 1
  accepts: PaymentRequirements[];
  error: string;
}
```

---

## 2. PaymentRequirements Object

All fields are **required** except `outputSchema` which is optional.

```typescript
{
  scheme: string;                    // REQUIRED - e.g. "exact"
  network: string;                   // REQUIRED - e.g. "base-sepolia", "stellar-testnet"
  maxAmountRequired: string;         // REQUIRED - uint256 as string, atomic units
  resource: string;                  // REQUIRED - URL of resource
  description: string;               // REQUIRED - Human-readable description
  mimeType: string;                  // REQUIRED - Response MIME type
  outputSchema?: object | null;      // OPTIONAL - JSON schema (only optional field)
  payTo: string;                     // REQUIRED - Recipient address
  maxTimeoutSeconds: number;         // REQUIRED - Max response time
  asset: string;                     // REQUIRED - Token contract address
  extra: object | null;              // REQUIRED - Scheme-specific data (can be null)
}
```

---

## 3. X-PAYMENT Header

Client sends payment as base64-encoded JSON in `X-PAYMENT` header:

```typescript
{
  x402Version: number;    // Must be 1
  scheme: string;         // Must match accepted scheme
  network: string;        // Must match accepted network
  payload: any;           // Scheme-dependent (e.g., signed transaction)
}
```

---

## 4. Facilitator API

### POST /verify

**Request:**
```typescript
{
  x402Version: number;
  paymentHeader: string;              // Raw X-PAYMENT header (base64)
  paymentRequirements: PaymentRequirements;
}
```

**Response:**
```typescript
{
  isValid: boolean;
  invalidReason: string | null;
}
```

> **Note:** Only 2 fields. No `payer` or other fields.

---

### POST /settle

**Request:**
```typescript
{
  x402Version: number;
  paymentHeader: string;              // Raw X-PAYMENT header (base64)
  paymentRequirements: PaymentRequirements;
}
```

**Response:**
```typescript
{
  success: boolean;
  error: string | null;
  txHash: string | null;
  networkId: string | null;
}
```

> **Note:** Fields are `txHash` and `networkId`, NOT `transaction` and `network`.

---

### GET /supported

**Response:**
```typescript
{
  kinds: [
    { scheme: string, network: string }
  ]
}
```

---

## 5. X-PAYMENT-RESPONSE Header

Resource server can include settlement details in response header (base64-encoded JSON).

The spec does not define the exact shape, but typical usage:
```typescript
{
  success: boolean;
  txHash: string;
  networkId: string;
}
```

---

## Summary: What MUST Be Exact

| Component | Required Fields | Notes |
|-----------|-----------------|-------|
| 402 Response | `x402Version`, `accepts`, `error` | |
| PaymentRequirements | All fields listed above | `outputSchema` optional, `extra` can be null |
| X-PAYMENT | `x402Version`, `scheme`, `network`, `payload` | Base64 encoded |
| POST /verify request | `x402Version`, `paymentHeader`, `paymentRequirements` | |
| POST /verify response | `isValid`, `invalidReason` | **Only these 2 fields** |
| POST /settle request | `x402Version`, `paymentHeader`, `paymentRequirements` | |
| POST /settle response | `success`, `error`, `txHash`, `networkId` | **Exactly these field names** |
| GET /supported | `kinds` array with `scheme`, `network` | |

---

## Stellar Implementation ("exact" scheme)

### Asset Encoding

All assets are represented by their Soroban contract address (starts with `C...`):

```typescript
// USDC on testnet
asset: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"

// Wrapped XLM (if using Soroban)
asset: "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA"

// Native XLM (classic payments)
asset: "native"
```

### Amount Units

Stellar uses **fixed 7 decimal places for ALL assets** (XLM, USDC, any token).
The smallest unit is called a "stroop" = 0.0000001 of any asset.

| Amount (stroops) | Human Readable | Notes |
|------------------|----------------|-------|
| `10000000` | 1.0 | 1 XLM, 1 USDC, 1 of any asset |
| `1000000` | 0.1 | 0.1 of any asset |
| `100000` | 0.01 | |
| `1` | 0.0000001 | Smallest possible amount |

```typescript
// All assets use the same 7-decimal precision
maxAmountRequired: "1000000" // 0.1 of any asset (XLM, USDC, etc.)
```

> **Note:** This is a hard-coded limit on Stellar - all amounts are signed 64-bit integers scaled by 10^7.

### Payload Structure

For Stellar, the `payload` in X-PAYMENT header contains:

```typescript
{
  signedTxXdr: string;      // Client-signed Stellar transaction (XDR, base64)
  sourceAccount: string;    // Payer's public key (G...)
  amount: string;           // Amount in stroops/base units
  destination: string;      // Recipient's public key (must match payTo)
  asset: string;            // Contract address or "native"
  validUntilLedger: number; // Transaction expiration ledger
  nonce: string;            // Unique nonce for replay protection
}
```

### Networks

| Network ID | Description | Horizon URL |
|------------|-------------|-------------|
| `stellar-testnet` | Stellar Testnet | https://horizon-testnet.stellar.org |
| `stellar` | Stellar Mainnet | https://horizon.stellar.org |

---

## Trust-Minimized Settlement

The facilitator follows these principles:

### 1. Transaction Integrity

- Client's signed transaction is **NEVER modified**
- Facilitator only wraps with fee-bump (if enabled)
- Core payment parameters are always validated:
  - `destination === paymentRequirements.payTo`
  - `amount >= paymentRequirements.maxAmountRequired`
  - `asset === paymentRequirements.asset`

### 2. Fee Sponsorship (Optional)

When `FACILITATOR_SECRET_KEY` is set, the facilitator wraps the client's transaction in a fee-bump:

```
┌─────────────────────────────────────┐
│ Fee-Bump Transaction                │
│ ┌─────────────────────────────────┐ │
│ │ Inner Transaction (unchanged)   │ │
│ │ - Signed by client              │ │
│ │ - Payment: client → payTo       │ │
│ └─────────────────────────────────┘ │
│ Fee paid by: facilitator            │
└─────────────────────────────────────┘
```

Reference: [Stellar Fee-Bump Transactions](https://developers.stellar.org/docs/build/guides/transactions/fee-bump-transactions)

### 3. XDR Validation

Before settlement, the facilitator parses the signed XDR and validates:

1. Transaction is well-formed
2. Contains a payment operation
3. Payment destination matches `payTo`
4. Payment amount >= `maxAmountRequired`
5. Payment asset matches required `asset`

Transactions that don't match are **rejected**.

---

## Replay Protection

Prevents the same payment from being used multiple times.

### Implementation

- In-memory cache stores `(txHash, resource)` pairs
- `/verify` checks if transaction already used → returns `isValid: false`
- `/settle` **should be idempotent**: same tx returns cached result (⚠️ **Currently not implemented**)

### Current Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| `/verify` replay check | ✅ Implemented | Uses `hasTransactionBeenUsed()` |
| `/settle` idempotency | ⏳ Pending | Should use `getCachedSettlement()` before submitting |
| Mark as settled | ⏳ Pending | Should call `markPaymentAsSettled()` after success |

### Intended Behavior (Per Spec)

| Scenario | /verify | /settle |
|----------|---------|---------|
| New transaction | `isValid: true` | Submits, caches result |
| Already settled | `isValid: false` | Returns cached success |
| Different resource, same tx | `isValid: false` | Rejected |

> **Note:** In-memory cache resets on server restart. For production, use persistent storage (Redis, PostgreSQL).

