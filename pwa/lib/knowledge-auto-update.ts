import type { SupabaseClient } from "@supabase/supabase-js";

export type KnowledgeRefreshStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";

export type KnowledgeRefreshRequest = {
  id: number;
  channel: "stable" | "fresh";
  requestedAt: string;
  startedAt: string | null;
  status: KnowledgeRefreshStatus;
  completedAt: string | null;
  researchSummary: string;
  publishedKnowledgeCount: number;
  publishedPromptCount: number;
  publishedVersion: number | null;
  errorMessage: string;
};

export type KnowledgeRefreshPublishResult = {
  channel: "stable" | "fresh";
  publishedVersion: number;
  knowledgeCount: number;
  promptCount: number;
};

export type KnowledgeRefreshBundle = {
  summary: string;
  knowledge_rules: unknown[];
  prompt_optimizations: unknown[];
};

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
    publishedKnowledgeCount: typeof raw.published_knowledge_count === "number" ? raw.published_knowledge_count : Number(raw.published_knowledge_count ?? 0),
    publishedPromptCount: typeof raw.published_prompt_count === "number" ? raw.published_prompt_count : Number(raw.published_prompt_count ?? 0),
    publishedVersion: raw.published_version === null || raw.published_version === undefined
      ? null
      : typeof raw.published_version === "number"
        ? raw.published_version
        : Number(raw.published_version),
    errorMessage: typeof raw.error_message === "string" ? raw.error_message : "",
  };
}

export async function adminListKnowledgeRefreshRequests(
  client: SupabaseClient,
  status: KnowledgeRefreshStatus | null = null,
  limit = 50,
): Promise<KnowledgeRefreshRequest[]> {
  const { data, error } = await client.rpc("admin_list_knowledge_refresh_requests", {
    p_status: status,
    p_limit: Math.max(1, Math.min(200, Math.trunc(limit))),
  });
  if (error) throw new Error("ナレッジ更新キューを取得できませんでした。");
  return (data ?? []).map((row: Record<string, unknown>) => parseRequest(row));
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

export async function adminPublishKnowledgeRefreshBundle(
  client: SupabaseClient,
  requestId: number,
  bundle: KnowledgeRefreshBundle,
): Promise<KnowledgeRefreshPublishResult> {
  const { data, error } = await client.rpc("admin_publish_knowledge_refresh_bundle", {
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
    publishedVersion: typeof value.published_version === "number" ? value.published_version : Number(value.published_version ?? 1),
    knowledgeCount: typeof value.knowledge_count === "number" ? value.knowledge_count : Number(value.knowledge_count ?? 0),
    promptCount: typeof value.prompt_count === "number" ? value.prompt_count : Number(value.prompt_count ?? 0),
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

  return `あなたはAI Article Studio（AAS）のKnowledge / Prompt Update編集者です。
目的は、AASの記事制作・画像計画・SNS制作に影響する最新変更をWebで調査し、管理者レビュー用JSONだけを返すことです。

【更新チャネル】
${rollout}

【調査対象】
- note / Tips / Brain の記事制作・販売・公開仕様
- ChatGPT / OpenAI、Claude / Anthropic、Gemini / Google の利用上重要な変更
- X、Instagram、Threads、TikTok、YouTube等の投稿制作に関係する公式仕様
- 記事制作で変動しやすい仕様だけ。流行の感想やSEO都市伝説は採用しない。

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
      "tasks": ["title","article","image","social","promotion"],
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
      "task": "all|title|article|image|social|promotion",
      "rules": ["現在のモデル/サービスで有効な、短く具体的なプロンプト最適化ルール"],
      "priority": 70,
      "source_urls": ["https://..."],
      "source_summary": "公式情報との対応関係を短く要約"
    }
  ]
}

【最終監査】
- source_urlsが空の候補は出さない。
- keyは必ず auto: で始める。
- 最新性を理由に安全・事実性を弱めない。
- 一時的なUI文言やキャンペーンだけの変更は原則Knowledge化しない。
- 既存仕様を確認できない場合は候補にせずsummaryへ「要確認」と書く。`;
}
