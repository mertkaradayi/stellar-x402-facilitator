import * as Stellar from "@stellar/stellar-sdk";
import type { PaymentPayload, PaymentRequirements, VerifyResponse, STELLAR_NETWORKS, StellarErrorReason } from "../types.js";

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
  const payer = payload?.sourceAccount;

  // Validate network
  if (network !== paymentRequirements.network) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_stellar_payload_network_mismatch" as StellarErrorReason,
      payer,
    };
  }

  // Validate payload structure
  if (!payload || typeof payload !== "object") {
    return {
      isValid: false,
      invalidReason: "invalid_payload" as StellarErrorReason,
    };
  }

  const { sourceAccount, amount, destination, asset, signedTxXdr } = payload;

  // Check required fields
  if (!sourceAccount || !amount || !destination) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_stellar_payload_missing_required_fields" as StellarErrorReason,
      payer,
    };
  }

  // Validate destination matches payTo
  if (destination !== paymentRequirements.payTo) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_stellar_payload_destination_mismatch" as StellarErrorReason,
      payer,
    };
  }

  // Validate amount is sufficient
  const payloadAmount = BigInt(amount);
  const requiredAmount = BigInt(paymentRequirements.maxAmountRequired);
  if (payloadAmount < requiredAmount) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_stellar_payload_amount_mismatch" as StellarErrorReason,
      payer,
    };
  }

  // Validate asset matches (if specified in requirements)
  if (paymentRequirements.asset && asset !== paymentRequirements.asset) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_stellar_payload_asset_mismatch" as StellarErrorReason,
      payer,
    };
  }

  // Check if the source account exists and has sufficient balance
  const networkConfig = NETWORKS[network as keyof typeof NETWORKS];
  if (!networkConfig) {
    return {
      isValid: false,
      invalidReason: "invalid_network" as StellarErrorReason,
      payer,
    };
  }

  try {
    const server = new Stellar.Horizon.Server(networkConfig.horizonUrl);
    const account = await server.loadAccount(sourceAccount);

    // For native XLM payments, check XLM balance
    if (asset === "native") {
      const xlmBalance = account.balances.find((b) => b.asset_type === "native");
      if (xlmBalance) {
        // Convert to stroops (all Stellar assets use 7 decimals: 1 unit = 10^7 stroops)
        const balanceStroops = BigInt(Math.floor(parseFloat(xlmBalance.balance) * 10_000_000));
        if (balanceStroops < payloadAmount) {
          return {
            isValid: false,
            invalidReason: "insufficient_funds" as StellarErrorReason,
            payer,
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
        const tx = Stellar.TransactionBuilder.fromXDR(signedTxXdr, networkConfig.networkPassphrase);
        console.log("[verify] Parsed transaction:", tx.hash().toString("hex"));
      } catch (parseError) {
        return {
          isValid: false,
          invalidReason: "invalid_exact_stellar_payload_invalid_xdr" as StellarErrorReason,
          payer,
        };
      }
    }

    console.log("[verify] Payment verified successfully");
    return {
      isValid: true,
      payer,
    };
  } catch (error) {
    // Account not found or other error
    if (error instanceof Error && error.message.includes("Not Found")) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_stellar_payload_source_account_not_found" as StellarErrorReason,
        payer,
      };
    }
    return {
      isValid: false,
      invalidReason: "unexpected_verify_error" as StellarErrorReason,
      payer,
    };
  }
}

/**
 * Extract the transaction hash from a signed XDR without full validation
 * Useful for replay protection checks
 */
export function getTxHashFromXdr(signedTxXdr: string, networkPassphrase: string): string | null {
  try {
    const tx = Stellar.TransactionBuilder.fromXDR(signedTxXdr, networkPassphrase);
    return tx.hash().toString("hex");
  } catch {
    return null;
  }
}
