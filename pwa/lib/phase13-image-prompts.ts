import { buildSuggestedImageFilename } from "@/lib/image-file-names";
import { buildPlatformAccountPromptContext } from "@/features/account-design";
import { getRuntimeWorkspacePresetDefinition, workspacePresetAppliesTo } from "@/features/presets/workspace-presets";
import { compileKnowledgeContext } from "@/lib/knowledge-engine";
import { buildUserPromptContext, getRuntimeWritingProfile } from "@/lib/user-personalization";

export type ImagePromptPlanInput = {
  title: string;
  theme: string;
  publicationTarget: "note" | "tips" | "brain" | "blog";
  genre: string;
  subgenre: string;
  ageGroup: string;
  gender: string;
  body?: string;
  coverEnabled: boolean;
  inlineEnabled: boolean;
  inlineCount: number;
};

export type ImagePromptItem = {
  kind: "cover" | "inline";
  order: number;
  insertionMarker: string | null;
  prompt: string;
  suggestedFilename: string;
  altText: string;
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

function articleBodyContext(body: string | undefined): string {
  const normalized = (body ?? "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const headings = lines
    .filter((line) => /^#{1,6}\s+/.test(line))
    .map((line) => line.replace(/^#{1,6}\s+/, ""))
    .slice(0, 12);
  const lead = lines
    .filter((line) => !/^#{1,6}\s+/.test(line) && !/^<!--\s*IMAGE:\d+\s*-->$/i.test(line))
    .join(" ")
    .slice(0, 900);
  return [
    headings.length ? `記事の主な見出し: ${headings.join(" / ")}` : "",
    lead ? `本文冒頭・要点: ${lead}` : "",
  ].filter(Boolean).join("\n");
}

function inlineBodyContext(body: string | undefined, order: number): string {
  const normalized = (body ?? "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";
  const number = String(order).padStart(2, "0");
  const marker = `<!-- IMAGE:${number} -->`;
  const index = normalized.indexOf(marker);
  if (index >= 0) {
    const start = Math.max(0, index - 500);
    const end = Math.min(normalized.length, index + marker.length + 500);
    return normalized.slice(start, end).replace(marker, "").trim();
  }
  const sections = normalized
    .split(/(?=^#{1,6}\s+)/m)
    .map((section) => section.trim())
    .filter(Boolean);
  return (sections[Math.min(Math.max(0, order - 1), Math.max(0, sections.length - 1))] ?? normalized).slice(0, 900);
}

function common(input: ImagePromptPlanInput): string {
  const knowledge = compileKnowledgeContext({
    task: "image",
    publicationTarget: input.publicationTarget,
    genre: input.genre,
    subgenre: input.subgenre,
    ageGroup: input.ageGroup,
    audience: input.gender && input.gender !== "AIおまかせ" ? `対象性別: ${input.gender}` : "",
  }).promptBlock;
  const promptOptimization = buildUserPromptContext(getRuntimeWritingProfile(), "image");
  const accountContext = buildPlatformAccountPromptContext(input.publicationTarget);
  const presetStyle = workspacePresetAppliesTo("images")
    ? getRuntimeWorkspacePresetDefinition().images.styleContext
    : "";
  const selectedStyle = presetStyle
    ? `${presetStyle} この記事ではこの共通プリセットの画風指定を既定画風より優先する。`
    : style;
  const bodyContext = articleBodyContext(input.body);
  return `記事タイトル: ${input.title || "未定"}\n掲載先: ${input.publicationTarget}\nジャンル: ${input.genre || "未指定"}\nサブジャンル: ${input.subgenre || "AIおまかせ"}\n対象読者: ${input.ageGroup || "AIおまかせ"} / ${input.gender || "AIおまかせ"}\n記事テーマ: ${input.theme || input.title || "タイトルから推定"}\n${bodyContext ? `${bodyContext}\n` : ""}画風: ${selectedStyle}。\n禁止・回避: ${avoid}\n\n${knowledge}${promptOptimization ? `\n\n${promptOptimization}` : ""}${accountContext}`;
}

export function buildImagePromptPlan(input: ImagePromptPlanInput): ImagePromptItem[] {
  const items: ImagePromptItem[] = [];
  if (input.coverEnabled) {
    const suggestedFilename = buildSuggestedImageFilename({ title: input.title, kind: "cover" });
    const altText = `${input.title || "記事"}の内容を表すアイキャッチ画像`;
    items.push({
      kind: "cover",
      order: 0,
      insertionMarker: null,
      suggestedFilename,
      altText,
      prompt: `次の記事用アイキャッチ画像を1枚作成してください。\n${common(input)}\n構図: 横長のアイキャッチを想定し、記事テーマが一目で伝わる主役を1つに絞る。人物を使う場合は親しみやすく、余白を十分に取る。\n文字方針: 原則として画像内文字は入れない。必要な場合でも記事タイトル全文を描画せず、短い補助語だけにする。\n推奨保存ファイル名: ${suggestedFilename}\n画像生成後はAASへアップロードせず、端末へこのファイル名で保存してください。`,
    });
  }
  if (input.inlineEnabled) {
    const count = Math.max(0, Math.min(10, Math.trunc(input.inlineCount)));
    for (let index = 0; index < count; index += 1) {
      const number = String(index + 1).padStart(2, "0");
      const suggestedFilename = buildSuggestedImageFilename({ title: input.title, kind: "inline", order: index + 1 });
      const altText = `${input.title || "記事"}の本文を補足する挿絵${index + 1}`;
      items.push({
        kind: "inline",
        order: index + 1,
        insertionMarker: `IMAGE:${number}`,
        suggestedFilename,
        altText,
        prompt: `次の記事の挿絵${index + 1}を1枚作成してください。\n${common(input)}\nこの挿絵が対応する本文周辺: ${inlineBodyContext(input.body, index + 1) || "本文全体から最適な場面を選ぶ"}\n役割: 本文の理解を助ける説明用挿絵。アイキャッチと同じ世界観を維持しつつ、同じ構図を繰り返さない。\n差し込みマーカー: <!-- IMAGE:${number} -->\n文字方針: 画像内に長文を入れず、図解が必要な場合も短いラベルだけにする。\n推奨保存ファイル名: ${suggestedFilename}\n画像生成後はAASへアップロードせず、端末へこのファイル名で保存してください。`,
      });
    }
  }
  return items;
}
