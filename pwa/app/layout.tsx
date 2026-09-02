import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI記事スタジオ PWA",
  description: "AI記事スタジオのPWA版。Phase 6では認証と利用権を安全に確認します。",
  applicationName: "AI記事スタジオ",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
  other: {
    "codex-preview": "phase6-local",
    "aas-phase": "6",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#081225",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
