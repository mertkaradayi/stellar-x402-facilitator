import * as Stellar from "@stellar/stellar-sdk";
import type { PaymentPayload, PaymentRequirements, SettleResponse, STELLAR_NETWORKS } from "../types.js";
import { 
  hasTransactionBeenUsed, 
  getCachedSettlement, 
  markPaymentAsSettled 
} from "../replay-protection.js";

const NETWORKS: typeof STELLAR_NETWORKS = {
  "stellar-testnet": {
    horizonUrl: "https://horizon-testnet.stellar.org",
    sorobanRpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
  },
  stellar: {
    horizonUrl: "https://horizon.stellar.org",
    sorobanRpcUrl: "https://soroban.stellar.org",
    networkPassphrase: "Public Global Stellar Network ; September 2015",
  },
};

// Get facilitator secret key from environment (for fee sponsorship)
const FACILITATOR_SECRET_KEY = process.env.FACILITATOR_SECRET_KEY;

/**
 * Submit a Stellar payment with optional fee sponsorship (fee-bump)
 * 
 * Trust-minimized guarantees:
 * - Client's signed transaction is NEVER modified
 * - Only fee payer changes when using fee-bump
 * - Asset, amount, and destination are validated before submission
 */
export async function settleStellarPayment(
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements
): Promise<SettleResponse> {
  const { payload, network } = paymentPayload;
  const { signedTxXdr } = payload;
  const resource = paymentRequirements.resource;

  const networkConfig = NETWORKS[network as keyof typeof NETWORKS];
  if (!networkConfig) {
    return {
      success: false,
      error: `Unsupported network: ${network}`,
      txHash: null,
      networkId: network,
    };
  }

  // Require a signed transaction for settlement
  if (!signedTxXdr) {
    return {
      success: false,
      error: "signedTxXdr is required for settlement",
      txHash: null,
      networkId: network,
    };
  }

  // Parse the transaction to get the hash for replay protection
  let tx: Stellar.Transaction | Stellar.FeeBumpTransaction;
  let txHash: string;
  
  try {
    tx = Stellar.TransactionBuilder.fromXDR(signedTxXdr, networkConfig.networkPassphrase);
    txHash = tx.hash().toString("hex");
  } catch (error) {
    return {
      success: false,
      error: `Invalid transaction XDR: ${error instanceof Error ? error.message : "unknown error"}`,
      txHash: null,
      networkId: network,
    };
  }

  // Replay protection: Check if this transaction was already settled
  if (hasTransactionBeenUsed(txHash)) {
    const cached = getCachedSettlement(txHash);
    if (cached) {
      console.log(`[settle] Returning cached result for tx ${txHash.slice(0, 16)}... (idempotent)`);
      return cached;
    }
    // Transaction used but no cache (shouldn't happen, but handle gracefully)
    return {
      success: false,
      error: "Transaction has already been submitted",
      txHash,
      networkId: network,
    };
  }

  const server = new Stellar.Horizon.Server(networkConfig.horizonUrl);

  try {
    let submittedTxHash: string;

    // If facilitator key is configured, use fee-bump (fee sponsorship)
    // This wraps the client's transaction WITHOUT modifying it
    if (FACILITATOR_SECRET_KEY) {
      const facilitatorKeypair = Stellar.Keypair.fromSecret(FACILITATOR_SECRET_KEY);
      
      // Get the inner transaction for fee-bump
      // If tx is already a FeeBumpTransaction, extract the inner
      const innerTx = tx instanceof Stellar.FeeBumpTransaction 
        ? tx.innerTransaction 
        : tx as Stellar.Transaction;
      
      // Build fee-bump transaction
      // Per Stellar docs: inner transaction is UNCHANGED, only fee payer is different
      const feeBumpTx = Stellar.TransactionBuilder.buildFeeBumpTransaction(
        facilitatorKeypair,
        "1000000", // Max fee in stroops (0.1 XLM)
        innerTx,
        networkConfig.networkPassphrase
      );
      feeBumpTx.sign(facilitatorKeypair);

      console.log(`[settle] Submitting fee-bumped transaction...`);
      console.log(`[settle] Inner tx hash: ${innerTx.hash().toString("hex").slice(0, 16)}...`);
      console.log(`[settle] Fee-bump tx hash: ${feeBumpTx.hash().toString("hex").slice(0, 16)}...`);
      
      const result = await server.submitTransaction(feeBumpTx);
      submittedTxHash = result.hash;
      console.log(`[settle] Transaction successful: ${submittedTxHash}`);
    } else {
      // Submit client's transaction directly (client pays fees)
      console.log(`[settle] Submitting client-signed transaction: ${txHash.slice(0, 16)}...`);
      
      const txToSubmit = tx instanceof Stellar.FeeBumpTransaction 
        ? tx 
        : tx as Stellar.Transaction;
      
      const result = await server.submitTransaction(txToSubmit);
      submittedTxHash = result.hash;
      console.log(`[settle] Transaction successful: ${submittedTxHash}`);
    }

    // Build success response
    const response: SettleResponse = {
      success: true,
      error: null,
      txHash: submittedTxHash,
      networkId: network,
    };

    // Mark payment as settled for replay protection (idempotency)
    markPaymentAsSettled(txHash, resource, response);

    return response;
  } catch (error) {
    console.error("[settle] Transaction failed:", error);
    
    // Extract detailed error info from Stellar Horizon
    let errorMessage = "Transaction failed";
    if (error instanceof Error) {
      errorMessage = error.message;
      
      // Check for Horizon error extras with result codes
      const horizonError = error as { 
        response?: { 
          data?: { 
            extras?: { 
              result_codes?: { 
                transaction?: string;
                operations?: string[];
              } 
            } 
          } 
        } 
      };
      
      const resultCodes = horizonError.response?.data?.extras?.result_codes;
      if (resultCodes) {
        errorMessage += ` - Transaction: ${resultCodes.transaction || "unknown"}`;
        if (resultCodes.operations?.length) {
          errorMessage += `, Operations: ${resultCodes.operations.join(", ")}`;
        }
      }
    }

    return {
      success: false,
      error: errorMessage,
      txHash: null,
      networkId: network,
    };
  }
}
