// Stellar transaction building for x402 payments
import * as Stellar from "@stellar/stellar-sdk";

const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
const HORIZON_URL = "https://horizon-testnet.stellar.org";
const SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";

export interface PaymentParams {
  sourceAccount: string;
  destination: string;
  amount: string; // In stroops (all Stellar assets use 7 decimals)
  asset: string; // Contract address or "native"
}

export interface StellarPayload {
  signedTxXdr: string;
  sourceAccount: string;
  amount: string;
  destination: string;
  asset: string;
  validUntilLedger: number;
  nonce: string;
}

// Generate a random nonce
function generateNonce(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Build a payment transaction for native XLM
export async function buildXlmPaymentTransaction(
  params: PaymentParams
): Promise<{ transaction: Stellar.Transaction; payload: Omit<StellarPayload, "signedTxXdr"> }> {
  const server = new Stellar.Horizon.Server(HORIZON_URL);
  
  // Load the source account
  const sourceAccount = await server.loadAccount(params.sourceAccount);
  
  // Get current ledger for timeout
  const ledgerResponse = await fetch(`${HORIZON_URL}/ledgers?order=desc&limit=1`);
  const ledgerData = await ledgerResponse.json();
  const currentLedger = ledgerData._embedded?.records?.[0]?.sequence || 0;
  const validUntilLedger = currentLedger + 100; // Valid for ~100 ledgers (~8 minutes)
  
  // Convert amount from stroops to XLM
  const xlmAmount = (Number(params.amount) / 10_000_000).toFixed(7);
  
  // Build the transaction
  const transaction = new Stellar.TransactionBuilder(sourceAccount, {
    fee: "100000", // 0.01 XLM max fee
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Stellar.Operation.payment({
        destination: params.destination,
        asset: Stellar.Asset.native(),
        amount: xlmAmount,
      })
    )
    .setTimeout(300) // 5 minutes
    .build();

  const payload: Omit<StellarPayload, "signedTxXdr"> = {
    sourceAccount: params.sourceAccount,
    amount: params.amount,
    destination: params.destination,
    asset: "native",
    validUntilLedger,
    nonce: generateNonce(),
  };

  return { transaction, payload };
}

// Build a Soroban token transfer transaction
export async function buildTokenPaymentTransaction(
  params: PaymentParams
): Promise<{ transactionXdr: string; payload: Omit<StellarPayload, "signedTxXdr"> }> {
  const server = new Stellar.SorobanRpc.Server(SOROBAN_RPC_URL);
  
  // Load the source account
  const sourceAccount = await server.getAccount(params.sourceAccount);
  
  // Get current ledger
  const latestLedger = await server.getLatestLedger();
  const validUntilLedger = latestLedger.sequence + 100;

  // Create the contract instance
  const contract = new Stellar.Contract(params.asset);

  // Build the transfer operation
  // SEP-41 transfer: transfer(from: Address, to: Address, amount: i128)
  const transferOp = contract.call(
    "transfer",
    Stellar.nativeToScVal(params.sourceAccount, { type: "address" }),
    Stellar.nativeToScVal(params.destination, { type: "address" }),
    Stellar.nativeToScVal(BigInt(params.amount), { type: "i128" })
  );

  // Build the transaction
  const transaction = new Stellar.TransactionBuilder(sourceAccount, {
    fee: "100000",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(transferOp)
    .setTimeout(300)
    .build();

  // Simulate to get the proper footprint
  const simResponse = await server.simulateTransaction(transaction);
  
  if (Stellar.SorobanRpc.Api.isSimulationError(simResponse)) {
    throw new Error(`Simulation failed: ${simResponse.error}`);
  }

  // Assemble the transaction with simulation results
  const preparedTx = Stellar.SorobanRpc.assembleTransaction(
    transaction,
    simResponse
  ).build();

  const payload: Omit<StellarPayload, "signedTxXdr"> = {
    sourceAccount: params.sourceAccount,
    amount: params.amount,
    destination: params.destination,
    asset: params.asset,
    validUntilLedger,
    nonce: generateNonce(),
  };

  return { transactionXdr: preparedTx.toXDR(), payload };
}

// Parse a signed transaction and extract info
export function parseSignedTransaction(signedXdr: string): {
  hash: string;
  sourceAccount: string;
} {
  const tx = Stellar.TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  return {
    hash: tx.hash().toString("hex"),
    sourceAccount: tx.source,
  };
}



