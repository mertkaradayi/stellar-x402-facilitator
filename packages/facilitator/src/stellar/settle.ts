import * as Stellar from "@stellar/stellar-sdk";
import type { PaymentPayload, PaymentRequirements, SettleResponse, STELLAR_NETWORKS, StellarErrorReason } from "../types.js";

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
 * - Stellar's sequence number mechanism prevents replay at protocol level
 */
export async function settleStellarPayment(
  paymentPayload: PaymentPayload,
  _paymentRequirements: PaymentRequirements
): Promise<SettleResponse> {
  const { payload, network } = paymentPayload;
  const { signedTxXdr } = payload;
  const payer = payload.sourceAccount;

  const networkConfig = NETWORKS[network as keyof typeof NETWORKS];
  if (!networkConfig) {
    return {
      success: false,
      errorReason: "invalid_network" as StellarErrorReason,
      payer,
      transaction: "",
      network,
    };
  }

  // Require a signed transaction for settlement
  if (!signedTxXdr) {
    return {
      success: false,
      errorReason: "invalid_exact_stellar_payload_missing_signed_tx_xdr" as StellarErrorReason,
      payer,
      transaction: "",
      network,
    };
  }

  // Parse the transaction
  let tx: Stellar.Transaction | Stellar.FeeBumpTransaction;
  let txHash: string;

  try {
    tx = Stellar.TransactionBuilder.fromXDR(signedTxXdr, networkConfig.networkPassphrase);
    txHash = tx.hash().toString("hex");
  } catch (error) {
    return {
      success: false,
      errorReason: "invalid_exact_stellar_payload_invalid_xdr" as StellarErrorReason,
      payer,
      transaction: "",
      network,
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
      const innerTx =
        tx instanceof Stellar.FeeBumpTransaction ? tx.innerTransaction : (tx as Stellar.Transaction);

      // Build fee-bump transaction
      // Per Stellar docs: inner transaction is UNCHANGED, only fee payer is different
      try {
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
      } catch (feeBumpError) {
        console.error("[settle] Fee-bump failed:", feeBumpError);
        return {
          success: false,
          errorReason: "settle_exact_stellar_fee_bump_failed" as StellarErrorReason,
          payer,
          transaction: "",
          network,
        };
      }
    } else {
      // Submit client's transaction directly (client pays fees)
      console.log(`[settle] Submitting client-signed transaction: ${txHash.slice(0, 16)}...`);

      const txToSubmit =
        tx instanceof Stellar.FeeBumpTransaction ? tx : (tx as Stellar.Transaction);

      const result = await server.submitTransaction(txToSubmit);
      submittedTxHash = result.hash;
      console.log(`[settle] Transaction successful: ${submittedTxHash}`);
    }

    return {
      success: true,
      payer,
      transaction: submittedTxHash,
      network,
    };
  } catch (error) {
    console.error("[settle] Transaction failed:", error);

    // Extract detailed error info from Stellar Horizon for logging
    if (error instanceof Error) {
      const horizonError = error as {
        response?: {
          data?: {
            extras?: {
              result_codes?: {
                transaction?: string;
                operations?: string[];
              };
            };
          };
        };
      };

      const resultCodes = horizonError.response?.data?.extras?.result_codes;
      if (resultCodes) {
        console.error(
          `[settle] Horizon result codes - Transaction: ${resultCodes.transaction || "unknown"}, Operations: ${resultCodes.operations?.join(", ") || "none"}`
        );
      }
    }

    return {
      success: false,
      errorReason: "settle_exact_stellar_transaction_failed" as StellarErrorReason,
      payer,
      transaction: "",
      network,
    };
  }
}
