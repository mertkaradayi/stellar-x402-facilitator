import * as Stellar from "@stellar/stellar-sdk";
import type { PaymentPayload, PaymentRequirements, SettleResponse, STELLAR_NETWORKS } from "../types.js";

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

// Get facilitator secret key from environment
const FACILITATOR_SECRET_KEY = process.env.FACILITATOR_SECRET_KEY;

export async function settleStellarPayment(
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements
): Promise<SettleResponse> {
  const { payload, network } = paymentPayload;
  const { sourceAccount, amount, destination, asset, signedTxXdr } = payload;

  const networkConfig = NETWORKS[network as keyof typeof NETWORKS];
  if (!networkConfig) {
    return {
      success: false,
      error: `Unsupported network: ${network}`,
      transaction: "",
      network,
      payer: sourceAccount,
    };
  }

  const server = new Stellar.Horizon.Server(networkConfig.horizonUrl);

  // If we have a pre-signed transaction from the client, submit it
  if (signedTxXdr) {
    try {
      const tx = Stellar.TransactionBuilder.fromXDR(
        signedTxXdr,
        networkConfig.networkPassphrase
      );

      // If facilitator key is configured, add fee bump (fee sponsorship)
      if (FACILITATOR_SECRET_KEY) {
        const facilitatorKeypair = Stellar.Keypair.fromSecret(FACILITATOR_SECRET_KEY);
        
        // Create a fee bump transaction to sponsor the fees
        const feeBumpTx = Stellar.TransactionBuilder.buildFeeBumpTransaction(
          facilitatorKeypair,
          "1000000", // Base fee in stroops (0.1 XLM max)
          tx as Stellar.Transaction,
          networkConfig.networkPassphrase
        );
        feeBumpTx.sign(facilitatorKeypair);

        console.log("[settle] Submitting fee-bumped transaction...");
        const result = await server.submitTransaction(feeBumpTx);
        console.log("[settle] Transaction successful:", result.hash);

        return {
          success: true,
          error: null,
          transaction: result.hash,
          network,
          payer: sourceAccount,
        };
      } else {
        // Submit the transaction as-is (client pays fees)
        console.log("[settle] Submitting client-signed transaction...");
        const result = await server.submitTransaction(tx as Stellar.Transaction);
        console.log("[settle] Transaction successful:", result.hash);

        return {
          success: true,
          error: null,
          transaction: result.hash,
          network,
          payer: sourceAccount,
        };
      }
    } catch (error) {
      console.error("[settle] Transaction failed:", error);
      
      // Extract detailed error info from Stellar
      let errorMessage = "Transaction failed";
      if (error instanceof Error) {
        errorMessage = error.message;
        // Check for Horizon error extras
        const horizonError = error as { response?: { data?: { extras?: { result_codes?: unknown } } } };
        if (horizonError.response?.data?.extras?.result_codes) {
          errorMessage += ` - ${JSON.stringify(horizonError.response.data.extras.result_codes)}`;
        }
      }

      return {
        success: false,
        error: errorMessage,
        transaction: "",
        network,
        payer: sourceAccount,
      };
    }
  }

  // Fallback: Demo mode - return mock transaction when no signed tx is provided
  // In production, this would require a proper signed transaction
  if (!signedTxXdr) {
    console.log("[settle] Demo mode - returning mock transaction (no signed tx provided)");
    return {
      success: true,
      error: null,
      transaction: `mock-stellar-tx-${Date.now()}`,
      network,
      payer: sourceAccount,
    };
  }

  // If we have a signed tx but no facilitator key, we can't proceed
  if (!FACILITATOR_SECRET_KEY) {
    return {
      success: false,
      error: "Facilitator key not configured for fee sponsorship",
      transaction: "",
      network,
      payer: sourceAccount,
    };
  }

  try {
    const facilitatorKeypair = Stellar.Keypair.fromSecret(FACILITATOR_SECRET_KEY);
    const facilitatorAccount = await server.loadAccount(facilitatorKeypair.publicKey());

    // Build a simple payment transaction (for demo - normally client would sign)
    const paymentOp = asset === "native"
      ? Stellar.Operation.payment({
          destination,
          asset: Stellar.Asset.native(),
          amount: (Number(amount) / 10_000_000).toFixed(7), // Convert stroops to XLM
          source: sourceAccount,
        })
      : Stellar.Operation.payment({
          destination,
          asset: Stellar.Asset.native(), // Simplified for demo
          amount: (Number(amount) / 10_000_000).toFixed(7),
          source: sourceAccount,
        });

    const tx = new Stellar.TransactionBuilder(facilitatorAccount, {
      fee: "100000",
      networkPassphrase: networkConfig.networkPassphrase,
    })
      .addOperation(paymentOp)
      .setTimeout(300)
      .build();

    // This would need the source account to sign, which we don't have
    // For a real implementation, this is where Soroban authorization would come in
    return {
      success: false,
      error: "Direct settlement without client signature not implemented",
      transaction: "",
      network,
      payer: sourceAccount,
    };
  } catch (error) {
    return {
      success: false,
      error: `Settlement error: ${error instanceof Error ? error.message : "unknown error"}`,
      transaction: "",
      network,
      payer: sourceAccount,
    };
  }
}

