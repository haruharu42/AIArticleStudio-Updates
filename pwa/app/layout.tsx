import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./phase9-11.css";
import "./phase12-17.css";
import "./phase18-beginner.css";
import "./openai-links.css";

export const metadata: Metadata = {
  title: "AI記事スタジオ PWA",
  description:
    "AI記事スタジオのPWA版。Windows版と記事・画像を共有し、記事作成、SNS設計、公開管理、内部分析を利用できます。",
  applicationName: "AI記事スタジオ",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
  other: {
    "aas-phase": "17",
    "aas-release-stage": "production-preview",
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
  themeColor: "#f6f9ff",
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
