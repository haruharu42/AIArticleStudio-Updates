import type { Metadata, Viewport } from "next";
import { AccessStateProvider } from "@/components/access-state-provider";
import { AdminHomeTopbar } from "@/components/admin-home-topbar";
import { AppErrorReporter } from "@/components/app-error-reporter";
import { FreeTrialBanner } from "@/components/free-trial-banner";
import { WorkspacePresetProvider } from "@/features/presets/workspace-preset-provider";
import { KnowledgeRuntimeBootstrap } from "@/components/knowledge-runtime-bootstrap";
import { PersistentMobileNav } from "@/components/persistent-mobile-nav";
import { ReleaseAudienceGate } from "@/components/release-audience-gate";
import { ReleaseUpdateManager } from "@/components/release-update-manager";
import "./globals.css";
import "./phase9-11.css";
import "./phase12-17.css";
import "./phase18-beginner.css";
import "./phase19-dashboard.css";
import "./phase20-device-e2e.css";
import "./openai-links.css";
import "./phase21-transition-icons.css";
import "./phase22-persistent-nav.css";
import "./phase23-admin-dashboard.css";
import "./phase24-admin-promotion.css";
import "./phase25-user-personalization.css";
import "./phase25-selected-ai.css";
import "./phase26-knowledge.css";
import "./phase27-commerce.css";
import "./phase28-free-trial.css";
import "./phase29-admin-compact-entitlements.css";
import "./phase30-security-operations.css";
import "./phase31-help-nav.css";
import "./phase31-nav-flex.css";
import "./phase32-sales-settings.css";
import "./phase33-reference-ui.css";
import "./phase34-article-presets.css";
import "./phase35-device-layout.css";
import "./phase36-desktop-nav.css";
import "./phase37-release-management.css";
import "./phase38-note-operations.css";
import "./phase39-readability.css";
import "./phase40-account-design.css";
import "./phase41-support-center.css";
import "./phase42-route-transition.css";
import "./phase43-content-workflow.css";

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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        <ReleaseAudienceGate>
          <AccessStateProvider>
            <WorkspacePresetProvider>
              <AppErrorReporter />
              <KnowledgeRuntimeBootstrap />
              <AdminHomeTopbar />
              <div className="free-trial-global-shell"><FreeTrialBanner /></div>
              <ReleaseUpdateManager />
              {children}
              <PersistentMobileNav />
            </WorkspacePresetProvider>
          </AccessStateProvider>
        </ReleaseAudienceGate>
      </body>
    </html>
  );
}
