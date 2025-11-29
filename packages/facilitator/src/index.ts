import express from "express";
import cors from "cors";
import { verifyRoute } from "./routes/verify.js";
import { settleRoute } from "./routes/settle.js";

const app = express();
const PORT = process.env.PORT || 4022;

app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "x402-stellar-facilitator" });
});

// x402 facilitator endpoints
app.post("/verify", verifyRoute);
app.post("/settle", settleRoute);

app.listen(PORT, () => {
  console.log(`🚀 x402 Stellar Facilitator running on http://localhost:${PORT}`);
  console.log(`   POST /verify  - Verify payment`);
  console.log(`   POST /settle  - Settle payment`);
});



