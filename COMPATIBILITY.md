# x402 Spec Compatibility

## Summary: ✅ FULLY COMPATIBLE

Our Stellar implementation follows the [Coinbase x402 specification](https://github.com/coinbase/x402) exactly.

---

## Facilitator API

### POST /verify

**Request:**
```json
{
  "x402Version": 1,
  "paymentHeader": "<base64 string>",
  "paymentRequirements": { ... }
}
```

**Response (per x402 spec):**
```json
{
  "isValid": true,
  "payer": "GABC..."
}
```

**Error Response:**
```json
{
  "isValid": false,
  "invalidReason": "Insufficient amount",
  "payer": "GABC..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `isValid` | boolean | ✅ | Whether payment is valid |
| `invalidReason` | string | ❌ | Error message (only on error) |
| `payer` | string | ❌ | Payer's address |

---

### POST /settle

**Request:**
```json
{
  "x402Version": 1,
  "paymentHeader": "<base64 string>",
  "paymentRequirements": { ... }
}
```

**Response (per x402 spec):**
```json
{
  "success": true,
  "payer": "GABC...",
  "transaction": "abc123def456...",
  "network": "stellar-testnet"
}
```

**Error Response:**
```json
{
  "success": false,
  "errorReason": "Transaction failed",
  "payer": "GABC...",
  "transaction": "",
  "network": "stellar-testnet"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `success` | boolean | ✅ | Whether settlement succeeded |
| `errorReason` | string | ❌ | Error message (only on error) |
| `payer` | string | ❌ | Payer's address |
| `transaction` | string | ✅ | Transaction hash (empty on error) |
| `network` | string | ✅ | Network identifier |

---

### GET /supported

**Response (per x402 spec):**
```json
{
  "kinds": [
    { "x402Version": 1, "scheme": "exact", "network": "stellar-testnet" }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `x402Version` | number | ✅ | Protocol version (must be 1) |
| `scheme` | string | ✅ | Payment scheme |
| `network` | string | ✅ | Network identifier |

---

## X-PAYMENT Header

**Format:** Base64-encoded JSON

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "stellar-testnet",
  "payload": {
    "signedTxXdr": "AAAA...",
    "sourceAccount": "GABC...",
    "amount": "1000000",
    "destination": "GXYZ...",
    "asset": "native",
    "validUntilLedger": 12345678,
    "nonce": "abc123..."
  }
}
```

---

## 402 Response

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [{
    "scheme": "exact",
    "network": "stellar-testnet",
    "maxAmountRequired": "100000",
    "asset": "native",
    "payTo": "GXYZ...",
    "resource": "/api/content",
    "description": "Premium content access",
    "mimeType": "application/json",
    "maxTimeoutSeconds": 300,
    "outputSchema": null,
    "extra": null
  }]
}
```

---

## Encoding

| Item | Format |
|------|--------|
| X-PAYMENT header | Base64 JSON |
| X-PAYMENT-RESPONSE header | Base64 JSON |
| Amount units | Stroops (7 decimals) |

---

## Stellar-Specific Details

| Field | Stellar Format |
|-------|---------------|
| Network IDs | `stellar-testnet`, `stellar` |
| Addresses | Public keys (`G...`) |
| Assets | `native` or contract address (`C...`) |
| Transactions | XDR (base64) |
| Amounts | Stroops (1 unit = 10,000,000 stroops) |

---

## Implementation Completeness

| Feature | Status | Notes |
|---------|--------|-------|
| /verify replay check | ✅ | Prevents duplicate payments |
| /settle idempotency | ✅ | Returns cached result for same tx |
| Transaction marking | ✅ | Marks settled after success |
| Redis persistence | ✅ | Production-ready storage |
| Fee sponsorship | ✅ | Optional fee-bump transactions |

---

## Comparison with Coinbase EVM Implementation

| Field | EVM (Coinbase) | Stellar (Ours) |
|-------|----------------|----------------|
| `x402Version` | 1 | 1 ✅ |
| `scheme` | "exact" | "exact" ✅ |
| `network` | "base-sepolia" | "stellar-testnet" ✅ |
| `payload` | EIP-712 signature | XDR transaction ✅ |
| Address format | `0x...` | `G...` ✅ |
