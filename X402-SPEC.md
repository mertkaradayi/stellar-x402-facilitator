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

```typescript
{
  scheme: string;                    // e.g. "exact"
  network: string;                   // e.g. "base-sepolia", "stellar-testnet"
  maxAmountRequired: string;         // uint256 as string, atomic units
  resource: string;                  // URL of resource
  description: string;               // Human-readable description
  mimeType: string;                  // Response MIME type
  outputSchema?: object | null;      // Optional JSON schema
  payTo: string;                     // Recipient address
  maxTimeoutSeconds: number;         // Max response time
  asset: string;                     // Token contract address
  extra: object | null;              // Scheme-specific data
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
| PaymentRequirements | All fields listed above | `extra` can be null |
| X-PAYMENT | `x402Version`, `scheme`, `network`, `payload` | Base64 encoded |
| POST /verify request | `x402Version`, `paymentHeader`, `paymentRequirements` | |
| POST /verify response | `isValid`, `invalidReason` | **Only these 2 fields** |
| POST /settle request | `x402Version`, `paymentHeader`, `paymentRequirements` | |
| POST /settle response | `success`, `error`, `txHash`, `networkId` | **Exactly these field names** |
| GET /supported | `kinds` array with `scheme`, `network` | |

---

## Our Stellar Implementation Notes

For Stellar, the scheme-dependent `payload` contains:
```typescript
{
  signedTxXdr: string;      // Stellar transaction XDR
  sourceAccount: string;    // Payer's public key
  amount: string;           // Amount in stroops
  destination: string;      // Recipient's public key
  asset: string;            // Asset contract or "native"
  validUntilLedger: number;
  nonce: string;
}
```

Networks:
- `stellar-testnet` - Stellar Testnet
- `stellar` - Stellar Mainnet (future)

