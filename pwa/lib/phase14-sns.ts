import type { ArticleDetail } from "@/lib/phase7-articles";

export type SocialPlatform = "x" | "instagram" | "threads";
export type SocialGoal = "article_traffic" | "engagement" | "product_interest";

export type SocialPromptInput = {
  platform: SocialPlatform;
  goal: SocialGoal;
  tone: string;
  maxCharacters: number | null;
  hashtags: boolean;
};

const platformName: Record<SocialPlatform, string> = {
  x: "X",
  instagram: "Instagram",
  threads: "Threads",
};

const platformRules: Record<SocialPlatform, string[]> = {
  x: [
    "最初の1〜2文でテーマを明確にし、短く読みやすくする",
    "箇条書きや改行を使い、投稿単体でも1つの学びがある内容にする",
  ],
  instagram: [
    "フィード/カルーセルへ転用しやすいよう、フック→要点→行動の順にする",
    "画像だけに意味を依存せず、キャプションでも内容が理解できるようにする",
  ],
  threads: [
    "会話調でも情報密度を落とさず、1投稿ごとに意味が通るようにする",
    "必要なら複数投稿案を示し、同じ言い回しを繰り返さない",
  ],
};

const goalRule: Record<SocialGoal, string> = {
  article_traffic: "記事の内容を先に少し提供し、続きを読む理由が自然に伝わるCTAにする",
  engagement: "読者が自分の状況を答えやすい具体的な問いかけを最後に置く",
  product_interest: "購入を煽らず、対象者・得られる内容・向かない人を簡潔に示す",
};

function sourceBody(article: ArticleDetail): string {
  const body = article.workspace.publishBody || article.body;
  const limit = 18000;
  if (body.length <= limit) return body;
  return `${body.slice(0, limit)}\n\n[本文は長いためここで省略]`;
}

export function buildSocialPrompt(
  article: ArticleDetail,
  input: SocialPromptInput,
): string {
  const maxRule =
    input.maxCharacters && input.maxCharacters > 0
      ? `目安文字数: ${Math.trunc(input.maxCharacters)}文字以内。現在のプラットフォーム仕様を断定する値ではなく、この依頼内の編集目安として守る。`
      : "文字数は読みやすさを優先し、冗長にしない。";
  const hashRule = input.hashtags
    ? "関連性の高いハッシュタグ候補を最後に少数だけ付ける。流行や人気度を未確認で断定しない。"
    : "ハッシュタグは付けない。";

  return `あなたは日本語のSNS編集者です。以下の記事を元に${platformName[input.platform]}投稿案を作成してください。\n\n【絶対ルール】\n- 記事にない実体験・実績・レビュー・成果を追加しない。\n- 未確認の価格・在庫・統計・ランキング・最新仕様を断定しない。\n- 記事本文や第三者コンテンツを長くそのまま転載せず、SNS向けに要約・再構成する。\n- 過度な煽り、成果保証、架空の権威づけをしない。\n- リンク先を読まないと意味が分からない釣り投稿にしない。\n\n【投稿条件】\nプラットフォーム: ${platformName[input.platform]}\n目的: ${input.goal}\nトーン: ${input.tone.trim() || "親しみやすく具体的"}\n${maxRule}\n${hashRule}\n${platformRules[input.platform].map((rule) => `- ${rule}`).join("\n")}\n- ${goalRule[input.goal]}\n\n【元記事】\nタイトル: ${article.title}\n掲載先: ${article.publicationTarget}\n記事タイプ: ${article.articleType}\nジャンル: ${article.genre || "未指定"}\nサブジャンル: ${article.subgenre || "未指定"}\n公開URL: ${article.publishedUrl || "未公開"}\n\n【本文】\n${sourceBody(article)}\n\n【出力】\n1. そのまま使える投稿案を3案\n2. 各案の狙いを1行\n3. 記事URLがある場合だけ自然なCTAへ含める\n4. 誇張なし・コピペ投稿しやすい形で出力`;
}
