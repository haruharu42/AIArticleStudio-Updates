import type { SupabaseClient } from "@supabase/supabase-js";

import {
  requireArticleAccess,
  type ArticleDetail,
  type ArticleStatus,
} from "@/lib/phase7-articles";

export type PublicationUpdate = {
  status: "ready" | "waiting_publish" | "published";
  scheduledAt: string | null;
  publishedAt: string | null;
  publishedUrl: string | null;
};

function normalizedUrl(value: string | null): string | null {
  const raw = value?.trim() || "";
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("公開URLの形式が正しくありません。");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("公開URLはhttp/https URLを指定してください。");
  }
  return parsed.toString();
}

function timestamp(value: string | null, label: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label}の日時形式が正しくありません。`);
  return parsed.toISOString();
}

export async function savePublicationState(
  client: SupabaseClient,
  ownerId: string,
  detail: ArticleDetail,
  input: PublicationUpdate,
): Promise<{ revision: number; status: ArticleStatus }> {
  await requireArticleAccess(client, ownerId);
  if (detail.userId !== ownerId) throw new Error("記事所有者が一致しません。");

  const url = normalizedUrl(input.publishedUrl);
  const scheduled = timestamp(input.scheduledAt, "公開予定");
  let published = timestamp(input.publishedAt, "公開日時");
  if (input.status === "published") {
    if (!url) throw new Error("公開済みにする場合は公開URLを入力してください。");
    if (!published) published = new Date().toISOString();
  }

  const articlePatch: Record<string, unknown> = {
    status: input.status,
    scheduled_at: input.status === "waiting_publish" ? scheduled : null,
    published_at: input.status === "published" ? published : null,
    published_url: input.status === "published" ? url : null,
  };
  const workspacePatch = {
    workspace_json: {
      ...detail.workspace.workspaceJson,
      local_status: input.status === "ready" ? "完成" : input.status,
      local_updated_at: null,
    },
  };

  const { data, error } = await client.rpc("update_article_with_workspace", {
    p_article_id: detail.id,
    p_expected_revision: detail.revision,
    p_patch: articlePatch,
    p_workspace_patch: workspacePatch,
  });
  if (error) {
    const message = String(error.message ?? "").toLowerCase();
    if (String(error.code ?? "") === "40001" || message.includes("revision conflict")) {
      throw new Error("他の端末で記事が更新されています。最新状態を読み直してください。");
    }
    throw new Error("公開状態の保存に失敗しました。");
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("公開状態の保存結果が不正です。");
  }
  const article = (result as Record<string, unknown>).article;
  if (!article || typeof article !== "object" || Array.isArray(article)) {
    throw new Error("公開状態の保存結果が不正です。");
  }
  const row = article as Record<string, unknown>;
  if (row.id !== detail.id || row.user_id !== ownerId || typeof row.revision !== "number") {
    throw new Error("更新記事の所有者またはrevisionを確認できません。");
  }
  if (row.status !== "ready" && row.status !== "waiting_publish" && row.status !== "published") {
    throw new Error("更新後の公開状態が不正です。");
  }
  return { revision: row.revision, status: row.status };
}
