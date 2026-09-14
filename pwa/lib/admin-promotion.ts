export type AdminProductFacts = {
  productName: string;
  editions: string;
  releaseStage: string;
  targetAudience: string;
  features: string;
  priceText: string;
  salesUrl: string;
  support: string;
  limitations: string;
};

export type AdminArticlePromotionInput = {
  platform: "note" | "brain" | "tips" | "blog";
  purpose: string;
  audience: string;
  focus: string;
  cta: string;
};

export type AdminSocialPromotionInput = {
  platform: "x" | "instagram" | "threads" | "tiktok" | "youtube";
  purpose: string;
  audience: string;
  focus: string;
  cta: string;
  variants: number;
};

export type AdminCampaignInput = {
  campaignName: string;
  goal: string;
  audience: string;
  channels: string;
  offer: string;
  cta: string;
};

export const ADMIN_PRODUCT_FACTS_STORAGE_KEY = "aas:admin:promotion-product:v1";

export const DEFAULT_ADMIN_PRODUCT_FACTS: AdminProductFacts = {
  productName: "AI Article Studio",
  editions: "PWA版 / Windows版",
  releaseStage: "",
  targetAudience: "",
  features: [
    "7ステップの記事作成",
    "画像生成計画",
    "SNS投稿作成",
    "AI副業プランナー",
    "SNSアカウント設計",
    "記事出力",
    "公開管理",
    "コンテンツ分析",
  ].join("\n"),
  priceText: "",
  salesUrl: "",
  support: "",
  limitations: "",
};

function factsBlock(facts: AdminProductFacts): string {
  return [
    `製品名: ${facts.productName || "未設定"}`,
    `提供形態: ${facts.editions || "未設定"}`,
    `提供状況: ${facts.releaseStage || "未設定"}`,
    `想定ユーザー: ${facts.targetAudience || "未設定"}`,
    `確認済み機能:\n${facts.features || "未設定"}`,
    `価格・販売条件: ${facts.priceText || "未設定"}`,
    `販売URL: ${facts.salesUrl || "未設定"}`,
    `サポート: ${facts.support || "未設定"}`,
    `制限・注意事項: ${facts.limitations || "未設定"}`,
  ].join("\n");
}

const FACT_SAFETY = `【絶対ルール】
- 下記の「確認済み製品情報」に書かれていない機能、価格、実績、利用者数、売上、レビュー、キャンペーンを事実として作らない。
- 未入力・未確認の情報は推測で補完せず、必要なら「要確認」と明示する。
- 「必ず稼げる」「絶対に売れる」などの成果保証や過度な煽りを使わない。
- 架空の購入者レビュー、体験談、ランキング、権威づけを作らない。
- 競合サービスを根拠なく否定しない。`;

export function buildAdminArticlePromotionPrompt(
  facts: AdminProductFacts,
  input: AdminArticlePromotionInput,
): string {
  return `あなたは日本語のプロダクトマーケティング編集者です。
AI Article Studioを紹介・販売するための完成記事を作成してください。

${FACT_SAFETY}

【掲載条件】
掲載先: ${input.platform}
目的: ${input.purpose}
想定読者: ${input.audience || facts.targetAudience || "要確認"}
特に紹介したい内容: ${input.focus || "製品全体"}
CTA: ${input.cta || facts.salesUrl || "要確認"}

【確認済み製品情報】
${factsBlock(facts)}

【出力】
1. 一目で内容が伝わるタイトル候補を7案
2. 採用推奨タイトルを1案
3. そのまま掲載しやすいMarkdown完成記事
4. 構成は「読者の悩み → 製品でできること → 主な機能 → 利用イメージ → 向いている人 → 注意事項 → CTA」を基本にする
5. ${input.platform}の読者に合わせて見出し・文章量・CTAの強さを調整する
6. 記事末尾に、確認が必要な情報があれば「公開前チェック」として列挙する`;
}

export function buildAdminSocialPromotionPrompt(
  facts: AdminProductFacts,
  input: AdminSocialPromotionInput,
): string {
  const platformRule: Record<AdminSocialPromotionInput["platform"], string> = {
    x: "X向け。1投稿は140文字以内を目安にし、短く理解できる投稿と、必要なら連投案を作る。",
    instagram: "Instagram向け。通常投稿キャプション、6枚前後のカルーセル構成、短いリール台本を作る。",
    threads: "Threads向け。会話調で読みやすく、押し売り感を抑えた紹介投稿を作る。",
    tiktok: "TikTok向け。冒頭3秒のフック、30〜45秒の縦動画台本、画面テロップ案を作る。",
    youtube: "YouTube Shorts向け。30〜60秒の台本、タイトル案、概要欄用の短文を作る。",
  };

  return `あなたはSNSプロモーション担当者です。
AI Article Studioを紹介するSNS販促素材を作成してください。

${FACT_SAFETY}

【SNS条件】
媒体: ${input.platform}
目的: ${input.purpose}
想定読者: ${input.audience || facts.targetAudience || "要確認"}
紹介テーマ: ${input.focus || "製品全体"}
CTA: ${input.cta || facts.salesUrl || "要確認"}
作成数: ${Math.max(1, Math.min(10, input.variants))}案
媒体ルール: ${platformRule[input.platform]}

【確認済み製品情報】
${factsBlock(facts)}

【出力ルール】
- 同じ文面の使い回しではなく、媒体に合わせて構成を変える。
- 投稿ごとに狙いを1行で添える。
- ハッシュタグは必要な媒体だけ、過剰に付けない。
- 画像・動画が有効な場合は、投稿素材の構図案または画像生成プロンプトも付ける。
- 確認が必要な情報は最後に「公開前チェック」として分離する。`;
}

export function buildAdminCampaignPrompt(
  facts: AdminProductFacts,
  input: AdminCampaignInput,
): string {
  return `あなたはAI Article Studioの販売キャンペーン設計担当者です。
単発投稿ではなく、記事とSNSを連動させた販売・紹介キャンペーンを設計してください。

${FACT_SAFETY}

【キャンペーン】
名称: ${input.campaignName || "AASプロモーション"}
目的: ${input.goal}
想定読者: ${input.audience || facts.targetAudience || "要確認"}
使用媒体: ${input.channels}
販売条件・オファー: ${input.offer || facts.priceText || "要確認"}
CTA: ${input.cta || facts.salesUrl || "要確認"}

【確認済み製品情報】
${factsBlock(facts)}

【出力】
- キャンペーンの中心メッセージを1つ
- note / Brain / Tips等の長文記事テーマを3案
- X / Instagram / Threads / TikTok / YouTube Shortsのうち指定媒体向けの投稿企画
- 「予告 → 理解促進 → 機能紹介 → 販売開始 → FAQ → 再訴求」の流れを使った14日分の投稿カレンダー
- 各日の目的、投稿テーマ、CTA、必要素材
- 同じ訴求を連投しないための切り口ローテーション
- 公開前に人が確認すべき製品情報のチェックリスト`;
}
