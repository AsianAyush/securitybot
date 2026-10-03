import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SecuritySTEX - Secure Discord Verification System",
  description:
    "Enterprise-grade Discord verification gateway featuring real-time VPN/Proxy detection, multi-account prevention, and automated role provisioning.",
  keywords: [
    "Discord Verification",
    "SecuritySTEX",
    "Anti-Alt Discord Bot",
    "VPN Blocker",
    "Proxy Detection",
    "Server Security",
  ],
  authors: [{ name: "SecuritySTEX Security Team" }],
  openGraph: {
    title: "SecuritySTEX | Secure Discord Verification Gateway",
    description: "Verify your Discord account securely with automated anti-alt and VPN filtering.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#080c14",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#080c14] text-slate-100 antialiased selection:bg-indigo-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
