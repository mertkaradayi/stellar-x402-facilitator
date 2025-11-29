"use client";

import { useState, useEffect, useCallback } from "react";
import {
  fetchWithX402,
  type PaymentRequirements,
  type SettlementResponse,
} from "@/lib/x402";

type Status = 
  | "idle" 
  | "connecting" 
  | "loading" 
  | "payment_required" 
  | "signing" 
  | "settling"
  | "paid" 
  | "error";

type WalletState = {
  connected: boolean;
  address: string | null;
  network: string | null;
};

export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [requirements, setRequirements] = useState<PaymentRequirements | null>(null);
  const [wallet, setWallet] = useState<WalletState>({
    connected: false,
    address: null,
    network: null,
  });
  const [freighterAvailable, setFreighterAvailable] = useState<boolean | null>(null);
  const [freighterApi, setFreighterApi] = useState<typeof import("@stellar/freighter-api") | null>(null);

  // Load Freighter API and check availability
  useEffect(() => {
    const loadFreighter = async () => {
      try {
        const api = await import("@stellar/freighter-api");
        setFreighterApi(api);
        
        // Check if Freighter extension is installed
        const result = await api.isConnected();
        setFreighterAvailable(result.isConnected);
        
        // If connected, try to get existing address
        if (result.isConnected) {
          const addressResult = await api.getAddress();
          if (addressResult.address) {
            const networkResult = await api.getNetwork();
            setWallet({
              connected: true,
              address: addressResult.address,
              network: networkResult.network || null,
            });
          }
        }
      } catch (err) {
        console.error("Failed to load Freighter:", err);
        setFreighterAvailable(false);
      }
    };
    
    loadFreighter();
  }, []);

  // Connect to Freighter
  const connectWallet = useCallback(async () => {
    if (!freighterApi) {
      setError("Freighter API not loaded");
      setStatus("error");
      return;
    }

    setStatus("connecting");
    setError(null);

    try {
      // Request access (prompts user if not already allowed)
      const accessResult = await freighterApi.requestAccess();
      
      if (accessResult.error) {
        throw new Error(accessResult.error);
      }

      // Get network info
      const networkResult = await freighterApi.getNetwork();
      
      setWallet({
        connected: true,
        address: accessResult.address || null,
        network: networkResult.network || null,
      });
      
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect wallet");
      setStatus("error");
    }
  }, [freighterApi]);

  // Sign transaction with Freighter
  const signTransaction = useCallback(async (xdr: string): Promise<string> => {
    if (!freighterApi) {
      throw new Error("Freighter not available");
    }

    const result = await freighterApi.signTransaction(xdr, {
      networkPassphrase: "Test SDF Network ; September 2015",
    });

    if (result.error) {
      throw new Error(result.error);
    }

    return result.signedTxXdr || "";
  }, [freighterApi]);

  // Handle payment flow
  const handlePayToView = useCallback(async () => {
    if (!wallet.connected || !wallet.address) {
      await connectWallet();
      return;
    }

    setStatus("loading");
    setError(null);
    setContent(null);
    setTxHash(null);

    try {
      const result = await fetchWithX402("/api/content", {
        sourceAccount: wallet.address,
        signTransaction,
        onPaymentRequired: (reqs) => {
          setRequirements(reqs);
          setStatus("payment_required");
        },
        onSigning: () => setStatus("signing"),
        onSettling: () => setStatus("settling"),
      });

      if (result.ok) {
        setContent((result.data as { content: string }).content);
        if (result.paymentResponse) {
          setTxHash(result.paymentResponse.transaction);
        }
        setStatus("paid");
      } else {
        setError(result.error || "Payment failed");
        setStatus("error");
      }
    } catch (err) {
      console.error("Error:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("error");
    }
  }, [wallet, connectWallet, signTransaction]);

  const formatAmount = (stroops: string) => {
    // All Stellar assets use 7 decimals (1 unit = 10^7 stroops)
    const amount = Number(stroops) / 10_000_000;
    return `${amount.toFixed(2)}`;
  };

  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-6)}`;
  };

  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>🌟 Stellar x402</h1>
          <p style={styles.subtitle}>Pay-to-view content using the x402 protocol</p>
        </div>

        {/* Wallet Section */}
        <div style={styles.walletSection}>
          {freighterAvailable === null && (
            <div style={styles.loadingBox}>
              <p>Checking for Freighter...</p>
            </div>
          )}
          
          {freighterAvailable === false && (
            <div style={styles.warningBox}>
              <p>⚠️ Freighter not detected</p>
              <a 
                href="https://www.freighter.app/" 
                target="_blank" 
                rel="noopener noreferrer"
                style={styles.installLink}
              >
                Install Freighter →
              </a>
            </div>
          )}
          
          {freighterAvailable && !wallet.connected && (
            <button 
              onClick={connectWallet} 
              style={styles.connectButton}
              disabled={status === "connecting"}
            >
              {status === "connecting" ? "Connecting..." : "🔗 Connect Freighter"}
            </button>
          )}
          
          {wallet.connected && wallet.address && (
            <div style={styles.walletInfo}>
              <div style={styles.walletBadge}>
                <span style={styles.walletDot}></span>
                <span>{truncateAddress(wallet.address)}</span>
              </div>
              <span style={styles.networkBadge}>{wallet.network || "Unknown"}</span>
            </div>
          )}
        </div>

        {/* Content Card */}
        <div style={styles.card}>
          {(status === "idle" || status === "connecting") && (
            <>
              <h2 style={styles.cardTitle}>🔒 Premium Content</h2>
              <div style={styles.blurredContent}>
                <p>This exclusive content is protected by the x402 payment protocol.</p>
                <p>Click below to pay and unlock instant access.</p>
              </div>
              <div style={styles.priceTag}>
                <span style={styles.price}>0.1 XLM</span>
                <span style={styles.network}>Stellar Testnet</span>
              </div>
              <button 
                onClick={handlePayToView} 
                style={styles.button}
                disabled={status === "connecting" || freighterAvailable === false}
              >
                {wallet.connected ? "💳 Pay to Unlock" : "🔗 Connect & Pay"}
              </button>
            </>
          )}

          {status === "loading" && (
            <div style={styles.statusContainer}>
              <div style={styles.spinner}></div>
              <p style={styles.statusText}>Requesting content...</p>
            </div>
          )}

          {status === "payment_required" && requirements && (
            <div style={styles.statusContainer}>
              <div style={styles.spinner}></div>
              <p style={styles.statusText}>💰 Payment Required</p>
              <div style={styles.paymentDetails}>
                <p>Amount: {formatAmount(requirements.maxAmountRequired)}</p>
                <p>To: {truncateAddress(requirements.payTo)}</p>
              </div>
            </div>
          )}

          {status === "signing" && (
            <div style={styles.statusContainer}>
              <div style={styles.spinner}></div>
              <p style={styles.statusText}>✍️ Sign in Freighter...</p>
              <p style={styles.subText}>Check your Freighter popup</p>
            </div>
          )}

          {status === "settling" && (
            <div style={styles.statusContainer}>
              <div style={styles.spinner}></div>
              <p style={styles.statusText}>⏳ Settling payment...</p>
              <p style={styles.subText}>Submitting to Stellar network</p>
            </div>
          )}

          {status === "paid" && content && (
            <div style={styles.successContainer}>
              <div style={styles.successBadge}>✅ Payment Successful</div>
              {txHash && (
                <div style={styles.txInfo}>
                  <p style={styles.txLabel}>Transaction:</p>
                  <code style={styles.txHash}>{txHash}</code>
                  {txHash.startsWith("mock") ? (
                    <p style={styles.mockNote}>Demo transaction</p>
                  ) : (
                    <a
                      href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={styles.explorerLink}
                    >
                      View on Stellar Expert →
                    </a>
                  )}
                </div>
              )}
              <div style={styles.contentBox}>
                <h3 style={styles.contentTitle}>🎉 Unlocked Content</h3>
                <div style={styles.contentText}>
                  {content.split("\n").map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              </div>
              <button onClick={() => setStatus("idle")} style={styles.secondaryButton}>
                Try Again
              </button>
            </div>
          )}

          {status === "error" && (
            <div style={styles.errorContainer}>
              <div style={styles.errorBadge}>❌ Error</div>
              <p style={styles.errorText}>{error}</p>
              <button onClick={() => setStatus("idle")} style={styles.button}>
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* Info Section */}
        <div style={styles.infoSection}>
          <h3 style={styles.infoTitle}>How it works</h3>
          <ol style={styles.stepsList}>
            <li>Connect your Freighter wallet</li>
            <li>Request protected content → get HTTP 402</li>
            <li>Sign payment in Freighter</li>
            <li>Transaction settles on Stellar</li>
            <li>Content unlocked!</li>
          </ol>
        </div>
      </div>
      
      <style jsx global>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0a0a1a 0%, #1a1a3e 50%, #0f0f2a 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
  },
  container: {
    maxWidth: "560px",
    width: "100%",
  },
  header: {
    textAlign: "center",
    marginBottom: "2rem",
  },
  title: {
    color: "#fff",
    fontSize: "2.5rem",
    fontWeight: "700",
    margin: 0,
    background: "linear-gradient(135deg, #fff 0%, #a5b4fc 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  subtitle: {
    color: "#8892b0",
    marginTop: "0.5rem",
    fontSize: "1.1rem",
  },
  walletSection: {
    marginBottom: "1.5rem",
    display: "flex",
    justifyContent: "center",
  },
  loadingBox: {
    color: "#8892b0",
    fontSize: "0.9rem",
  },
  warningBox: {
    background: "rgba(251, 191, 36, 0.1)",
    border: "1px solid rgba(251, 191, 36, 0.3)",
    borderRadius: "8px",
    padding: "1rem",
    textAlign: "center",
    color: "#fbbf24",
  },
  installLink: {
    color: "#fbbf24",
    textDecoration: "underline",
    marginTop: "0.5rem",
    display: "inline-block",
  },
  connectButton: {
    background: "rgba(99, 102, 241, 0.2)",
    border: "1px solid rgba(99, 102, 241, 0.5)",
    color: "#a5b4fc",
    padding: "0.75rem 1.5rem",
    borderRadius: "8px",
    fontSize: "1rem",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  walletInfo: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
  },
  walletBadge: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    background: "rgba(52, 211, 153, 0.1)",
    border: "1px solid rgba(52, 211, 153, 0.3)",
    padding: "0.5rem 1rem",
    borderRadius: "8px",
    color: "#34d399",
    fontSize: "0.9rem",
    fontFamily: "monospace",
  },
  walletDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: "#34d399",
  },
  networkBadge: {
    background: "rgba(139, 92, 246, 0.1)",
    border: "1px solid rgba(139, 92, 246, 0.3)",
    padding: "0.5rem 0.75rem",
    borderRadius: "6px",
    color: "#8b5cf6",
    fontSize: "0.8rem",
  },
  card: {
    background: "rgba(255, 255, 255, 0.03)",
    borderRadius: "20px",
    padding: "2rem",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    backdropFilter: "blur(10px)",
  },
  cardTitle: {
    color: "#fff",
    fontSize: "1.5rem",
    margin: "0 0 1rem 0",
    textAlign: "center",
  },
  blurredContent: {
    color: "#666",
    filter: "blur(3px)",
    padding: "1rem",
    marginBottom: "1.5rem",
    userSelect: "none",
    textAlign: "center",
    lineHeight: "1.6",
  },
  priceTag: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "1rem",
    marginBottom: "1.5rem",
  },
  price: {
    color: "#34d399",
    fontSize: "1.5rem",
    fontWeight: "600",
  },
  network: {
    color: "#8892b0",
    fontSize: "0.9rem",
    padding: "0.25rem 0.75rem",
    background: "rgba(255,255,255,0.05)",
    borderRadius: "4px",
  },
  button: {
    width: "100%",
    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
    color: "#fff",
    border: "none",
    padding: "1rem 2rem",
    borderRadius: "12px",
    fontSize: "1.1rem",
    cursor: "pointer",
    fontWeight: "600",
    transition: "all 0.2s ease",
  },
  secondaryButton: {
    width: "100%",
    background: "transparent",
    color: "#8892b0",
    border: "1px solid rgba(255,255,255,0.1)",
    padding: "0.75rem 1.5rem",
    borderRadius: "8px",
    fontSize: "0.9rem",
    cursor: "pointer",
    marginTop: "1rem",
  },
  statusContainer: {
    textAlign: "center",
    padding: "2rem 0",
  },
  spinner: {
    width: "40px",
    height: "40px",
    border: "3px solid rgba(255,255,255,0.1)",
    borderTopColor: "#6366f1",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
    margin: "0 auto 1rem",
  },
  statusText: {
    color: "#fff",
    fontSize: "1.1rem",
    marginBottom: "0.5rem",
  },
  subText: {
    color: "#8892b0",
    fontSize: "0.9rem",
  },
  paymentDetails: {
    color: "#8892b0",
    fontSize: "0.9rem",
    lineHeight: "1.8",
    marginTop: "1rem",
  },
  successContainer: {
    textAlign: "center",
  },
  successBadge: {
    display: "inline-block",
    background: "rgba(52, 211, 153, 0.15)",
    color: "#34d399",
    padding: "0.5rem 1rem",
    borderRadius: "8px",
    fontSize: "1rem",
    fontWeight: "600",
    marginBottom: "1rem",
  },
  txInfo: {
    background: "rgba(0,0,0,0.2)",
    borderRadius: "8px",
    padding: "1rem",
    marginBottom: "1.5rem",
  },
  txLabel: {
    color: "#8892b0",
    fontSize: "0.8rem",
    margin: "0 0 0.5rem 0",
  },
  txHash: {
    color: "#fff",
    fontSize: "0.75rem",
    wordBreak: "break-all",
    display: "block",
    fontFamily: "monospace",
  },
  mockNote: {
    color: "#666",
    fontSize: "0.75rem",
    marginTop: "0.5rem",
  },
  explorerLink: {
    color: "#6366f1",
    textDecoration: "none",
    fontSize: "0.85rem",
    display: "inline-block",
    marginTop: "0.5rem",
  },
  contentBox: {
    background: "rgba(52, 211, 153, 0.08)",
    borderRadius: "12px",
    padding: "1.5rem",
    textAlign: "left",
    marginBottom: "1rem",
  },
  contentTitle: {
    color: "#34d399",
    fontSize: "1.1rem",
    margin: "0 0 1rem 0",
  },
  contentText: {
    color: "#e2e8f0",
    fontSize: "0.95rem",
    lineHeight: "1.7",
  },
  errorContainer: {
    textAlign: "center",
    padding: "1rem 0",
  },
  errorBadge: {
    display: "inline-block",
    background: "rgba(248, 113, 113, 0.15)",
    color: "#f87171",
    padding: "0.5rem 1rem",
    borderRadius: "8px",
    fontSize: "1rem",
    fontWeight: "600",
    marginBottom: "1rem",
  },
  errorText: {
    color: "#f87171",
    fontSize: "0.9rem",
    marginBottom: "1.5rem",
  },
  infoSection: {
    marginTop: "2rem",
    padding: "1.5rem",
    background: "rgba(255,255,255,0.02)",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.05)",
  },
  infoTitle: {
    color: "#fff",
    fontSize: "1rem",
    margin: "0 0 1rem 0",
  },
  stepsList: {
    color: "#8892b0",
    fontSize: "0.85rem",
    lineHeight: "1.8",
    paddingLeft: "1.2rem",
    margin: 0,
  },
};
