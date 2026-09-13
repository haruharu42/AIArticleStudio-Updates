export type AiAppKey = "chatgpt" | "claude" | "gemini";

export type AiAppLink = {
  key: AiAppKey;
  name: string;
  webUrl: string;
  iosStoreUrl: string;
  androidStoreUrl: string;
  iosScheme: string;
  androidPackage: string;
  description: string;
};

export const AI_APP_LINKS: Record<AiAppKey, AiAppLink> = {
  chatgpt: {
    key: "chatgpt",
    name: "ChatGPT",
    webUrl: "https://chatgpt.com/",
    iosStoreUrl: "https://apps.apple.com/jp/app/chatgpt/id6448311069",
    androidStoreUrl: "https://play.google.com/store/apps/details?id=com.openai.chatgpt",
    iosScheme: "chatgpt://",
    androidPackage: "com.openai.chatgpt",
    description: "アイデア出し・記事作成・画像生成",
  },
  claude: {
    key: "claude",
    name: "Claude",
    webUrl: "https://claude.ai/",
    iosStoreUrl: "https://apps.apple.com/jp/app/claude-by-anthropic/id6473753684",
    androidStoreUrl: "https://play.google.com/store/apps/details?id=com.anthropic.claude",
    iosScheme: "claude://",
    androidPackage: "com.anthropic.claude",
    description: "長文作成・推敲・深い整理",
  },
  gemini: {
    key: "gemini",
    name: "Gemini",
    webUrl: "https://gemini.google.com/",
    iosStoreUrl: "https://apps.apple.com/jp/app/google-gemini/id6477489729",
    androidStoreUrl: "https://play.google.com/store/apps/details?id=com.google.android.apps.bard",
    iosScheme: "googleapp://robin",
    androidPackage: "com.google.android.apps.bard",
    description: "調査・情報整理・Google連携",
  },
};

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isAndroid(): boolean {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

function buildAndroidIntent(app: AiAppLink): string {
  const target = new URL(app.webUrl);
  const path = `${target.host}${target.pathname}${target.search}`;
  return `intent://${path}#Intent;scheme=https;package=${app.androidPackage};S.browser_fallback_url=${encodeURIComponent(app.androidStoreUrl)};end`;
}

function launchIosApp(app: AiAppLink): void {
  // iOS blocks or delays custom-scheme navigation when it is attempted from a
  // hidden iframe. Use the provider's HTTPS destination directly from the
  // user's tap instead. iOS can hand a Universal Link to an installed app; if
  // there is no associated app, Safari opens the official web destination
  // immediately. This avoids the artificial timeout and incorrect App Store
  // fallback that were observed on real iPhone hardware.
  window.location.assign(app.webUrl);
}

/**
 * Open an AI app from the PWA without embedding API credentials.
 *
 * Android uses an intent URL with a Google Play fallback. iOS uses the
 * provider's official HTTPS destination so Universal Link handling can open an
 * installed app without a timer; otherwise Safari opens the web app. Desktop
 * browsers open the provider's web app in a new tab.
 */
export function launchAiApp(key: AiAppKey): void {
  if (typeof window === "undefined") return;
  const app = AI_APP_LINKS[key];

  if (isAndroid()) {
    window.location.assign(buildAndroidIntent(app));
    return;
  }

  if (isIos()) {
    launchIosApp(app);
    return;
  }

  window.open(app.webUrl, "_blank", "noopener,noreferrer");
}
