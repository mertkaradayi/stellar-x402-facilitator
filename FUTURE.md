# Future Enhancements

## Current State: ✅ MVP Complete

The Stellar x402 Facilitator is fully functional with:
- Real Stellar testnet transactions
- Freighter wallet integration
- Coinbase x402 V1 spec compliance
- Working demo application

---

## Planned Enhancements

### 1. USDC Soroban Token Support
**Status:** ⏳ Planned  
**Current:** Using native XLM for payments

The current implementation uses native XLM transfers for simplicity. Adding USDC support requires:

- Soroban contract interactions
- Token authorization (SEP-41)
- Contract simulation before settlement

```typescript
// Future: Soroban token transfer
const tokenContract = new Contract(USDC_CONTRACT_ADDRESS);
const tx = new TransactionBuilder(account)
  .addOperation(tokenContract.call("transfer", ...args))
  .build();
```

**Resources:**
- [Stellar USDC](https://www.circle.com/en/usdc/stellar)
- [Soroban Token Interface](https://soroban.stellar.org/docs/reference/interfaces/token-interface)

---

### 2. Fee Sponsorship (Fee-bump Transactions)
**Status:** ⏳ Planned  
**Current:** Users pay their own transaction fees

Fee sponsorship allows the facilitator to pay transaction fees on behalf of users, improving UX:

```typescript
// Future: Fee-bump transaction
import { TransactionBuilder } from "@stellar/stellar-sdk";

const feeBumpTx = TransactionBuilder.buildFeeBumpTransaction(
  facilitatorKeypair,  // Facilitator pays fees
  "1000000",           // Max fee in stroops
  userSignedTx,        // User's inner transaction
  networkPassphrase
);
feeBumpTx.sign(facilitatorKeypair);
await server.submitTransaction(feeBumpTx);
```

**Benefits:**
- Users don't need to hold XLM for fees
- Better onboarding experience
- Facilitator can control fee spending

**Resources:**
- [Fee-bump Transactions Guide](https://developers.stellar.org/docs/build/guides/transactions/fee-bump-transactions)

---

### 3. `/supported` Endpoint
**Status:** ⏳ Optional per x402 spec

Add endpoint to list supported payment schemes and networks:

```typescript
// GET /supported
{
  "x402Version": 1,
  "schemes": ["exact"],
  "networks": ["stellar-testnet", "stellar"]
}
```

---

### 4. Production Deployment
**Status:** ⏳ Ready when needed

Deployment checklist:
- [ ] Switch to Stellar Mainnet
- [ ] Configure production USDC contract
- [ ] Set up proper environment variables
- [ ] Add rate limiting
- [ ] Add request logging
- [ ] Configure HTTPS
- [ ] Deploy facilitator to cloud (Railway, Vercel, etc.)
- [ ] Deploy demo app

---

### 5. SDK Package
**Status:** 💡 Idea

Extract client-side helpers into a standalone npm package:

```typescript
// Future: @stellar/x402-sdk
import { fetchWithX402, StellarPaymentProvider } from "@stellar/x402-sdk";

const provider = new StellarPaymentProvider({ wallet: freighter });
const response = await fetchWithX402(url, { provider });
```

---

## Contributing

Ideas and PRs welcome! Open an issue to discuss new features.



