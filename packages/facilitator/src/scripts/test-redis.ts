/**
 * Test Redis Connection
 * 
 * Simple script to test Redis connection
 */

import "dotenv/config";
import { connectRedis, testRedisConnection, disconnectRedis } from "../storage/redis.js";

async function main() {
  console.log("Testing Redis connection...\n");

  try {
    await connectRedis();
    const success = await testRedisConnection();
    
    if (success) {
      console.log("\n✅ Redis connection test PASSED");
      process.exit(0);
    } else {
      console.log("\n❌ Redis connection test FAILED");
      process.exit(1);
    }
  } catch (error) {
    console.error("\n❌ Error during Redis connection test:", error);
    process.exit(1);
  } finally {
    await disconnectRedis();
  }
}

main();

