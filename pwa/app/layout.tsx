import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./phase9-11.css";
import "./phase12-17.css";
import "./phase18-beginner.css";
import "./phase19-dashboard.css";
import "./phase20-device-e2e.css";
import "./openai-links.css";

export const metadata: Metadata = {
  title: "AI記事スタジオ PWA",
  description:
    "AI記事スタジオのPWA版。記事作成、画像計画、SNS投稿、公開管理をスマホとPCブラウザから分かりやすく利用できます。",
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
