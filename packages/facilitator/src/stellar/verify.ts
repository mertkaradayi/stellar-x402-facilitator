import * as Stellar from "@stellar/stellar-sdk";
import type { PaymentPayload, PaymentRequirements, VerifyResponse, STELLAR_NETWORKS } from "../types.js";

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

export async function verifyStellarPayment(
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements
): Promise<VerifyResponse> {
  const { payload, network } = paymentPayload;

  // Validate network
  if (network !== paymentRequirements.network) {
    return {
      isValid: false,
      invalidReason: `Network mismatch: expected ${paymentRequirements.network}, got ${network}`,
    };
  }

  // Validate payload structure
  if (!payload || typeof payload !== "object") {
    return {
      isValid: false,
      invalidReason: "Missing or invalid payload",
    };
  }

  const { sourceAccount, amount, destination, asset, signedTxXdr } = payload;

  // Check required fields
  if (!sourceAccount || !amount || !destination) {
    return {
      isValid: false,
      invalidReason: "Missing required payload fields (sourceAccount, amount, destination)",
    };
  }

  // Validate destination matches payTo
  if (destination !== paymentRequirements.payTo) {
    return {
      isValid: false,
      invalidReason: `Destination mismatch: expected ${paymentRequirements.payTo}, got ${destination}`,
    };
  }

  // Validate amount is sufficient
  const payloadAmount = BigInt(amount);
  const requiredAmount = BigInt(paymentRequirements.maxAmountRequired);
  if (payloadAmount < requiredAmount) {
    return {
      isValid: false,
      invalidReason: `Insufficient amount: required ${requiredAmount}, got ${payloadAmount}`,
    };
  }

  // Validate asset matches (if specified in requirements)
  if (paymentRequirements.asset && asset !== paymentRequirements.asset) {
    return {
      isValid: false,
      invalidReason: `Asset mismatch: expected ${paymentRequirements.asset}, got ${asset}`,
    };
  }

  // Check if the source account exists and has sufficient balance
  const networkConfig = NETWORKS[network as keyof typeof NETWORKS];
  if (!networkConfig) {
    return {
      isValid: false,
      invalidReason: `Unsupported network: ${network}`,
    };
  }

  try {
    const server = new Stellar.Horizon.Server(networkConfig.horizonUrl);
    const account = await server.loadAccount(sourceAccount);

    // For native XLM payments, check XLM balance
    if (asset === "native") {
      const xlmBalance = account.balances.find(
        (b) => b.asset_type === "native"
      );
      if (xlmBalance) {
        // Convert XLM to stroops (1 XLM = 10^7 stroops)
        const balanceStroops = BigInt(Math.floor(parseFloat(xlmBalance.balance) * 10_000_000));
        if (balanceStroops < payloadAmount) {
          return {
            isValid: false,
            invalidReason: `Insufficient XLM balance: has ${balanceStroops}, needs ${payloadAmount}`,
          };
        }
      }
    }
    // For token payments (Soroban), we would need to check token balance
    // This is more complex and would require Soroban RPC calls
    // For hackathon, we'll trust the signed transaction is valid

    // If we have a signed transaction, try to parse it
    if (signedTxXdr) {
      try {
        const tx = Stellar.TransactionBuilder.fromXDR(
          signedTxXdr,
          networkConfig.networkPassphrase
        );
        console.log("[verify] Parsed transaction:", tx.hash().toString("hex"));
      } catch (parseError) {
        return {
          isValid: false,
          invalidReason: `Invalid transaction XDR: ${parseError instanceof Error ? parseError.message : "unknown error"}`,
        };
      }
    }

    console.log("[verify] Payment verified successfully");
    return {
      isValid: true,
      invalidReason: null,
    };
  } catch (error) {
    // Account not found or other error
    if (error instanceof Error && error.message.includes("Not Found")) {
      return {
        isValid: false,
        invalidReason: `Source account not found: ${sourceAccount}`,
      };
    }
    return {
      isValid: false,
      invalidReason: `Verification error: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }
}
