import type { SupabaseClient } from "@supabase/supabase-js";
import { buildWorkspacePresetPromptContext } from "@/features/presets/workspace-presets";

import type { ArticleDetail, ArticleSummary } from "@/lib/phase7-articles";
import type { NoteScheduleItem } from "@/lib/note-operations";
import { buildPlatformAccountPromptContext } from "@/lib/platform-account-design";

export type PrePublishSeverity = "pass" | "review" | "blocker";

export type PrePublishCheck = {
  id: string;
  label: string;
  detail: string;
  severity: PrePublishSeverity;
};

export type PrePublishReport = {
  checks: PrePublishCheck[];
  blockers: number;
  reviews: number;
  passes: number;
  readyForManualPublish: boolean;
};

export type ReusePlatform = "x" | "instagram" | "threads" | "tiktok" | "youtube";

export type ReuseChannelPlan = {
  platform: ReusePlatform;
  targetChars: number;
  delayDays: number;
};

export type SeriesPlatform = "note" | "tips" | "brain" | "blog";
export type SeriesStatus = "planning" | "active" | "completed" | "archived";
export type SeriesItemStatus = "planned" | "drafting" | "ready" | "published";
export type SeriesItemRole = "intro" | "standard" | "deep_dive" | "conversion" | "summary" | "bonus";

export type ContentSeriesItem = {
  order: number;
  title: string;
  theme: string;
  articleType: "free" | "paid";
  role: SeriesItemRole;
  status: SeriesItemStatus;
  articleId: string | null;
};

export type ContentSeriesPlan = {
  id: string;
  userId: string;
  name: string;
  platform: SeriesPlatform;
  audience: string;
  purpose: string;
  monetization: string;
  status: SeriesStatus;
  items: ContentSeriesItem[];
  createdAt: string;
  updatedAt: string;
};

export type ContentSeriesDraft = Omit<ContentSeriesPlan, "id" | "createdAt" | "updatedAt">;

export type WorkflowTask = {
  id: string;
  kind: "schedule" | "draft" | "preflight" | "reuse" | "series";
  title: string;
  detail: string;
  href: string;
  priority: "high" | "normal" | "low";
};

const SERIES_SELECT = "id,user_id,name,platform,audience,purpose,monetization,status,items,created_at,updated_at";

const PLATFORM_LABELS: Record<ReusePlatform, string> = {
  x: "X",
  instagram: "Instagram",
  threads: "Threads",
  tiktok: "TikTok",
  youtube: "YouTube Shorts",
};

function cleanBody(article: ArticleDetail): string {
  return (article.workspace.publishBody || article.body || "").trim();
}

function countMarkdownHeadings(body: string): number {
  return body.split("\n").filter((line) => /^#{1,6}\s+\S/.test(line.trim())).length;
}

function hasPlaceholder(body: string): boolean {
  return /(?:TODO|TBD|FIXME|要確認|仮置き|ここに入力|\[\s*未入力\s*\])/i.test(body);
}

function hasFactSensitiveText(body: string): boolean {
  return /(?:\d+(?:\.\d+)?\s*%|\d[\d,]*\s*円|\d[\d,]*\s*人|売上|PV|ランキング|第\d+位|調査では|統計では)/i.test(body);
}

function markdownLinks(body: string): number {
  return (body.match(/\[[^\]]+\]\(https?:\/\/[^)]+\)/g) ?? []).length;
}

function imageMarkers(body: string): number {
  return (body.match(/<!--\s*IMAGE:\d+\s*-->/gi) ?? []).length;
}

function pushCheck(checks: PrePublishCheck[], check: PrePublishCheck): void {
  checks.push(check);
}

export function runPrePublishChecks(article: ArticleDetail): PrePublishReport {
  const checks: PrePublishCheck[] = [];
  const body = cleanBody(article);
  const title = article.title.trim();

  pushCheck(checks, {
    id: "title",
    label: "タイトル",
    severity: !title ? "blocker" : title.length > 100 ? "review" : "pass",
    detail: !title
      ? "タイトルがありません。公開前にタイトルを設定してください。"
      : title.length > 100
        ? `タイトルは${title.length}文字です。掲載先で見切れないか確認してください。`
        : `タイトルを確認しました（${title.length}文字）。`,
  });

  pushCheck(checks, {
    id: "body",
    label: "本文",
    severity: !body ? "blocker" : body.length < 300 ? "review" : "pass",
    detail: !body
      ? "本文が空です。"
      : body.length < 300
        ? `本文は${body.length}文字です。意図した短文か確認してください。`
        : `本文を確認しました（約${body.length}文字）。`,
  });

  const headings = countMarkdownHeadings(body);
  pushCheck(checks, {
    id: "headings",
    label: "見出し構造",
    severity: body.length >= 1500 && headings === 0 ? "review" : "pass",
    detail: body.length >= 1500 && headings === 0
      ? "長文ですがMarkdown見出しが見つかりません。読みやすさを確認してください。"
      : `Markdown見出し: ${headings}件。`,
  });

  const placeholder = hasPlaceholder(body);
  pushCheck(checks, {
    id: "placeholder",
    label: "未処理メモ",
    severity: placeholder ? "blocker" : "pass",
    detail: placeholder
      ? "TODO・要確認などの未処理メモが残っています。公開前に解消してください。"
      : "代表的な未処理メモは検出されませんでした。",
  });

  const paidMissingPrice = article.articleType === "paid" && (!article.price || article.price <= 0);
  pushCheck(checks, {
    id: "price",
    label: "有料記事の価格",
    severity: paidMissingPrice ? "blocker" : "pass",
    detail: article.articleType === "paid"
      ? paidMissingPrice ? "有料記事ですが価格を確認できません。" : `設定価格: ${article.price}円。`
      : "無料記事です。",
  });

  const publishedUrlMissing = article.status === "published" && !article.publishedUrl;
  pushCheck(checks, {
    id: "publish_url",
    label: "公開URL",
    severity: publishedUrlMissing ? "blocker" : article.status === "published" ? "pass" : "review",
    detail: publishedUrlMissing
      ? "公開済みですが公開URLがありません。"
      : article.status === "published"
        ? "公開URLを確認しました。"
        : "未公開の記事です。公開時にURLを記録してください。",
  });

  const waitingWithoutDate = article.status === "waiting_publish" && !article.scheduledAt;
  pushCheck(checks, {
    id: "schedule",
    label: "公開予定",
    severity: waitingWithoutDate ? "review" : "pass",
    detail: waitingWithoutDate
      ? "公開待ちですが公開予定日時がありません。必要なら公開管理で設定してください。"
      : article.scheduledAt
        ? `公開予定: ${article.scheduledAt}`
        : "公開予定日時は必須ではありません。",
  });

  const accountDesignApplied = article.publicationTarget === "blog"
    || article.workspace.workspaceJson.account_design_applied === true
    || article.workspace.requestJson.account_design_applied === true;
  pushCheck(checks, {
    id: "account_design",
    label: "アカウント設計連携",
    severity: accountDesignApplied ? "pass" : "review",
    detail: accountDesignApplied
      ? "記事作成時に保存済みアカウント設計が反映されています。"
      : "アカウント設計の反映記録がありません。読者・トーン・収益化方針との整合を確認してください。",
  });

  const markers = imageMarkers(body);
  const imagePlan = article.workspace.imagePlanJson;
  const inline = imagePlan.inline && typeof imagePlan.inline === "object" && !Array.isArray(imagePlan.inline)
    ? imagePlan.inline as Record<string, unknown>
    : null;
  const inlineEnabled = inline?.enabled === true;
  pushCheck(checks, {
    id: "images",
    label: "画像・挿絵",
    severity: inlineEnabled && markers > 0 ? "review" : "pass",
    detail: inlineEnabled && markers > 0
      ? `本文に画像差し込みマーカーが${markers}件あります。実画像へ置き換わっているか確認してください。`
      : inlineEnabled
        ? "挿絵計画あり。本文に未処理の画像マーカーは検出されませんでした。"
        : "挿絵なし、または画像マーカーなしです。",
  });

  const links = markdownLinks(body);
  pushCheck(checks, {
    id: "links",
    label: "外部リンク",
    severity: links > 0 ? "review" : "pass",
    detail: links > 0
      ? `本文に外部リンクが${links}件あります。リンク切れ・誘導先・アフィリエイト表記を人が確認してください。`
      : "Markdown形式の外部リンクは検出されませんでした。",
  });

  const sensitive = hasFactSensitiveText(body);
  pushCheck(checks, {
    id: "facts",
    label: "数値・実績・変動情報",
    severity: sensitive ? "review" : "pass",
    detail: sensitive
      ? "数値・価格・ランキング・実績に見える表現があります。公開時点の根拠と最新性を確認してください。"
      : "代表的な数値・実績表現の自動検出では大きな確認候補はありません。",
  });

  const blockers = checks.filter((check) => check.severity === "blocker").length;
  const reviews = checks.filter((check) => check.severity === "review").length;
  const passes = checks.filter((check) => check.severity === "pass").length;
  return {
    checks,
    blockers,
    reviews,
    passes,
    readyForManualPublish: blockers === 0,
  };
}

export function buildPrePublishReviewPrompt(article: ArticleDetail, report: PrePublishReport): string {
  const body = cleanBody(article);
  const workspacePresetContext = buildWorkspacePresetPromptContext("workflow");
  const accountPresetContext = buildPlatformAccountPromptContext(article.publicationTarget);
  const checks = report.checks
    .filter((check) => check.severity !== "pass")
    .map((check) => `- [${check.severity}] ${check.label}: ${check.detail}`)
    .join("\n") || "- 自動チェック上の未解決項目なし";
  return `あなたは日本語記事の公開前編集者です。
以下の記事を「公開直前の最終確認」としてレビューしてください。

【絶対ルール】
- 記事にない実体験・実績・レビューを新しく作らない。
- 数値、価格、制度、仕様、ランキング、統計、現在のサービス仕様など変動する情報は、Web検索が利用できる場合は最新の一次情報・公式情報を確認する。
- 根拠を確認できない主張は事実として補完せず「要確認」とする。
- 本文を書き換えて完成させるのではなく、修正候補と理由を示す。
- 個人情報、認証情報、秘密情報が含まれていないかも確認する。

${workspacePresetContext ? `${workspacePresetContext}

` : ""}${accountPresetContext ? `${accountPresetContext}

` : ""}【記事情報】
タイトル: ${article.title}
掲載先: ${article.publicationTarget}
無料/有料: ${article.articleType}
価格: ${article.price ?? "なし"}
状態: ${article.status}

【AAS自動チェックで残った項目】
${checks}

【本文】
${body.slice(0, 22000)}

【出力】
1. 公開を止めるべき問題
2. 人が確認すべき事実・数値・リンク
3. 読みやすさ・構成の改善候補
4. CTA・有料記事導線の確認
5. 修正不要な点
6. 最後に「公開前に人が確認するチェックリスト」を短くまとめる
「公開OK」と断定せず、最終判断はユーザーが行う前提で出力してください。`;
}

export function buildArticleReusePrompt(article: ArticleDetail, channels: ReuseChannelPlan[]): string {
  const body = cleanBody(article);
  const workspacePresetContext = buildWorkspacePresetPromptContext("workflow");
  const accountPresetContext = buildPlatformAccountPromptContext(article.publicationTarget);
  const selected = channels
    .filter((item) => item.targetChars > 0)
    .slice(0, 8)
    .map((item) => `- ${PLATFORM_LABELS[item.platform]}: 約${Math.max(1, Math.min(25000, Math.round(item.targetChars)))}文字 / 記事公開から${Math.max(0, Math.min(30, Math.round(item.delayDays)))}日後`)
    .join("\n");
  return `あなたは日本語のコンテンツ再利用編集者です。
1本の記事をSNSへ単純コピペせず、媒体ごとに内容を再構成し、公開後の再告知計画まで作ってください。

【絶対ルール】
- 元記事にない実体験・実績・レビュー・成果を追加しない。
- 未確認の価格・統計・ランキング・最新仕様を断定しない。
- 各SNSへ同じ文章を貼り回さず、媒体の使われ方に合わせてフック・構成・CTAを変える。
- 元記事の価値を先に少し提供し、過度な煽りや成果保証を使わない。
- 公開URLが未設定なら、存在しないURLや「リンクから購入」等を作らない。

${workspacePresetContext ? `${workspacePresetContext}

` : ""}${accountPresetContext ? `${accountPresetContext}

` : ""}【元記事】
タイトル: ${article.title}
掲載先: ${article.publicationTarget}
記事タイプ: ${article.articleType}
公開URL: ${article.publishedUrl || "未公開"}
ジャンル: ${article.genre || "未指定"}

【展開先と目安】
${selected || "- 展開先未指定"}

【本文】
${body.slice(0, 20000)}

【出力】
- 媒体ごとに投稿本文を2案
- 各案の概算文字数
- 各媒体で使うフック
- 記事公開日をDay 0とした再告知スケジュール
- 初回告知と再告知で切り口を変える案
- 画像・カルーセル・Shorts化が有効なら素材案
- URL未公開の場合は「公開後にURLを追記」と明示する`;
}

function seriesRole(value: unknown): SeriesItemRole {
  return value === "intro" || value === "deep_dive" || value === "conversion" || value === "summary" || value === "bonus"
    ? value
    : "standard";
}

function seriesItemStatus(value: unknown): SeriesItemStatus {
  return value === "drafting" || value === "ready" || value === "published" ? value : "planned";
}

function parseSeriesItem(value: unknown, fallbackOrder: number): ContentSeriesItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const title = typeof row.title === "string" ? row.title.trim().slice(0, 300) : "";
  if (!title) return null;
  const order = Number.isSafeInteger(Number(row.order)) && Number(row.order) > 0
    ? Math.min(100, Number(row.order))
    : fallbackOrder;
  return {
    order,
    title,
    theme: typeof row.theme === "string" ? row.theme.trim().slice(0, 1000) : "",
    articleType: row.article_type === "paid" || row.articleType === "paid" ? "paid" : "free",
    role: seriesRole(row.role),
    status: seriesItemStatus(row.status),
    articleId: typeof row.article_id === "string"
      ? row.article_id
      : typeof row.articleId === "string"
        ? row.articleId
        : null,
  };
}

function parseSeriesRow(value: Record<string, unknown>, ownerId: string): ContentSeriesPlan {
  const items = Array.isArray(value.items)
    ? value.items.map((item, index) => parseSeriesItem(item, index + 1)).filter((item): item is ContentSeriesItem => Boolean(item))
    : [];
  const platform = value.platform;
  const status = value.status;
  if (
    typeof value.id !== "string"
    || value.user_id !== ownerId
    || typeof value.name !== "string"
    || !["note", "tips", "brain", "blog"].includes(String(platform))
  ) {
    throw new Error("シリーズ計画の応答形式を確認できませんでした。");
  }
  return {
    id: value.id,
    userId: ownerId,
    name: value.name,
    platform: platform as SeriesPlatform,
    audience: typeof value.audience === "string" ? value.audience : "",
    purpose: typeof value.purpose === "string" ? value.purpose : "",
    monetization: typeof value.monetization === "string" ? value.monetization : "",
    status: status === "active" || status === "completed" || status === "archived" ? status : "planning",
    items,
    createdAt: typeof value.created_at === "string" ? value.created_at : "",
    updatedAt: typeof value.updated_at === "string" ? value.updated_at : "",
  };
}

export async function listContentSeriesPlans(client: SupabaseClient, ownerId: string): Promise<ContentSeriesPlan[]> {
  const { data, error } = await client
    .from("content_series_plans")
    .select(SERIES_SELECT)
    .eq("user_id", ownerId)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("シリーズ計画を読み込めませんでした。");
  return (data ?? []).map((row) => parseSeriesRow(row as unknown as Record<string, unknown>, ownerId));
}

export async function saveContentSeriesPlan(
  client: SupabaseClient,
  draft: ContentSeriesDraft,
  id?: string,
): Promise<ContentSeriesPlan> {
  const name = draft.name.trim();
  if (!name) throw new Error("シリーズ名を入力してください。");
  const items = draft.items
    .slice(0, 50)
    .map((item, index) => ({
      order: index + 1,
      title: item.title.trim().slice(0, 300),
      theme: item.theme.trim().slice(0, 1000),
      article_type: item.articleType,
      role: item.role,
      status: item.status,
      article_id: item.articleId,
    }))
    .filter((item) => item.title);
  if (items.length < 2) throw new Error("シリーズは2記事以上で保存してください。");

  const payload = {
    user_id: draft.userId,
    name: name.slice(0, 200),
    platform: draft.platform,
    audience: draft.audience.trim().slice(0, 600),
    purpose: draft.purpose.trim().slice(0, 1200),
    monetization: draft.monetization.trim().slice(0, 600),
    status: draft.status,
    items,
  };

  const query = id
    ? client.from("content_series_plans").update(payload).eq("id", id).eq("user_id", draft.userId)
    : client.from("content_series_plans").insert(payload);
  const { data, error } = await query.select(SERIES_SELECT).single();
  if (error || !data) throw new Error("シリーズ計画を保存できませんでした。");
  return parseSeriesRow(data as unknown as Record<string, unknown>, draft.userId);
}

export async function deleteContentSeriesPlan(client: SupabaseClient, ownerId: string, id: string): Promise<void> {
  const { error } = await client
    .from("content_series_plans")
    .delete()
    .eq("id", id)
    .eq("user_id", ownerId);
  if (error) throw new Error("シリーズ計画を削除できませんでした。");
}

export function buildSeriesPlanPrompt(input: {
  platform: SeriesPlatform;
  name: string;
  audience: string;
  purpose: string;
  monetization: string;
  articleCount: number;
}): string {
  const count = Math.max(2, Math.min(30, Math.round(input.articleCount)));
  const accountContext = buildPlatformAccountPromptContext(input.platform);
  const workspacePresetContext = buildWorkspacePresetPromptContext("workflow");
  return `あなたは日本語コンテンツのシリーズ編集者です。
${input.platform}で継続して読まれる記事シリーズを設計してください。

【絶対ルール】
- ユーザーが入力していない実体験・実績・レビュー・資格を作らない。
- 無料記事と有料記事の役割を分け、有料化を煽りすぎない。
- 各記事が同じ内容の言い換えにならないよう、シリーズ全体で学習・理解が進む順番にする。
- 未確認の価格・統計・最新仕様を前提にしない。

${workspacePresetContext ? `${workspacePresetContext}

` : ""}【シリーズ条件】
掲載先: ${input.platform}
シリーズ名: ${input.name || "AIに提案してもらう"}
想定読者: ${input.audience || "未指定"}
目的: ${input.purpose || "継続発信と読者価値の最大化"}
収益化方針: ${input.monetization || "無料記事を軸に必要な場合だけ有料記事を組み合わせる"}
記事数: ${count}
${accountContext}

次のJSONだけを返してください。Markdownコードフェンスは付けても構いません。
{
  "schema": "aas-content-series-v1",
  "series_name": "シリーズ名",
  "items": [
    {
      "order": 1,
      "title": "記事タイトル",
      "theme": "この記事で扱う内容",
      "article_type": "free",
      "role": "intro"
    }
  ]
}

roleは intro / standard / deep_dive / conversion / summary / bonus のいずれか。
article_typeは free / paid のいずれか。
itemsは必ず${count}件にしてください。`;
}

function jsonCandidates(input: string): string[] {
  const values = [input.trim()];
  for (const match of input.matchAll(/\`\`\`(?:json)?\s*([\s\S]*?)\`\`\`/gi)) {
    if (match[1]) values.push(match[1].trim());
  }
  const first = input.indexOf("{");
  const last = input.lastIndexOf("}");
  if (first >= 0 && last > first) values.push(input.slice(first, last + 1));
  return [...new Set(values.filter(Boolean))];
}

export function extractSeriesPlanFromAi(
  input: string,
  fallback: {
    userId: string;
    platform: SeriesPlatform;
    name: string;
    audience: string;
    purpose: string;
    monetization: string;
  },
): ContentSeriesDraft {
  let parsed: Record<string, unknown> | null = null;
  for (const candidate of jsonCandidates(input)) {
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        parsed = value as Record<string, unknown>;
        break;
      }
    } catch {
      // Try the next JSON candidate.
    }
  }
  if (!parsed || parsed.schema !== "aas-content-series-v1" || !Array.isArray(parsed.items)) {
    throw new Error("AI回答からシリーズJSONを読み取れませんでした。回答全文をそのまま貼り付けてください。");
  }
  const items = parsed.items
    .map((item, index) => parseSeriesItem(item, index + 1))
    .filter((item): item is ContentSeriesItem => Boolean(item))
    .slice(0, 50);
  if (items.length < 2) throw new Error("シリーズ記事が2件以上必要です。");
  return {
    userId: fallback.userId,
    platform: fallback.platform,
    name: typeof parsed.series_name === "string" && parsed.series_name.trim()
      ? parsed.series_name.trim().slice(0, 200)
      : fallback.name.trim().slice(0, 200) || "記事シリーズ",
    audience: fallback.audience,
    purpose: fallback.purpose,
    monetization: fallback.monetization,
    status: "planning",
    items,
  };
}

export function seriesArticleCreateHref(plan: ContentSeriesPlan, item: ContentSeriesItem): string {
  const params = new URLSearchParams({
    publicationTarget: plan.platform,
    articleType: item.articleType,
    title: item.title,
    theme: item.theme,
    from: "series-plan",
  });
  return `/create?${params.toString()}`;
}

export function buildWorkflowTasks(
  articles: ArticleSummary[],
  schedule: NoteScheduleItem[],
  series: ContentSeriesPlan[],
  todayKey: string,
): WorkflowTask[] {
  const tasks: WorkflowTask[] = [];

  for (const item of schedule.filter((entry) => entry.scheduledDate === todayKey && entry.status === "planned").slice(0, 5)) {
    tasks.push({
      id: `schedule:${item.id ?? item.title}`,
      kind: "schedule",
      title: item.title || "note運営予定",
      detail: `${item.scheduledTime} / ${item.itemType === "paid_note" ? "有料note" : item.itemType === "free_note" ? "無料note" : "運営タスク"}`,
      href: "/note-operations",
      priority: "high",
    });
  }

  for (const article of articles.filter((entry) => entry.status === "draft" || entry.status === "writing").slice(0, 3)) {
    tasks.push({
      id: `draft:${article.id}`,
      kind: "draft",
      title: article.title || "下書き記事を続ける",
      detail: `${article.publicationTarget} / ${article.status === "writing" ? "執筆中" : "下書き"}`,
      href: "/?section=library",
      priority: "normal",
    });
  }

  for (const article of articles.filter((entry) => entry.status === "ready" || entry.status === "waiting_publish").slice(0, 3)) {
    tasks.push({
      id: `preflight:${article.id}`,
      kind: "preflight",
      title: `公開前チェック: ${article.title || "無題の記事"}`,
      detail: article.status === "waiting_publish" ? "公開待ちの記事を最終確認" : "完成記事を公開前確認",
      href: `/workflow?tab=preflight&article=${encodeURIComponent(article.id)}`,
      priority: "high",
    });
  }

  for (const article of articles.filter((entry) => entry.status === "published").slice(0, 2)) {
    tasks.push({
      id: `reuse:${article.id}`,
      kind: "reuse",
      title: `SNS再利用: ${article.title || "公開記事"}`,
      detail: "公開済み記事を媒体別の告知へ再構成",
      href: `/workflow?tab=reuse&article=${encodeURIComponent(article.id)}`,
      priority: "low",
    });
  }

  for (const plan of series.filter((entry) => entry.status === "planning" || entry.status === "active").slice(0, 2)) {
    const nextItem = plan.items.find((item) => item.status !== "published");
    if (!nextItem) continue;
    tasks.push({
      id: `series:${plan.id}:${nextItem.order}`,
      kind: "series",
      title: `${plan.name} #${nextItem.order}: ${nextItem.title}`,
      detail: "シリーズの次の記事を作成",
      href: seriesArticleCreateHref(plan, nextItem),
      priority: "normal",
    });
  }

  const order = { high: 0, normal: 1, low: 2 } as const;
  return tasks.sort((a, b) => order[a.priority] - order[b.priority]).slice(0, 12);
}
