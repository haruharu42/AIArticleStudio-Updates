export type SupportedSocialPlatform =
  | "x"
  | "instagram"
  | "threads"
  | "tiktok"
  | "facebook"
  | "linkedin"
  | "pinterest"
  | "youtube";

export const SOCIAL_PLATFORM_OPTIONS = [
  { value: "x", label: "X" },
  { value: "instagram", label: "Instagram" },
  { value: "threads", label: "Threads" },
  { value: "tiktok", label: "TikTok" },
  { value: "facebook", label: "Facebook" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "pinterest", label: "Pinterest" },
  { value: "youtube", label: "YouTube" },
] as const;

const SOCIAL_URLS: Record<SupportedSocialPlatform, string> = {
  x: "https://x.com/compose/post",
  instagram: "https://www.instagram.com/",
  threads: "https://www.threads.net/",
  tiktok: "https://www.tiktok.com/",
  facebook: "https://www.facebook.com/",
  linkedin: "https://www.linkedin.com/feed/",
  pinterest: "https://www.pinterest.com/",
  youtube: "https://www.youtube.com/",
};

export function socialPlatformLabel(platform: SupportedSocialPlatform): string {
  return SOCIAL_PLATFORM_OPTIONS.find((option) => option.value === platform)?.label ?? platform;
}

export function socialPlatformUrl(platform: SupportedSocialPlatform): string {
  return SOCIAL_URLS[platform];
}

export function socialLaunchHint(): string {
  return "スマホでは対応アプリが入っていればアプリで開き、PCではWeb版を開きます。端末やブラウザーの設定によりWeb表示になる場合があります。";
}
