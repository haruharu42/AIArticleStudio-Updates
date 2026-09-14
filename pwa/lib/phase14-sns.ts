import type { ArticleDetail } from "@/lib/phase7-articles";
import { compileKnowledgeContext } from "@/lib/knowledge-engine";
import { socialPlatformLabel } from "@/lib/social-links";

export type SocialPlatform = "x" | "instagram" | "threads" | "tiktok" | "facebook" | "linkedin" | "pinterest" | "youtube";
export type SocialGoal =
  | "article_traffic"
  | "engagement"
  | "product_interest"
  | "profile_growth"
  | "community"
  | "lead_generation"
  | "brand_awareness";

export type SocialPromptInput = {
  platform: SocialPlatform;
  goal: SocialGoal;
  tone: string;
  maxCharacters: number | null;
  hashtags: boolean;
};

const platformRules: Record<SocialPlatform, string[]> = {
  x: ["最初の1〜2文でテーマを明確にし、短く読みやすくする", "単発投稿・連続投稿・返信へ展開しやすい形にする"],
  instagram: ["フィード/カルーセル/リールへ転用しやすいフック→要点→行動の順にする", "画像だけに意味を依存せずキャプションでも内容が分かるようにする"],
  threads: ["会話調でも情報密度を落とさず1投稿ごとに意味が通るようにする", "必要なら複数投稿案を示し同じ言い回しを繰り返さない"],
  tiktok: ["冒頭で何が分かる動画かを明確にし短尺動画の台本へ転用しやすくする", "画面テキスト・話す内容・CTAを分けて考えられる構成にする"],
  facebook: ["前提や背景を少し丁寧に説明し読み手が文脈を理解できる投稿にする", "コミュニティで会話につながる自然な問いかけを使う"],
  linkedin: ["仕事・学び・業界知識として読めるよう結論と根拠を整理する", "過度な自己演出を避け実務に役立つ具体性を優先する"],
  pinterest: ["検索・保存される前提でテーマと得られる内容を明確にする", "画像・ボード説明へ転用しやすい短い見出しと説明を用意する"],
  youtube: ["動画概要欄・コミュニティ投稿・Shorts告知へ転用しやすくする", "動画を見る理由を具体化し誇張したクリック誘導を避ける"],
};

const goalRule: Record<SocialGoal, string> = {
  article_traffic: "記事の内容を先に少し提供し、続きを読む理由が自然に伝わるCTAにする",
  engagement: "読者が自分の状況を答えやすい具体的な問いかけを最後に置く",
  product_interest: "購入を煽らず、対象者・得られる内容・向かない人を簡潔に示す",
  profile_growth: "フォローを直接迫らず、今後どんな情報を継続発信するかが伝わる内容にする",
  community: "一方的な告知ではなく、共通テーマについて参加しやすい会話の入口を作る",
  lead_generation: "相談・問い合わせへ急がせず、対象者と相談できる内容を具体的に示す",
  brand_awareness: "名称だけを繰り返さず、扱うテーマ・価値観・専門領域が自然に伝わるようにする",
};

function sourceBody(article: ArticleDetail): string {
  const body = article.workspace.publishBody || article.body;
  const limit = 18000;
  if (body.length <= limit) return body;
  return `${body.slice(0, limit)}\n\n[本文は長いためここで省略]`;
}

export function buildSocialPrompt(article: ArticleDetail, input: SocialPromptInput): string {
  const platformName = socialPlatformLabel(input.platform);
  const maxRule = input.maxCharacters && input.maxCharacters > 0
    ? `目安文字数: ${Math.trunc(input.maxCharacters)}文字以内。現在のプラットフォーム仕様を断定する値ではなく、この依頼内の編集目安として守る。`
    : "文字数は読みやすさを優先し、冗長にしない。";
  const hashRule = input.hashtags
    ? "関連性の高いハッシュタグ候補を最後に少数だけ付ける。流行や人気度を未確認で断定しない。"
    : "ハッシュタグは付けない。";
  const knowledge = compileKnowledgeContext({
    task: "social",
    publicationTarget: article.publicationTarget,
    articleType: article.articleType,
    genre: article.genre || "",
    subgenre: article.subgenre || "",
    purpose: input.goal,
    audience: `SNS媒体: ${platformName} / トーン: ${input.tone.trim() || "親しみやすく具体的"}`,
  }).promptBlock;

  return `あなたは日本語のSNS編集者です。以下の記事を元に${platformName}投稿案を作成してください。\n\n【絶対ルール】\n- 記事にない実体験・実績・レビュー・成果を追加しない。\n- 未確認の価格・在庫・統計・ランキング・最新仕様を断定しない。\n- 記事本文や第三者コンテンツを長くそのまま転載せず、SNS向けに要約・再構成する。\n- 過度な煽り、成果保証、架空の権威づけをしない。\n- リンク先を読まないと意味が分からない釣り投稿にしない。\n\n【投稿条件】\nプラットフォーム: ${platformName}\n目的: ${input.goal}\nトーン: ${input.tone.trim() || "親しみやすく具体的"}\n${maxRule}\n${hashRule}\n${platformRules[input.platform].map((rule) => `- ${rule}`).join("\n")}\n- ${goalRule[input.goal]}\n\n${knowledge}\n\n【元記事】\nタイトル: ${article.title}\n掲載先: ${article.publicationTarget}\n記事タイプ: ${article.articleType}\nジャンル: ${article.genre || "未指定"}\nサブジャンル: ${article.subgenre || "未指定"}\n公開URL: ${article.publishedUrl || "未公開"}\n\n【本文】\n${sourceBody(article)}\n\n【出力】\n1. そのまま使える投稿案を3案\n2. 各案の狙いを1行\n3. 記事URLがある場合だけ自然なCTAへ含める\n4. 誇張なし・コピペ投稿しやすい形で出力`;
}
