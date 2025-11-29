# Technology Recommendations for Missing Pieces

This document recommends technologies to implement the missing pieces in the x402 facilitator.

---

## Overview

| Missing Piece | Technology Needed | Priority |
|---------------|------------------|----------|
| Settle Idempotency | Persistent Storage | 🔴 Critical |
| Mark as Settled | Persistent Storage | 🔴 Critical |
| Replay Protection | Persistent Storage | 🟡 Important |
| Async Settlement | Job Queue (Optional) | 🟢 Optional |
| Do Work Step | Code Organization | 🟢 Optional |

---

## 1. Persistent Storage (Critical)

**Required for:** Settle idempotency, Mark as settled, Replay protection

### Option A: Redis (Recommended for MVP/Production) ⭐

**Why Redis:**
- ✅ Fast in-memory storage (perfect for cache-like operations)
- ✅ Built-in TTL support (auto-expire old records)
- ✅ Simple key-value operations (exactly what we need)
- ✅ Low latency (critical for facilitator performance)
- ✅ Easy to deploy (Redis Cloud, Upstash, Railway)
- ✅ Atomic operations (SET NX for idempotency)

**Use Cases:**
- Store settlement records: `SET settled:${txHash} ${json} EX 86400`
- Check idempotency: `GET settled:${txHash}`
- Replay protection: `SETNX used:${txHash}:${resource}`

**Packages:**
```bash
pnpm add redis
pnpm add -D @types/redis
```

**Example Implementation:**
```typescript
import { createClient } from 'redis';

const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

// Check cached settlement
const cached = await redis.get(`settled:${txHash}`);
if (cached) return JSON.parse(cached);

// Mark as settled
await redis.setEx(
  `settled:${txHash}`,
  86400, // 24 hours TTL
  JSON.stringify(settlementResponse)
);
```

**Deployment Options:**
- **Redis Cloud** (free tier: 30MB)
- **Upstash** (serverless, pay-per-use)
- **Railway** (easy deployment)
- **Docker** (self-hosted)

**Cost:** Free tier available, ~$0.10-0.50/month for small scale

---

### Option B: PostgreSQL (Recommended for Complex Queries)

**Why PostgreSQL:**
- ✅ Durable, ACID-compliant
- ✅ Rich querying (analytics, reporting)
- ✅ Relationships (if you need to link to other data)
- ✅ Full-text search (if needed later)
- ✅ Better for complex data structures

**Use Cases:**
- Store settlement records with metadata
- Query by resource, date, network
- Analytics and reporting
- Audit trails

**Packages:**
```bash
pnpm add pg
pnpm add -D @types/pg
# OR use an ORM
pnpm add drizzle-orm
pnpm add drizzle-kit -D
```

**Example Schema:**
```sql
CREATE TABLE settlements (
  tx_hash VARCHAR(64) PRIMARY KEY,
  resource VARCHAR(255) NOT NULL,
  network_id VARCHAR(50) NOT NULL,
  settled_at TIMESTAMP DEFAULT NOW(),
  response JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_resource ON settlements(resource);
CREATE INDEX idx_settled_at ON settlements(settled_at);
```

**Deployment Options:**
- **Supabase** (free tier: 500MB)
- **Neon** (serverless Postgres, free tier)
- **Railway** (easy deployment)
- **Docker** (self-hosted)

**Cost:** Free tier available, ~$0-5/month for small scale

---

### Option C: SQLite (Good for Development/Small Scale)

**Why SQLite:**
- ✅ Zero configuration
- ✅ File-based (easy to backup)
- ✅ Good for development/testing
- ✅ No separate server needed
- ⚠️ Not ideal for production (concurrent writes)

**Use Cases:**
- Development environment
- Testing
- Small-scale deployments (< 100 req/s)

**Packages:**
```bash
pnpm add better-sqlite3
pnpm add -D @types/better-sqlite3
```

**Example:**
```typescript
import Database from 'better-sqlite3';

const db = new Database('settlements.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS settlements (
    tx_hash TEXT PRIMARY KEY,
    resource TEXT NOT NULL,
    response TEXT NOT NULL,
    settled_at INTEGER DEFAULT (strftime('%s', 'now'))
  )
`);
```

---

## 2. Job Queue (Optional - for Async Settlement)

**Required for:** Optimized flow (faster response times)

### Option A: BullMQ (Recommended) ⭐

**Why BullMQ:**
- ✅ Built on Redis (reuse existing infrastructure)
- ✅ Reliable job processing
- ✅ Retry logic built-in
- ✅ Job prioritization
- ✅ Rate limiting
- ✅ Progress tracking

**Use Cases:**
- Async settlement (don't block API response)
- Retry failed settlements
- Batch processing

**Packages:**
```bash
pnpm add bullmq
```

**Example:**
```typescript
import { Queue } from 'bullmq';

const settlementQueue = new Queue('settlements', {
  connection: { host: 'localhost', port: 6379 }
});

// Add settlement job (non-blocking)
await settlementQueue.add('settle', {
  paymentHeader,
  paymentRequirements
});

// Worker processes jobs
const worker = new Worker('settlements', async (job) => {
  return await settlePayment(job.data);
});
```

**Deployment:** Requires Redis (same as storage option)

---

### Option B: Inngest (Serverless Jobs)

**Why Inngest:**
- ✅ Serverless (no infrastructure)
- ✅ Built-in retries
- ✅ Event-driven
- ✅ Free tier available

**Use Cases:**
- Async settlement
- Event-driven workflows

**Packages:**
```bash
pnpm add inngest
```

**Example:**
```typescript
import { Inngest } from 'inngest';

const inngest = new Inngest({ id: 'x402-facilitator' });

// Trigger async settlement
await inngest.send({
  name: 'payment/settle',
  data: { paymentHeader, paymentRequirements }
});
```

**Cost:** Free tier: 25k events/month

---

### Option C: Simple Promise (No External Dependency)

**Why Simple Promise:**
- ✅ No infrastructure needed
- ✅ Good for MVP
- ⚠️ No retry logic
- ⚠️ Jobs lost on server restart

**Use Cases:**
- Quick implementation
- Low-volume scenarios

**Example:**
```typescript
// Fire and forget
settlePayment(paymentHeader, paymentRequirements)
  .catch(err => console.error('Settlement failed:', err));

// Return immediately
return response;
```

---

## 3. Code Organization (No New Tech)

**Required for:** "Do work" step

**Solution:** Just organize code better - no new technology needed.

**Example:**
```typescript
// Before
const verifyResult = await verifyPayment();
const settleResult = await settlePayment();
return response;

// After
const verifyResult = await verifyPayment();
const responseData = await prepareResponseData(); // "Do work"
const settleResult = await settlePayment();
return response;
```

---

## Recommended Technology Stack

### For MVP / Small Scale

```
✅ Redis (Upstash/Redis Cloud)
   - Persistent storage for replay protection
   - Settlement cache
   - Simple, fast, cheap

✅ Simple Promise (no queue)
   - Fire-and-forget async settlement
   - Good enough for MVP
```

**Total Cost:** ~$0-5/month

---

### For Production / Medium Scale

```
✅ Redis (Upstash/Redis Cloud)
   - Persistent storage
   - Settlement cache

✅ BullMQ
   - Reliable async settlement
   - Retry logic
   - Uses same Redis instance

✅ PostgreSQL (Supabase/Neon) - Optional
   - If you need analytics/reporting
   - If you need complex queries
```

**Total Cost:** ~$5-20/month

---

### For Enterprise / Large Scale

```
✅ Redis Cluster
   - High availability
   - Sharding

✅ BullMQ with Redis
   - Job queue with workers

✅ PostgreSQL (managed)
   - Analytics and reporting
   - Audit trails

✅ Monitoring (Sentry, DataDog)
   - Error tracking
   - Performance monitoring
```

**Total Cost:** ~$50-200/month

---

## Implementation Priority

### Phase 1: Critical (Week 1)

1. **Add Redis** for persistent storage
   - Replace in-memory Map with Redis
   - Implement `getCachedSettlement()`
   - Implement `markPaymentAsSettled()`
   - Add replay protection checks

**Tech:** Redis (Upstash free tier)

---

### Phase 2: Important (Week 2)

2. **Add idempotency to `/settle`**
   - Check cache before submitting
   - Return cached result if exists

**Tech:** Redis (already added in Phase 1)

---

### Phase 3: Optional (Week 3+)

3. **Add async settlement** (if needed)
   - Use BullMQ or simple promises
   - Don't block API response

**Tech:** BullMQ or simple Promise

4. **Add PostgreSQL** (if analytics needed)
   - Store settlement records
   - Query and report

**Tech:** Supabase or Neon

---

## Quick Start: Redis Implementation

### 1. Install Dependencies

```bash
cd packages/facilitator
pnpm add redis
pnpm add -D @types/redis
```

### 2. Create Redis Client

```typescript
// src/storage/redis.ts
import { createClient } from 'redis';

export const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redis.on('error', (err) => console.error('Redis Client Error', err));
await redis.connect();
```

### 3. Update Replay Protection

```typescript
// src/replay-protection.ts
import { redis } from './storage/redis.js';

export async function getCachedSettlement(txHash: string): Promise<SettleResponse | null> {
  const cached = await redis.get(`settled:${txHash}`);
  return cached ? JSON.parse(cached) : null;
}

export async function markPaymentAsSettled(
  txHash: string,
  resource: string,
  response: SettleResponse
): Promise<void> {
  await redis.setEx(
    `settled:${txHash}`,
    86400, // 24 hours
    JSON.stringify(response)
  );
  await redis.setEx(
    `used:${txHash}:${resource}`,
    86400,
    '1'
  );
}
```

### 4. Update Settle Route

```typescript
// src/routes/settle.ts
import { getCachedSettlement, markPaymentAsSettled } from '../replay-protection.js';

// Before settling, check cache
const cached = await getCachedSettlement(txHash);
if (cached) {
  return res.json(cached);
}

// After successful settlement
if (response.success && response.txHash) {
  await markPaymentAsSettled(response.txHash, paymentRequirements.resource, response);
}
```

---

## Environment Variables

Add to `.env`:

```bash
# Redis (choose one)
REDIS_URL=redis://localhost:6379
# OR
REDIS_URL=redis://default:password@upstash-redis:6379

# PostgreSQL (optional)
DATABASE_URL=postgresql://user:password@localhost:5432/x402
```

---

## Testing Recommendations

### Unit Tests
- **Vitest** or **Jest** - Test replay protection logic
- Mock Redis for testing

### Integration Tests
- **Testcontainers** - Spin up Redis in tests
- Test idempotency behavior

### E2E Tests
- Test full flow: verify → settle → cache → idempotent settle

---

## Monitoring & Observability

### Recommended Tools

1. **Sentry** - Error tracking
   ```bash
   pnpm add @sentry/node
   ```

2. **Prometheus + Grafana** - Metrics
   - Settlement success rate
   - Cache hit rate
   - Response times

3. **Redis Insight** - Redis monitoring
   - Key counts
   - Memory usage
   - Command latency

---

## Summary

| Technology | Purpose | Priority | Cost |
|------------|---------|----------|------|
| **Redis** | Persistent storage, cache | 🔴 Critical | $0-5/mo |
| **BullMQ** | Job queue (optional) | 🟢 Optional | $0 (uses Redis) |
| **PostgreSQL** | Analytics (optional) | 🟢 Optional | $0-5/mo |
| **Sentry** | Error tracking | 🟡 Recommended | Free tier |

**Minimum Viable:** Redis only  
**Recommended:** Redis + BullMQ  
**Enterprise:** Redis + BullMQ + PostgreSQL + Monitoring

---

## Next Steps

1. ✅ Choose Redis provider (Upstash recommended)
2. ✅ Install Redis client
3. ✅ Update replay protection module
4. ✅ Add idempotency to `/settle`
5. ✅ Test thoroughly
6. ✅ Deploy

