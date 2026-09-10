export type ImagePromptPlanInput = {
  title: string;
  theme: string;
  publicationTarget: "note" | "tips" | "brain" | "blog";
  genre: string;
  subgenre: string;
  ageGroup: string;
  gender: string;
  coverEnabled: boolean;
  inlineEnabled: boolean;
  inlineCount: number;
};

export type ImagePromptItem = {
  kind: "cover" | "inline";
  order: number;
  insertionMarker: string | null;
  prompt: string;
};

const style = [
  "日本の現代的な2Dアニメ調",
  "クリーンで明瞭な線画",
  "セル塗り寄りの2〜3段階の陰影",
  "整理された髪の束感",
  "自然で印象的な目元",
  "アニメ背景美術らしい空気感",
  "人物・背景・小物・UIモチーフまで一貫した2D表現",
].join("、");

const avoid = [
  "写真・半写実・3D・水彩・絵本・フラット広告・ベクター表現にしない",
  "既存作品・特定作家・実在人物の画風や外見を模倣しない",
  "実在ブランドのロゴ・商標・特徴的な商品形状を入れない",
  "記事に根拠のない数字・ランキング・価格・評価を画像内へ書かない",
].join("。") + "。";

function common(input: ImagePromptPlanInput): string {
  return `記事タイトル: ${input.title || "未定"}\n掲載先: ${input.publicationTarget}\nジャンル: ${input.genre || "未指定"}\nサブジャンル: ${input.subgenre || "AIおまかせ"}\n対象読者: ${input.ageGroup || "AIおまかせ"} / ${input.gender || "AIおまかせ"}\n記事テーマ: ${input.theme || "タイトルから推定"}\n画風: ${style}。\n禁止・回避: ${avoid}`;
}

export function buildImagePromptPlan(input: ImagePromptPlanInput): ImagePromptItem[] {
  const items: ImagePromptItem[] = [];
  if (input.coverEnabled) {
    items.push({
      kind: "cover",
      order: 0,
      insertionMarker: null,
      prompt: `次の記事用アイキャッチ画像を1枚作成してください。\n${common(input)}\n構図: 横長のアイキャッチを想定し、記事テーマが一目で伝わる主役を1つに絞る。人物を使う場合は親しみやすく、余白を十分に取る。\n文字方針: 原則として画像内文字は入れない。必要な場合でも記事タイトル全文を描画せず、短い補助語だけにする。`,
    });
  }
  if (input.inlineEnabled) {
    const count = Math.max(0, Math.min(10, Math.trunc(input.inlineCount)));
    for (let index = 0; index < count; index += 1) {
      const number = String(index + 1).padStart(2, "0");
      items.push({
        kind: "inline",
        order: index + 1,
        insertionMarker: `IMAGE:${number}`,
        prompt: `次の記事の挿絵${index + 1}を1枚作成してください。\n${common(input)}\n役割: 本文の理解を助ける説明用挿絵。アイキャッチと同じ世界観を維持しつつ、同じ構図を繰り返さない。\n差し込みマーカー: <!-- IMAGE:${number} -->\n文字方針: 画像内に長文を入れず、図解が必要な場合も短いラベルだけにする。`,
      });
    }
  }
  return items;
}
