import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "x402 Stellar Demo",
  description: "Pay-to-view content using x402 protocol on Stellar",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}



