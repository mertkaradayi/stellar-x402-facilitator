# Stellar x402 Facilitator

A fully-functional x402 V1-compliant payment facilitator for the Stellar blockchain.

## Status: ✅ COMPLETE

This is a **working implementation** of the x402 protocol on Stellar, with real blockchain transactions verified on testnet.

## What is x402?

x402 is an open payment protocol that leverages the HTTP 402 "Payment Required" status code to enable seamless, internet-native payments. This implementation brings x402 to Stellar.

## Quick Start

```bash
# Install dependencies
pnpm install

# Terminal 1: Start the facilitator server
pnpm --filter facilitator dev

# Terminal 2: Start the demo app
pnpm --filter demo dev

# Open http://localhost:3000
# Connect your Freighter wallet and click "Pay to Unlock"
```

## The Flow

```
1. User clicks "Pay to Unlock"
   ↓
2. GET /api/content → HTTP 402 + payment requirements
   ↓
3. User connects Freighter wallet
   ↓
4. App builds Stellar transaction
   ↓
5. User signs in Freighter popup
   ↓
6. App sends X-PAYMENT header with signed transaction
   ↓
7. Facilitator /verify → validates the transaction
   ↓
8. Facilitator /settle → submits to Stellar testnet
   ↓
9. Server returns 200 + content + X-PAYMENT-RESPONSE header
   ↓
10. Content unlocked! 🎉
```

## x402 Spec Compliance

This implementation follows the [Coinbase x402 specification](https://github.com/coinbase/x402):

| Requirement | Status |
|-------------|--------|
| 402 Response Format | ✅ |
| X-PAYMENT Header | ✅ |
| X-PAYMENT-RESPONSE Header | ✅ |
| Facilitator /verify | ✅ |
| Facilitator /settle | ✅ |
| Facilitator /supported | ✅ |
| Base64 Encoding | ✅ |

See [COMPATIBILITY.md](./COMPATIBILITY.md) and [X402-SPEC.md](./X402-SPEC.md) for full details.

## Project Structure

```
stellar-x402-facilitator/
├── packages/
│   └── facilitator/           # x402 Facilitator server
│       ├── src/
│       │   ├── index.ts       # Express server (port 4022)
│       │   ├── types.ts       # x402 TypeScript types
│       │   ├── routes/
│       │   │   ├── verify.ts  # POST /verify
│       │   │   └── settle.ts  # POST /settle
│       │   └── stellar/
│       │       ├── verify.ts  # Stellar verification
│       │       └── settle.ts  # Stellar settlement
│       └── package.json
├── apps/
│   └── demo/                  # Next.js demo app
│       ├── app/
│       │   ├── page.tsx       # Pay-to-view UI with Freighter
│       │   └── api/content/   # Protected endpoint (returns 402)
│       └── lib/
│           └── x402.ts        # Client x402 helpers
├── X402-SPEC.md               # x402 spec reference
├── COMPATIBILITY.md           # x402 spec compliance details
└── README.md
```

## API Reference

### Facilitator Endpoints

#### `GET /health`
Health check endpoint.

#### `GET /supported`
List supported (scheme, network) combinations.

```json
// Response
{
  "kinds": [
    { "scheme": "exact", "network": "stellar-testnet" }
  ]
}
```

#### `POST /verify`
Verify a payment authorization.

```json
// Request
{
  "x402Version": 1,
  "paymentHeader": "<raw X-PAYMENT header string (base64)>",
  "paymentRequirements": {
    "scheme": "exact",
    "network": "stellar-testnet",
    "maxAmountRequired": "100000",
    "asset": "C...",
    "payTo": "G..."
  }
}

// Response
{
  "isValid": true,
  "invalidReason": null
}
```

#### `POST /settle`
Execute a verified payment on the Stellar network.

```json
// Request (same as /verify)
{
  "x402Version": 1,
  "paymentHeader": "<raw X-PAYMENT header string (base64)>",
  "paymentRequirements": { ... }
}

// Response
{
  "success": true,
  "error": null,
  "txHash": "abc123def456...",
  "networkId": "stellar-testnet"
}
```

> Note: `paymentHeader` is the raw X-PAYMENT header string (base64 encoded). The facilitator decodes it internally.

## x402 Headers

- **Request**: `X-PAYMENT: <base64 encoded PaymentPayload>`
- **Response**: `X-PAYMENT-RESPONSE: <base64 encoded SettlementResponse>`

## Wallet Setup

### Freighter (Recommended)

1. Install [Freighter](https://www.freighter.app/) browser extension
2. Switch to **Testnet** in Freighter settings
3. Fund with testnet XLM:
   ```
   https://friendbot.stellar.org?addr=YOUR_PUBLIC_KEY
   ```

## Configuration

Create `.env` files as needed (optional - defaults work):

```env
# Facilitator (packages/facilitator/.env)
PORT=4022
FACILITATOR_SECRET_KEY=S...  # Optional: for fee sponsorship

# Demo (apps/demo/.env)
FACILITATOR_URL=http://localhost:4022
PAY_TO_ADDRESS=G...  # Your receiving wallet
```

## Testing

```bash
# Test 402 response
curl http://localhost:3000/api/content
# → HTTP 402 + payment requirements JSON

# Test facilitator health
curl http://localhost:4022/health
# → {"status":"ok","service":"x402-stellar-facilitator"}

# Test supported schemes
curl http://localhost:4022/supported
# → {"kinds":[{"scheme":"exact","network":"stellar-testnet"}]}
```

## Future Enhancements

| Feature | Status |
|---------|--------|
| USDC Soroban Token Support | ⏳ Using native XLM for now |
| Fee Sponsorship (Fee-bump) | ⏳ Planned |
| Production deployment | ⏳ Ready when needed |

## Resources

- [x402 Protocol Spec](https://github.com/coinbase/x402)
- [Stellar SDK](https://stellar.github.io/js-stellar-sdk/)
- [Stellar Testnet Explorer](https://stellar.expert/explorer/testnet)
- [Freighter Wallet](https://www.freighter.app/)
- [Fee-bump Transactions](https://developers.stellar.org/docs/build/guides/transactions/fee-bump-transactions)

## License

MIT
