import type { Metadata, Viewport } from "next";
import "./globals.css";

const appName = process.env.NEXT_PUBLIC_APP_NAME || "Monitoring Merchant LVM";

export const metadata: Metadata = {
  title: { default: appName, template: `%s · ${appName}` },
  description: "Pemantauan performa merchant cabang dan prioritas follow-up menuju rasio USAK 50%.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f2ee" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
