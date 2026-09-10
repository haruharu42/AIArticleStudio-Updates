import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./phase9-11.css";

export const metadata: Metadata = {
  title: "AI記事スタジオ PWA",
  description: "AI記事スタジオのPWA版。記事と画像をWindows版と共有し、閲覧・編集できます。",
  applicationName: "AI記事スタジオ",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
  other: {
    "codex-preview": "phase8-local",
    "aas-phase": "8",
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
