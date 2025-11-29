# x402 Protocol Specification (Stellar)

Quick reference for the x402 protocol on Stellar.

Source: [Coinbase x402](https://github.com/coinbase/x402)

---

## HTTP 402 Response

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [{ ...PaymentRequirements }]
}
```

---

## PaymentRequirements

```json
{
  "scheme": "exact",
  "network": "stellar-testnet",
  "maxAmountRequired": "1000000",
  "resource": "/api/content",
  "description": "Premium content",
  "mimeType": "application/json",
  "outputSchema": null,
  "payTo": "GXYZ...",
  "maxTimeoutSeconds": 300,
  "asset": "native",
  "extra": null
}
```

All fields required except `outputSchema` (optional).

---

## X-PAYMENT Header

Base64-encoded JSON:

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
    "nonce": "abc123"
  }
}
```

---

## Facilitator API

### POST /verify

**Response:**
```json
{
  "isValid": true,
  "payer": "GABC..."
}
```

Error:
```json
{
  "isValid": false,
  "invalidReason": "...",
  "payer": "GABC..."
}
```

### POST /settle

**Response:**
```json
{
  "success": true,
  "payer": "GABC...",
  "transaction": "abc123...",
  "network": "stellar-testnet"
}
```

Error:
```json
{
  "success": false,
  "errorReason": "...",
  "payer": "GABC...",
  "transaction": "",
  "network": "stellar-testnet"
}
```

### GET /supported

**Response:**
```json
{
  "kinds": [
    { "x402Version": 1, "scheme": "exact", "network": "stellar-testnet" }
  ]
}
```

---

## Stellar Details

| Item | Format |
|------|--------|
| Networks | `stellar-testnet`, `stellar` |
| Addresses | `G...` (public keys) |
| Assets | `native` or `C...` (contracts) |
| Amounts | Stroops (7 decimals: 10,000,000 = 1 unit) |
| Transactions | XDR (base64) |

---

## Fee Sponsorship

The facilitator can pay fees via fee-bump transactions:

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

Set `FACILITATOR_SECRET_KEY` to enable.
