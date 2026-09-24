import type { SupabaseClient } from "@supabase/supabase-js";

export type KnowledgeRefreshStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";
export type KnowledgeRefreshChannel = "stable" | "fresh";
export type KnowledgeRefreshChangeAction = "added" | "updated" | "unchanged";

export type KnowledgeRefreshChangeItem = {
  itemType: "knowledge" | "prompt";
  key: string;
  label: string;
  action: KnowledgeRefreshChangeAction;
  changedFields: string[];
  sourceSummary: string;
};

export type KnowledgeRefreshChangeGroup = {
  added: number;
  updated: number;
  unchanged: number;
  items: KnowledgeRefreshChangeItem[];
};

export type KnowledgeRefreshDiff = {
  knowledge: KnowledgeRefreshChangeGroup;
  prompt: KnowledgeRefreshChangeGroup;
};

export type KnowledgeRefreshChannelState = {
  channel: KnowledgeRefreshChannel;
  refreshHours: number;
  currentVersion: number;
  lastPublishedAt: string | null;
  nextRefreshDueAt: string | null;
  lastRefreshRequestedAt: string | null;
};

export type KnowledgeRefreshRequest = {
  id: number;
  channel: KnowledgeRefreshChannel;
  requestedAt: string;
  startedAt: string | null;
  status: KnowledgeRefreshStatus;
  completedAt: string | null;
  researchSummary: string;
  publishedKnowledgeCount: number;
  publishedPromptCount: number;
  publishedVersion: number | null;
  errorMessage: string;
  changeDetails: KnowledgeRefreshDiff;
};

export type KnowledgeRefreshPublishResult = {
  channel: KnowledgeRefreshChannel;
  publishedVersion: number;
  knowledgeCount: number;
  promptCount: number;
  changeDetails: KnowledgeRefreshDiff;
};

export type KnowledgeRefreshBundle = {
  summary: string;
  knowledge_rules: unknown[];
  prompt_optimizations: unknown[];
};

function emptyChangeGroup(): KnowledgeRefreshChangeGroup {
  return { added: 0, updated: 0, unchanged: 0, items: [] };
}

export function emptyKnowledgeRefreshDiff(): KnowledgeRefreshDiff {
  return { knowledge: emptyChangeGroup(), prompt: emptyChangeGroup() };
}

function asNumber(value: unknown, fallback = 0): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function parseChangeItem(raw: unknown, fallbackType: "knowledge" | "prompt"): KnowledgeRefreshChangeItem | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const action = value.action;
  if (action !== "added" && action !== "updated" && action !== "unchanged") return null;
  return {
    itemType: value.item_type === "prompt" ? "prompt" : fallbackType,
    key: typeof value.key === "string" ? value.key : "",
    label: typeof value.label === "string" ? value.label : "",
    action,
    changedFields: Array.isArray(value.changed_fields)
      ? value.changed_fields.filter((item): item is string => typeof item === "string").slice(0, 20)
      : [],
    sourceSummary: typeof value.source_summary === "string" ? value.source_summary : "",
  };
}

function parseChangeGroup(raw: unknown, fallbackType: "knowledge" | "prompt"): KnowledgeRefreshChangeGroup {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyChangeGroup();
  const value = raw as Record<string, unknown>;
  return {
    added: Math.max(0, asNumber(value.added)),
    updated: Math.max(0, asNumber(value.updated)),
    unchanged: Math.max(0, asNumber(value.unchanged)),
    items: Array.isArray(value.items)
      ? value.items.map((item) => parseChangeItem(item, fallbackType)).filter((item): item is KnowledgeRefreshChangeItem => Boolean(item))
      : [],
  };
}

export function parseKnowledgeRefreshDiff(raw: unknown): KnowledgeRefreshDiff {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyKnowledgeRefreshDiff();
  const value = raw as Record<string, unknown>;
  return {
    knowledge: parseChangeGroup(value.knowledge, "knowledge"),
    prompt: parseChangeGroup(value.prompt, "prompt"),
  };
}

function parseRequest(raw: Record<string, unknown>): KnowledgeRefreshRequest {
  return {
    id: typeof raw.id === "number" ? raw.id : Number(raw.id ?? 0),
    channel: raw.channel === "fresh" ? "fresh" : "stable",
    requestedAt: typeof raw.requested_at === "string" ? raw.requested_at : "",
    startedAt: typeof raw.started_at === "string" ? raw.started_at : null,
    status: raw.status === "processing" || raw.status === "completed" || raw.status === "failed" || raw.status === "cancelled"
      ? raw.status
      : "pending",
    completedAt: typeof raw.completed_at === "string" ? raw.completed_at : null,
    researchSummary: typeof raw.research_summary === "string" ? raw.research_summary : "",
    publishedKnowledgeCount: asNumber(raw.published_knowledge_count),
    publishedPromptCount: asNumber(raw.published_prompt_count),
    publishedVersion: raw.published_version === null || raw.published_version === undefined
      ? null
      : asNumber(raw.published_version, 1),
    errorMessage: typeof raw.error_message === "string" ? raw.error_message : "",
    changeDetails: parseKnowledgeRefreshDiff(raw.change_details),
  };
}

export async function adminListKnowledgeRefreshRequests(
  client: SupabaseClient,
  status: KnowledgeRefreshStatus | null = null,
  limit = 50,
): Promise<KnowledgeRefreshRequest[]> {
  const args = {
    p_status: status,
    p_limit: Math.max(1, Math.min(200, Math.trunc(limit))),
  };
  const current = await client.rpc("admin_list_knowledge_refresh_requests_v2", args);
  const response = current.error
    ? await client.rpc("admin_list_knowledge_refresh_requests", args)
    : current;
  if (response.error) throw new Error("ナレッジ更新キューを取得できませんでした。");
  return (response.data ?? []).map((row: Record<string, unknown>) => parseRequest(row));
}

export async function adminGetKnowledgeRefreshChannels(
  client: SupabaseClient,
): Promise<KnowledgeRefreshChannelState[]> {
  const { data, error } = await client.rpc("admin_get_knowledge_refresh_channels");
  if (error) throw new Error("Fresh / Stable の状態を取得できませんでした。");
  return (data ?? []).map((raw: Record<string, unknown>) => ({
    channel: raw.channel === "fresh" ? "fresh" : "stable",
    refreshHours: Math.max(1, asNumber(raw.refresh_hours, 1)),
    currentVersion: Math.max(1, asNumber(raw.current_version, 1)),
    lastPublishedAt: typeof raw.last_published_at === "string" ? raw.last_published_at : null,
    nextRefreshDueAt: typeof raw.next_refresh_due_at === "string" ? raw.next_refresh_due_at : null,
    lastRefreshRequestedAt: typeof raw.last_refresh_requested_at === "string" ? raw.last_refresh_requested_at : null,
  }));
}

export async function adminRequestKnowledgeRefresh(
  client: SupabaseClient,
  channel: KnowledgeRefreshChannel,
): Promise<number> {
  const { data, error } = await client.rpc("admin_request_knowledge_refresh", { p_channel: channel });
  if (error) throw new Error("ナレッジ更新をキューへ追加できませんでした。");
  const value = typeof data === "number" ? data : Number(data);
  if (!Number.isFinite(value) || value < 1) throw new Error("ナレッジ更新IDを確認できませんでした。");
  return value;
}

export async function adminStartKnowledgeRefresh(client: SupabaseClient, requestId: number): Promise<void> {
  const { error } = await client.rpc("admin_start_knowledge_refresh", { p_request_id: requestId });
  if (error) throw new Error("ナレッジ更新を開始できませんでした。");
}

export async function adminFailKnowledgeRefresh(
  client: SupabaseClient,
  requestId: number,
  message: string,
): Promise<void> {
  const { error } = await client.rpc("admin_fail_knowledge_refresh", {
    p_request_id: requestId,
    p_error_message: message.slice(0, 1000),
  });
  if (error) throw new Error("ナレッジ更新の失敗状態を保存できませんでした。");
}

export async function adminPreviewKnowledgeRefreshBundleDiff(
  client: SupabaseClient,
  bundle: KnowledgeRefreshBundle,
): Promise<KnowledgeRefreshDiff> {
  const { data, error } = await client.rpc("admin_preview_knowledge_refresh_bundle_diff", { p_bundle: bundle });
  if (error) throw new Error(error.message || "変更点を比較できませんでした。");
  return parseKnowledgeRefreshDiff(data);
}

export async function adminPublishKnowledgeRefreshBundle(
  client: SupabaseClient,
  requestId: number,
  bundle: KnowledgeRefreshBundle,
): Promise<KnowledgeRefreshPublishResult> {
  const { data, error } = await client.rpc("admin_publish_knowledge_refresh_bundle_v2", {
    p_request_id: requestId,
    p_bundle: bundle,
  });
  if (error) throw new Error(error.message || "ナレッジ更新Bundleを公開できませんでした。");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error("ナレッジ更新結果を確認できませんでした。");
  }
  const value = row as Record<string, unknown>;
  return {
    channel: value.channel === "fresh" ? "fresh" : "stable",
    publishedVersion: asNumber(value.published_version, 1),
    knowledgeCount: asNumber(value.knowledge_count),
    promptCount: asNumber(value.prompt_count),
    changeDetails: parseKnowledgeRefreshDiff(value.change_details),
  };
}

export function parseKnowledgeRefreshBundle(text: string): KnowledgeRefreshBundle {
  const raw: unknown = JSON.parse(text);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("JSONの最上位はオブジェクトにしてください。");
  }
  const value = raw as Record<string, unknown>;
  const knowledge = Array.isArray(value.knowledge_rules) ? value.knowledge_rules : null;
  const prompts = Array.isArray(value.prompt_optimizations) ? value.prompt_optimizations : null;
  if (!knowledge || !prompts) {
    throw new Error("knowledge_rules と prompt_optimizations の配列が必要です。");
  }
  if (knowledge.length === 0 && prompts.length === 0) {
    throw new Error("更新候補が1件もありません。");
  }
  return {
    summary: typeof value.summary === "string" ? value.summary.slice(0, 2000) : "",
    knowledge_rules: knowledge,
    prompt_optimizations: prompts,
  };
}

export function buildKnowledgeRefreshResearchPrompt(channel: "stable" | "fresh"): string {
  const rollout = channel === "fresh"
    ? "Fresh向け。確認済みの重要変更を早期反映する候補を作る。断定できない変更は含めない。"
    : "Stable向け。十分に定着し、公式情報で確認できる変更だけを候補にする。";

  return `あなたはAI Action Studio（AAS）のKnowledge / Prompt Update編集者です。
目的は、AASの記事制作・画像計画・SNS制作に加え、各副業専用機能の判断・制作・販売・案件獲得・調査・業務効率化に影響する最新変更をWebで調査し、管理者レビュー用JSONだけを返すことです。

【更新チャネル】
${rollout}

【調査対象】
- note / Tips / Brain の記事制作・販売・公開仕様
- X、Instagram、Threads、TikTok、YouTube等のSNS・動画制作・公開に関係する公式仕様
- アフィリエイトで購入判断・広告表示・商品比較に影響する公式仕様や公的ルール
- メルカリ、ラクマ、Yahoo!系マーケット、Amazon等の物販で出品・手数料・禁止商品・配送に影響する公式仕様
- クラウドワークス、ランサーズ、ココナラ等の案件応募・契約・納品に影響する公式仕様
- デジタル商品・スキル販売で販売条件、購入者対応、納品に影響する公式仕様
- 営業・案件獲得で迷惑行為や虚偽表示を避けるために必要な公的・公式情報
- リサーチ、ファクトチェック、業務効率化で情報源の信頼性・更新日・AI利用上の注意に影響する変更
- ChatGPT / OpenAI、Claude / Anthropic、Gemini / Google の利用上重要な変更
- 一時的な流行・感想・裏技・SEO都市伝説は採用しない。

【情報源ルール】
- まず公式ヘルプ、公式ドキュメント、公式発表を使う。
- 重要な変更は可能な限り2つ以上の独立した根拠で確認する。公式一次情報が1つしかない場合は、その事実をsummaryに明記する。
- 公開日・更新日・対象地域・対象プランを確認する。
- 検索結果スニペットだけで断定しない。
- 古い仕様と現在仕様を混ぜない。
- 未確認情報、推測、SNS上の噂はKnowledgeへ入れない。

【AAS安全ルール】
- ユーザーの実体験・実績・レビューを創作する指示を追加しない。
- 価格、統計、ランキング、アルゴリズム、販売数など変動情報を普遍ルールとして固定しない。
- 「必ず伸びる」「必ず売れる」等の成果保証を追加しない。
- 特定の作家・作品・競合記事の模倣を促さない。
- 既存AASルールと意味が重複するだけの候補は出さない。
- 変更が無い領域は無理に候補を作らない。

【JSON出力】
説明文やMarkdownコードフェンスを付けず、次の形のJSONオブジェクトだけを返す。

{
  "summary": "今回確認した変更の要約。変更なしの領域も簡潔に記載",
  "knowledge_rules": [
    {
      "key": "auto:一貫して再利用できる英数字キー",
      "kind": "age|genre|subgenre|publication|task|combination",
      "label": "表示名",
      "parent_label": "",
      "aliases": [],
      "guidance": ["制作ルール"],
      "deliverables": ["有効な成果物"],
      "cautions": ["注意・禁止"],
      "tasks": ["sidejob_affiliate"],
      "priority": 70,
      "source_urls": ["https://..."],
      "source_summary": "根拠と変更点を短く要約"
    }
  ],
  "prompt_optimizations": [
    {
      "key": "auto:一貫して再利用できる英数字キー",
      "provider": "all|chatgpt|claude|gemini",
      "plan": "all|free|paid",
      "task": "all|title|article|image|social|promotion|sidejob_content|sidejob_sns|sidejob_video|sidejob_affiliate|sidejob_resale|sidejob_crowdsourcing|sidejob_skill_sales|sidejob_digital_product|sidejob_outreach|sidejob_research|sidejob_efficiency|sidejob_planning",
      "rules": ["現在のモデル/サービスで有効な、短く具体的なプロンプト最適化ルール"],
      "priority": 70,
      "source_urls": ["https://..."],
      "source_summary": "公式情報との対応関係を短く要約"
    }
  ]
}

【tasks / task の指定ルール】
- 上のJSON例は形式例。tasksには今回の変更が実際に影響するタスクだけを1〜数個入れる。
- prompt_optimizations.taskも、影響する1タスクまたは本当に全タスク共通の場合だけallを使う。

【副業タスク割り当て】
- 記事・コンテンツ販売 → sidejob_content
- SNS運用・集客 → sidejob_sns
- YouTube・ショート動画 → sidejob_video
- アフィリエイト → sidejob_affiliate
- 物販・フリマ販売 → sidejob_resale
- クラウドソーシング → sidejob_crowdsourcing
- スキル販売 → sidejob_skill_sales
- デジタル商品・教材販売 → sidejob_digital_product
- 営業・案件獲得 → sidejob_outreach
- リサーチ・事実確認 → sidejob_research
- 業務効率化・SOP化 → sidejob_efficiency
- AI副業選定 → sidejob_planning
- 1つの変更を無関係な全タスクへ広げない。影響するタスクだけ指定する。

【最終監査】
- source_urlsが空の候補は出さない。
- keyは必ず auto: で始める。
- 最新性を理由に安全・事実性を弱めない。
- 一時的なUI文言やキャンペーンだけの変更は原則Knowledge化しない。
- 既存仕様を確認できない場合は候補にせずsummaryへ「要確認」と書く。`;
}

