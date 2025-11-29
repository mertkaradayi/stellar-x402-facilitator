import "dotenv/config";
import express from "express";
import cors from "cors";
import { verifyRoute } from "./routes/verify.js";
import { settleRoute } from "./routes/settle.js";
import { SUPPORTED_KINDS } from "./types.js";
import { connectRedis, disconnectRedis, testRedisConnection } from "./storage/redis.js";

const app = express();
const PORT = process.env.PORT || 4022;

app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "x402-stellar-facilitator" });
});

// x402 /supported endpoint - declares supported (scheme, network) combinations
app.get("/supported", (_req, res) => {
  res.json({
    kinds: SUPPORTED_KINDS.map(k => ({ scheme: k.scheme, network: k.network }))
  });
});

// x402 facilitator endpoints
app.post("/verify", verifyRoute);
app.post("/settle", settleRoute);

// Initialize Redis connection on startup
async function startServer() {
  // Connect to Redis
  await connectRedis();
  
  // Test Redis connection
  await testRedisConnection();

  // Start Express server
  app.listen(PORT, () => {
    console.log(`🚀 x402 Stellar Facilitator running on http://localhost:${PORT}`);
    console.log(`   GET  /supported - List supported schemes/networks`);
    console.log(`   POST /verify    - Verify payment`);
    console.log(`   POST /settle    - Settle payment`);
  });
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n[shutdown] Received SIGINT, shutting down gracefully...");
  await disconnectRedis();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n[shutdown] Received SIGTERM, shutting down gracefully...");
  await disconnectRedis();
  process.exit(0);
});

// Start the server
startServer().catch((error) => {
  console.error("[startup] Failed to start server:", error);
  process.exit(1);
});
