export const OPENAI_LINKS = {
  chatgpt: "https://chatgpt.com/",
  images: "https://chatgpt.com/images/",
  codex: "https://chatgpt.com/codex/",
} as const;

export type OpenAiLinkKey = keyof typeof OPENAI_LINKS;
