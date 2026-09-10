import type { SupabaseClient } from "@supabase/supabase-js";

import { PWA_PRODUCT_CODE } from "@/lib/phase6-access";
import { getPromptSpecialization } from "@/lib/phase12-prompt-profiles";
import { buildImagePromptPlan } from "@/lib/phase13-image-prompts";

export type PublicationTarget = "note" | "tips" | "brain" | "blog";
export type ArticleType = "free" | "paid";
export type GenerationMode = "prompt_export" | "manual";
export type SaveStatus = "draft" | "writing" | "ready";

export type ArticleCreationDraft = {
  generationMode: GenerationMode;
  theme: string;
  title: string;
  publicationTarget: PublicationTarget;
  articleType: ArticleType;
  genre: string;
  subgenre: string;
  ageGroup: string;
  gender: string;
  targetLength: number;
  price: number | null;
  affiliateEnabled: boolean;
  magazineEnabled: boolean;
  tags: string[];
  coverEnabled: boolean;
  inlineEnabled: boolean;
  inlineCount: number;
  body: string;
  saveStatus: SaveStatus;
};

export type CreatedArticle = {
  id: string;
  title: string;
  revision: number;
};

const targetName: Record<PublicationTarget, string> = {
  note: "note",
  tips: "Tips",
  brain: "Brain",
  blog: "ブログ",
};

function normalizeLines(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

function compactTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 50);
}

export function suggestLocalTitles(
  draft: Pick<
    ArticleCreationDraft,
    "theme" | "publicationTarget" | "articleType" | "ageGroup" | "genre"
  >,
): string[] {
  const theme = draft.theme.trim() || draft.genre.trim() || "テーマ";
  const age = draft.ageGroup.trim() ? `${draft.ageGroup.trim()}向け` : "初心者向け";
  const paid = draft.articleType === "paid" ? "実践ガイド" : "入門ガイド";
  const site = targetName[draft.publicationTarget];
  return [
    `${theme}は何から始める？${age}に分かりやすく始め方を整理`,
    `${theme}入門｜${age}のための選び方・進め方${paid}`,
    `迷わない${theme}の始め方｜${age}に必要な準備と手順`,
    `${site}で学ぶ${theme}｜初心者が最初に押さえたいポイント`,
    `${theme}を無理なく始める方法｜${age}のチェックリスト付き`,
  ];
}

export function buildTitlePrompt(draft: ArticleCreationDraft): string {
  return `あなたは日本語の編集者です。次の条件で記事タイトル候補を10個作成してください。\n\n【絶対ルール】\n- 実体験・実績・レビューを創作しない。\n- 未確認の価格・在庫・評価・ランキング・統計を断定しない。\n- 競合記事のコピーや近似模倣をしない。\n- 根拠のない成果保証や過度な煽りを使わない。\n\n【条件】\n掲載先: ${targetName[draft.publicationTarget]}\n記事タイプ: ${draft.articleType === "paid" ? "有料" : "無料"}\nジャンル: ${draft.genre || "未指定"}\nサブジャンル: ${draft.subgenre || "AIおまかせ"}\n対象年齢: ${draft.ageGroup || "AIおまかせ"}\n対象性別: ${draft.gender || "AIおまかせ"}\nテーマ: ${draft.theme || "記事テーマから提案"}\n\n一目で内容が分かり、誇張せず、読者がクリック後の内容を想像できるタイトルにしてください。タイトルだけを番号付きで出力してください。`;
}

export function buildArticlePrompt(draft: ArticleCreationDraft): string {
  const imageRule = draft.coverEnabled || draft.inlineEnabled
    ? `画像計画: アイキャッチ=${draft.coverEnabled ? "あり" : "なし"}、挿絵=${draft.inlineEnabled ? `${draft.inlineCount}枚` : "なし"}。本文中で挿絵が有効な場合は「<!-- IMAGE:01 -->」のような差し込み候補位置を自然な区切りに置いてください。`
    : "画像計画: なし。";
  const specialization = getPromptSpecialization({
    publicationTarget: draft.publicationTarget,
    articleType: draft.articleType,
    genre: draft.genre,
    subgenre: draft.subgenre,
    ageGroup: draft.ageGroup,
    gender: draft.gender,
  });
  return `あなたは日本語の編集者兼記事ライターです。\n目的は、指定された掲載先へそのまま掲載できる、具体的で読みやすく、読者が行動できる完成記事を作ることです。\n\n【絶対ルール】\n- ユーザーが入力していない実体験・実績・レビュー・購入経験・使用経験を事実として作らない。\n- 価格、在庫、評価、キャンペーン、統計、販売数、ランキング、最新仕様など変動する情報を未確認のまま断定しない。\n- 競合記事の文章をコピー・近似模倣しない。\n- 根拠のない成果保証、過度な煽り、架空の権威づけをしない。\n- 架空例を使う場合は「例」「想定」と明示する。\n- 文字数を水増しせず、手順・判断基準・具体例・チェックリスト等で価値を作る。\n\n【出力】\n- 日本語。\n- Markdown見出しで明確に構造化する。\n- 余計な前置き、メタ説明、生成方針の説明は付けない。\n- 完成記事本文だけを返す。\n\n【ARTICLE BRIEF】\nタイトル: ${draft.title || "タイトル候補から選択"}\n掲載先: ${targetName[draft.publicationTarget]}\n記事タイプ: ${draft.articleType === "paid" ? "有料" : "無料"}\nジャンル: ${draft.genre || "未指定"}\nサブジャンル: ${draft.subgenre || "AIおまかせ"}\n対象年齢: ${draft.ageGroup || "AIおまかせ"}\n対象性別: ${draft.gender || "AIおまかせ"}\nテーマ: ${draft.theme || "タイトルから推定"}\n文字数目安: 約${draft.targetLength}文字\n価格: ${draft.articleType === "paid" && draft.price !== null ? `${draft.price}円` : "設定なし"}\nアフィリエイト: ${draft.affiliateEnabled ? "ON" : "OFF"}\nマガジン: ${draft.magazineEnabled ? "ON" : "OFF"}\n${imageRule}\n\n${specialization}\n\n掲載先と無料/有料の性質に合わせ、導入、見出し構成、具体例、手順、注意点、必要に応じたCTAを自然に最適化してください。`;
}

async function requireAccess(
  client: SupabaseClient,
  ownerId: string,
): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();
  if (userError || !user || user.id.toLowerCase() !== ownerId.toLowerCase()) {
    throw new Error("ログイン状態を確認できません。");
  }
  const { data, error } = await client.rpc("can_access_product", {
    p_product_code: PWA_PRODUCT_CODE,
  });
  if (error || data !== true) throw new Error("PWA利用権を確認できません。");
}

export function validateCreationDraft(
  input: ArticleCreationDraft,
): ArticleCreationDraft {
  const draft: ArticleCreationDraft = {
    ...input,
    theme: input.theme.trim(),
    title: input.title.trim(),
    genre: input.genre.trim(),
    subgenre: input.subgenre.trim(),
    ageGroup: input.ageGroup.trim(),
    gender: input.gender.trim(),
    body: normalizeLines(input.body),
    tags: compactTags(input.tags),
  };
  if (!draft.title || draft.title.length > 500) {
    throw new Error("タイトルを1〜500文字で入力してください。");
  }
  if (
    !Number.isSafeInteger(draft.targetLength) ||
    draft.targetLength < 500 ||
    draft.targetLength > 50000
  ) {
    throw new Error("文字数目安は500〜50000文字で指定してください。");
  }
  if (
    !Number.isSafeInteger(draft.inlineCount) ||
    draft.inlineCount < 0 ||
    draft.inlineCount > 10
  ) {
    throw new Error("挿絵枚数は0〜10枚で指定してください。");
  }
  if (
    draft.articleType === "paid" &&
    (draft.price === null ||
      !Number.isSafeInteger(draft.price) ||
      draft.price < 0)
  ) {
    throw new Error("有料記事は0以上の整数価格を設定してください。");
  }
  if (draft.articleType === "free") draft.price = null;
  if (!draft.inlineEnabled) draft.inlineCount = 0;
  return draft;
}

export async function createArticleFromWizard(
  client: SupabaseClient,
  ownerId: string,
  input: ArticleCreationDraft,
): Promise<CreatedArticle> {
  const draft = validateCreationDraft(input);
  await requireAccess(client, ownerId);

  const article = {
    title: draft.title,
    publication_target: draft.publicationTarget,
    article_type: draft.articleType,
    genre: draft.genre || null,
    subgenre: draft.subgenre || null,
    body: draft.body,
    status: draft.saveStatus,
    price: draft.price,
    tags: draft.tags,
  };
  const imagePrompts = buildImagePromptPlan({
    title: draft.title,
    theme: draft.theme,
    publicationTarget: draft.publicationTarget,
    genre: draft.genre,
    subgenre: draft.subgenre,
    ageGroup: draft.ageGroup,
    gender: draft.gender,
    coverEnabled: draft.coverEnabled,
    inlineEnabled: draft.inlineEnabled,
    inlineCount: draft.inlineCount,
  });
  const workspace = {
    request_json: {
      platform: targetName[draft.publicationTarget],
      article_type: draft.articleType === "paid" ? "有料" : "無料",
      genre: draft.genre,
      subgenre: draft.subgenre,
      age_group: draft.ageGroup,
      gender: draft.gender,
      target_length: draft.targetLength,
      price_jpy: draft.price,
      affiliate_enabled: draft.affiliateEnabled,
      magazine_enabled: draft.magazineEnabled,
      theme: draft.theme,
      tags: draft.tags,
      generation_method: draft.generationMode,
    },
    workspace_json: {
      wizard_version: 11,
      prompt_profile_version: 12,
      image_prompt_version: 13,
      selected_title: draft.title,
      generation_method: draft.generationMode,
      local_status: draft.saveStatus === "ready" ? "完成" : draft.saveStatus,
      local_updated_at: null,
    },
    image_plan_json: {
      enabled: draft.coverEnabled || draft.inlineEnabled,
      cover: {
        enabled: draft.coverEnabled,
        required: draft.coverEnabled,
      },
      inline: {
        enabled: draft.inlineEnabled,
        count: draft.inlineCount,
      },
      prompt_plan: imagePrompts,
    },
    source_body: draft.body || null,
    publish_body: draft.body || null,
  };

  const { data, error } = await client.rpc("create_article_with_workspace", {
    p_article: article,
    p_workspace: workspace,
  });
  if (error) {
    const message = String(error.message ?? "").toLowerCase();
    if (message.includes("article_quota_exceeded")) {
      throw new Error("記事ストック上限に達しています。");
    }
    if (message.includes("active profile required")) {
      throw new Error("activeアカウントが必要です。");
    }
    throw new Error("記事の新規保存に失敗しました。");
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("記事作成結果が不正です。");
  }
  const articleRow = (result as Record<string, unknown>).article;
  if (!articleRow || typeof articleRow !== "object" || Array.isArray(articleRow)) {
    throw new Error("記事作成結果が不正です。");
  }
  const row = articleRow as Record<string, unknown>;
  if (
    row.user_id !== ownerId ||
    typeof row.id !== "string" ||
    typeof row.title !== "string" ||
    typeof row.revision !== "number"
  ) {
    throw new Error("作成記事の所有者または応答形式を確認できません。");
  }
  return {
    id: row.id,
    title: row.title,
    revision: row.revision,
  };
}
