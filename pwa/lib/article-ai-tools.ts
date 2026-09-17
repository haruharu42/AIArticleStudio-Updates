export type ArticleAiToolInput = {
  title: string;
  publicationTarget: string;
  articleType: "free" | "paid";
  genre: string | null;
  subgenre: string | null;
  body: string;
};

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\r\n/g, "\n").trim();
}

function articleContext(input: ArticleAiToolInput): string {
  return [
    `掲載先: ${clean(input.publicationTarget) || "未指定"}`,
    `記事タイプ: ${input.articleType === "paid" ? "有料" : "無料"}`,
    `ジャンル: ${clean(input.genre) || "未指定"}`,
    `サブジャンル: ${clean(input.subgenre) || "未指定"}`,
    `タイトル: ${clean(input.title) || "無題"}`,
  ].join("\n");
}

const SAFETY_RULES = [
  "ユーザーが入力していない実体験・実績・レビュー・購入経験・使用経験を事実として作らない。",
  "価格・在庫・評価・キャンペーン・統計・ランキング・最新仕様など、確認できない変動情報を断定しない。",
  "競合記事や既存作品の文章をコピー・近似模倣しない。",
  "根拠のない成果保証、過度な煽り、架空の権威づけをしない。",
  "元記事にない固有名詞・数値・引用を事実として追加しない。",
];

export function buildArticleRewritePrompt(input: ArticleAiToolInput): string {
  return [
    "あなたは日本語の編集者兼リライト担当です。以下の記事を、事実関係を増やさず、読みやすさ・構成・具体性を改善してリライトしてください。",
    "",
    "【絶対ルール】",
    ...SAFETY_RULES.map((rule) => `- ${rule}`),
    "- 元記事の主張や意味を勝手に変更しない。",
    "- 出力は完成したリライト本文のみ。作業メモや前置きは付けない。",
    "- Markdown見出しを使い、スマートフォンでも読みやすい段落にする。",
    "",
    "【記事条件】",
    articleContext(input),
    "",
    "【元記事】",
    clean(input.body) || "（本文なし）",
  ].join("\n");
}

export function buildArticleAssistPrompt(input: ArticleAiToolInput): string {
  return [
    "あなたは日本語記事の編集監査担当です。以下の記事を診断し、公開前に改善すべき点を優先順位付きで提案してください。本文そのものは書き換えず、改善案を返してください。",
    "",
    "【確認項目】",
    "- タイトルと本文の一致",
    "- 初心者にも理解できる構成・用語説明",
    "- 見出し順序と重複",
    "- 抽象的すぎる箇所と、追加すると有用な具体例の種類",
    "- 根拠が必要な断定、最新確認が必要な情報",
    "- 誇張、成果保証、架空の体験談に見える表現",
    "- 掲載先と無料/有料記事としての読みやすさ",
    "- 読者が次に取れる行動が明確か",
    "",
    "【絶対ルール】",
    ...SAFETY_RULES.map((rule) => `- ${rule}`),
    "- 問題がない項目を無理に問題化しない。",
    "- 出力は『優先度 / 対象箇所 / 問題 / 改善案』が分かる形にする。",
    "",
    "【記事条件】",
    articleContext(input),
    "",
    "【診断対象の記事】",
    clean(input.body) || "（本文なし）",
  ].join("\n");
}
