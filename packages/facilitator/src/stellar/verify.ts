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

/**
 * Extract payment details from a signed transaction XDR
 * Returns null if the transaction is not a valid payment
 */
interface ExtractedPayment {
  source: string;
  destination: string;
  amount: string; // In stroops/base units
  asset: string;  // "native" or contract address
  txHash: string;
}

function extractPaymentFromXdr(
  signedTxXdr: string,
  networkPassphrase: string
): ExtractedPayment | { error: string } {
  try {
    const tx = Stellar.TransactionBuilder.fromXDR(signedTxXdr, networkPassphrase);
    
    // Get transaction hash
    const txHash = tx.hash().toString("hex");
    
    // Handle FeeBumpTransaction vs regular Transaction
    if (tx instanceof Stellar.FeeBumpTransaction) {
      // It's a FeeBumpTransaction, extract the inner transaction
      const innerTx = tx.innerTransaction;
      return extractPaymentFromTransaction(innerTx, txHash);
    }
    
    // Regular Transaction
    return extractPaymentFromTransaction(tx as Stellar.Transaction, txHash);
  } catch (error) {
    return { error: `Failed to parse XDR: ${error instanceof Error ? error.message : "unknown error"}` };
  }
}

function extractPaymentFromTransaction(
  tx: Stellar.Transaction,
  txHash: string
): ExtractedPayment | { error: string } {
  const source = tx.source;
  const operations = tx.operations;
  
  if (operations.length === 0) {
    return { error: "Transaction has no operations" };
  }
  
  // Look for a payment operation
  for (const op of operations) {
    if (op.type === "payment") {
      const paymentOp = op as Stellar.Operation.Payment;
      
      // Extract asset info
      let asset: string;
      if (paymentOp.asset.isNative()) {
        asset = "native";
      } else {
        // For issued assets: "CODE:ISSUER"
        const assetCode = (paymentOp.asset as Stellar.Asset).code;
        const assetIssuer = (paymentOp.asset as Stellar.Asset).issuer;
        asset = `${assetCode}:${assetIssuer}`;
      }
      
      // Convert amount to stroops (XLM has 7 decimal places)
      const amountStroops = BigInt(Math.floor(parseFloat(paymentOp.amount) * 10_000_000)).toString();
      
      return {
        source: op.source || source,
        destination: paymentOp.destination,
        amount: amountStroops,
        asset,
        txHash,
      };
    }
    
    // TODO: Handle Soroban contract invocations for token transfers
    // This would require parsing the contract call to extract transfer details
  }
  
  return { error: "No payment operation found in transaction" };
}

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

  // Get network config
  const networkConfig = NETWORKS[network as keyof typeof NETWORKS];
  if (!networkConfig) {
    return {
      isValid: false,
      invalidReason: `Unsupported network: ${network}`,
    };
  }

  // If we have a signed transaction, validate it matches the payload and requirements
  if (signedTxXdr) {
    const extractResult = extractPaymentFromXdr(signedTxXdr, networkConfig.networkPassphrase);
    
    if ("error" in extractResult) {
      return {
        isValid: false,
        invalidReason: `Invalid transaction: ${extractResult.error}`,
      };
    }
    
    const extracted = extractResult;
    console.log("[verify] Extracted payment from XDR:", {
      txHash: extracted.txHash.slice(0, 16) + "...",
      source: extracted.source.slice(0, 8) + "...",
      destination: extracted.destination.slice(0, 8) + "...",
      amount: extracted.amount,
      asset: extracted.asset,
    });
    
    // Validate source matches payload
    if (extracted.source !== sourceAccount) {
      return {
        isValid: false,
        invalidReason: `Transaction source mismatch: payload says ${sourceAccount}, XDR has ${extracted.source}`,
      };
    }
    
    // Validate destination matches payTo requirement
    if (extracted.destination !== paymentRequirements.payTo) {
      return {
        isValid: false,
        invalidReason: `Destination mismatch: required ${paymentRequirements.payTo}, XDR sends to ${extracted.destination}`,
      };
    }
    
    // Validate amount is sufficient
    const extractedAmount = BigInt(extracted.amount);
    const requiredAmount = BigInt(paymentRequirements.maxAmountRequired);
    if (extractedAmount < requiredAmount) {
      return {
        isValid: false,
        invalidReason: `Insufficient amount in XDR: required ${requiredAmount}, got ${extractedAmount}`,
      };
    }
    
    // Validate asset matches requirement
    // Allow "native" to match if requirement specifies native XLM
    const normalizedExtractedAsset = extracted.asset;
    const normalizedRequiredAsset = paymentRequirements.asset;
    
    if (normalizedExtractedAsset !== normalizedRequiredAsset) {
      // Check if both are representing native XLM
      const isExtractedNative = normalizedExtractedAsset === "native";
      const isRequiredNative = normalizedRequiredAsset === "native" || 
                               normalizedRequiredAsset.toLowerCase() === "xlm";
      
      if (!(isExtractedNative && isRequiredNative)) {
        return {
          isValid: false,
          invalidReason: `Asset mismatch: required ${normalizedRequiredAsset}, XDR has ${normalizedExtractedAsset}`,
        };
      }
    }
    
    console.log("[verify] XDR validation passed - transaction matches requirements");
  } else {
    // No signed transaction - validate payload fields against requirements
    // This is a weaker validation (trusting client-provided data)
    
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

    // Validate asset matches
    if (paymentRequirements.asset && asset !== paymentRequirements.asset) {
      return {
        isValid: false,
        invalidReason: `Asset mismatch: expected ${paymentRequirements.asset}, got ${asset}`,
      };
    }
  }

  // Verify source account exists on network
  try {
    const server = new Stellar.Horizon.Server(networkConfig.horizonUrl);
    await server.loadAccount(sourceAccount);
    
    console.log("[verify] Payment verified successfully");
    return {
      isValid: true,
      invalidReason: null,
    };
  } catch (error) {
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
