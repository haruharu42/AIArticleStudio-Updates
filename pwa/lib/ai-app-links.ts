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

function openWebApp(app: AiAppLink): void {
  // Use a real target=_blank anchor instead of window.open so mobile Safari/PWA
  // keeps the AAS page available while the provider Web app opens separately.
  const anchor = document.createElement("a");
  anchor.href = app.webUrl;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.setAttribute("aria-hidden", "true");
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function openIosScheme(app: AiAppLink): void {
  // Keep the AAS page in place while iOS handles the provider custom scheme.
  // A real anchor click preserves a direct user gesture and avoids navigating
  // the current AAS tab to a custom-scheme URL when the user cancels.
  const anchor = document.createElement("a");
  anchor.href = app.iosScheme;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.setAttribute("aria-hidden", "true");
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function showIosLaunchChoice(app: AiAppLink): void {
  document.getElementById("aas-ios-ai-launch-choice")?.remove();

  const backdrop = document.createElement("div");
  backdrop.id = "aas-ios-ai-launch-choice";
  backdrop.className = "ai-ios-launch-backdrop";

  const dialog = document.createElement("div");
  dialog.className = "ai-ios-launch-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", `${app.name}を開く方法`);

  const title = document.createElement("strong");
  title.textContent = `${app.name}をどちらで開きますか？`;

  const help = document.createElement("p");
  help.textContent = "iPhone / iPadでは自動判定を行いません。アプリが入っている場合は「アプリを開く」を選んでください。";

  const actions = document.createElement("div");
  actions.className = "ai-ios-launch-actions";

  const appButton = document.createElement("button");
  appButton.type = "button";
  appButton.className = "ai-ios-launch-primary";
  appButton.textContent = `${app.name}アプリを開く`;

  const webButton = document.createElement("button");
  webButton.type = "button";
  webButton.className = "ai-ios-launch-secondary";
  webButton.textContent = "Web版を開く";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "ai-ios-launch-cancel";
  cancelButton.textContent = "キャンセル";

  const cleanup = () => backdrop.remove();

  appButton.addEventListener("click", () => {
    cleanup();
    openIosScheme(app);
  });
  webButton.addEventListener("click", () => {
    cleanup();
    openWebApp(app);
  });
  cancelButton.addEventListener("click", cleanup);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) cleanup();
  });
  backdrop.addEventListener("keydown", (event) => {
    if (event.key === "Escape") cleanup();
  });

  actions.append(appButton, webButton);
  dialog.append(title, help, actions, cancelButton);
  backdrop.append(dialog);
  document.body.append(backdrop);
  appButton.focus();
}

/**
 * Open an AI provider without embedding API credentials.
 *
 * Android keeps the one-tap package intent with an official Google Play
 * fallback. iPhone/iPad cannot reliably expose installed-app state to a PWA,
 * so AAS presents an explicit app/Web choice with no timer and no automatic
 * App Store redirect. Desktop browsers open the provider Web app separately.
 */
export function launchAiApp(key: AiAppKey): void {
  if (typeof window === "undefined") return;
  const app = AI_APP_LINKS[key];

  if (isAndroid()) {
    window.location.assign(buildAndroidIntent(app));
    return;
  }

  if (isIos()) {
    showIosLaunchChoice(app);
    return;
  }

  openWebApp(app);
}
