/**
 * Replay Protection Module
 * 
 * Prevents the same payment from being used to unlock multiple resources.
 * Uses in-memory storage (resets on restart - suitable for hackathon/demo).
 * 
 * For production, replace with persistent storage (Redis, PostgreSQL, etc.)
 */

import type { SettleResponse } from "./types.js";

interface SettlementRecord {
  txHash: string;
  resource: string;
  settledAt: Date;
  response: SettleResponse;
}

// In-memory store for settled payments
// Key: `${txHash}:${resource}` or just `${txHash}` for global uniqueness
const settledPayments = new Map<string, SettlementRecord>();

// Key: just txHash for looking up by transaction
const txHashIndex = new Map<string, SettlementRecord>();

/**
 * Generate a unique key for a payment + resource combination
 */
function getKey(txHash: string, resource: string): string {
  return `${txHash}:${resource}`;
}

/**
 * Check if a transaction has already been used for any resource
 */
export function hasTransactionBeenUsed(txHash: string): boolean {
  return txHashIndex.has(txHash);
}

/**
 * Check if a transaction has been used for a specific resource
 */
export function hasPaymentBeenUsedForResource(txHash: string, resource: string): boolean {
  return settledPayments.has(getKey(txHash, resource));
}

/**
 * Get the cached settlement result for a transaction
 * Enables idempotent /settle calls
 */
export function getCachedSettlement(txHash: string): SettleResponse | null {
  const record = txHashIndex.get(txHash);
  return record ? record.response : null;
}

/**
 * Mark a payment as used and cache the settlement result
 */
export function markPaymentAsSettled(
  txHash: string,
  resource: string,
  response: SettleResponse
): void {
  const record: SettlementRecord = {
    txHash,
    resource,
    settledAt: new Date(),
    response,
  };

  const key = getKey(txHash, resource);
  settledPayments.set(key, record);
  txHashIndex.set(txHash, record);

  console.log(`[replay-protection] Marked payment as settled: ${txHash.slice(0, 16)}... for resource: ${resource}`);
}

/**
 * Get statistics about the replay protection cache
 */
export function getStats(): { totalSettled: number; uniqueTransactions: number } {
  return {
    totalSettled: settledPayments.size,
    uniqueTransactions: txHashIndex.size,
  };
}

/**
 * Clear all cached settlements (useful for testing)
 */
export function clearCache(): void {
  settledPayments.clear();
  txHashIndex.clear();
  console.log("[replay-protection] Cache cleared");
}

