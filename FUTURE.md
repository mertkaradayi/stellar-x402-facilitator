# Future Enhancements

## Current State: ✅ Core Features Complete (with minor gaps)

The Stellar x402 Facilitator is fully functional with:
- Real Stellar testnet transactions
- Freighter wallet integration
- Coinbase x402 V1 spec compliance
- Working demo application
- **XDR transaction validation**
- **Replay protection (partial: `/verify` only)**
- **Fee sponsorship (fee-bump transactions)**

---

## Completed Features

### ✅ Fee Sponsorship (Fee-bump Transactions)
**Status:** ✅ Implemented

The facilitator can pay transaction fees on behalf of users when `FACILITATOR_SECRET_KEY` is set:

```typescript
// Fee-bump wraps user's transaction without modifying it
const feeBumpTx = TransactionBuilder.buildFeeBumpTransaction(
  facilitatorKeypair,  // Facilitator pays fees
  "1000000",           // Max fee in stroops
  userSignedTx,        // User's inner transaction (unchanged)
  networkPassphrase
);
```

**Benefits:**
- Users don't need to hold XLM for fees
- Better onboarding experience
- Inner transaction integrity preserved

---

### ✅ XDR Transaction Validation
**Status:** ✅ Implemented

The facilitator parses signed XDR transactions and validates:
- Payment destination matches `payTo`
- Payment amount >= `maxAmountRequired`
- Payment asset matches required `asset`
- Transaction signature is valid

Transactions that don't match requirements are **rejected**.

---

### ⚠️ Replay Protection
**Status:** ⚠️ Partially Implemented (In-memory)

Current state:
- ✅ `/verify` rejects already-used transactions
- ⏳ `/settle` idempotency not yet implemented (should return cached result for same tx)
- ⏳ Transactions not marked as settled after successful settlement

**Next Steps:**
- Add idempotency check in `/settle` route (check cache before submitting)
- Mark transactions as settled after successful settlement
- Use `getCachedSettlement()` and `markPaymentAsSettled()` from replay-protection module

---

## Planned Enhancements

### 1. USDC Soroban Token Support
**Status:** ⏳ Planned  
**Current:** Using native XLM for payments

Adding USDC support requires:
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

### 2. Persistent Replay Protection
**Status:** ⏳ Planned  
**Current:** In-memory storage (resets on restart)

For production, replace in-memory Map with:
- Redis (fast, simple)
- PostgreSQL (durable, queryable)

```typescript
// Future: Redis-backed replay protection
import { createClient } from "redis";

const redis = createClient();
await redis.set(`settled:${txHash}`, JSON.stringify(result), { EX: 86400 });
```

---

### 3. Production Deployment
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
- [ ] Persistent replay protection storage

---

### 4. SDK Package
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
