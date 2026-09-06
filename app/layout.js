import "./globals.css";
import Script from "next/script";
import { AuthProvider } from "./context/AuthContext";
import { BrandingProvider } from "./context/BrandingContext";

export const metadata = {
  title: "Asuk Tech — Wi-Fi Pass & Wallet",
  description: "Buy Wi-Fi vouchers instantly. Fund your wallet, purchase hotspot passes, and connect in seconds.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet" />
      </head>
      <body suppressHydrationWarning>
        <AuthProvider>
          <BrandingProvider>
            {children}
          </BrandingProvider>
        </AuthProvider>
        <Script src="https://checkout.flutterwave.com/v3.js" strategy="lazyOnload" />
      </body>
    </html>
  );
}
