import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI記事スタジオ PWA",
  description: "AI記事スタジオのPWA版。自分のクラウド記事を安全に閲覧・編集・削除できます。",
  applicationName: "AI記事スタジオ",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
  other: {
    "codex-preview": "phase7-local",
    "aas-phase": "7",
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
