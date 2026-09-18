"use client";

import { useEffect, useMemo, useState } from "react";

import { launchAiApp } from "@/lib/ai-app-links";
import {
  adminListKnowledgeRefreshRequests,
  adminPublishKnowledgeRefreshBundle,
  adminRequestKnowledgeRefresh,
  adminStartKnowledgeRefresh,
  buildKnowledgeRefreshResearchPrompt,
  parseKnowledgeRefreshBundle,
  type KnowledgeRefreshRequest,
} from "@/lib/knowledge-auto-update";
import { getSupabaseClient } from "@/lib/supabase";

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("ja-JP");
}

function statusLabel(status: KnowledgeRefreshRequest["status"]): string {
  switch (status) {
    case "pending": return "待機中";
    case "processing": return "調査・確認中";
    case "completed": return "公開済み";
    case "failed": return "失敗";
    case "cancelled": return "キャンセル";
  }
}

export function KnowledgeRefreshPanel() {
  const [requests, setRequests] = useState<KnowledgeRefreshRequest[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [bundleText, setBundleText] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => requests.find((request) => request.id === selectedId) ?? null,
    [requests, selectedId],
  );

  const reload = async () => {
    const next = await adminListKnowledgeRefreshRequests(getSupabaseClient(), null, 30);
    setRequests(next);
    if (selectedId === null) {
      const active = next.find((request) => request.status === "processing" || request.status === "pending");
      if (active) setSelectedId(active.id);
    }
  };

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        const next = await adminListKnowledgeRefreshRequests(getSupabaseClient(), null, 30);
        if (!active) return;
        setRequests(next);
        const firstActive = next.find((request) => request.status === "processing" || request.status === "pending");
        if (firstActive) setSelectedId(firstActive.id);
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : "更新キューを読み込めませんでした。");
        }
      }
    };
    void boot();
    return () => { active = false; };
  }, []);

  const enqueue = async (channel: "fresh" | "stable") => {
    setBusy(true);
    setMessage("");
    try {
      const id = await adminRequestKnowledgeRefresh(getSupabaseClient(), channel);
      setSelectedId(id);
      await reload();
      setMessage(channel === "fresh" ? "Fresh更新をキューへ追加しました。" : "Stable更新をキューへ追加しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新を追加できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const start = async (request: KnowledgeRefreshRequest) => {
    setBusy(true);
    setMessage("");
    try {
      await adminStartKnowledgeRefresh(getSupabaseClient(), request.id);
      setSelectedId(request.id);
      await reload();
      setMessage("更新を調査・確認中へ変更しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新を開始できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const copyResearchPrompt = async (request: KnowledgeRefreshRequest) => {
    const prompt = buildKnowledgeRefreshResearchPrompt(request.channel);
    try {
      await navigator.clipboard.writeText(prompt);
      setMessage("最新情報調査プロンプトをコピーしました。Web検索できるAIへ貼り付けてください。");
    } catch {
      setMessage("クリップボードへコピーできませんでした。");
    }
  };

  const publish = async () => {
    if (!selected || (selected.status !== "pending" && selected.status !== "processing")) return;
    setBusy(true);
    setMessage("");
    try {
      const bundle = parseKnowledgeRefreshBundle(bundleText);
      const result = await adminPublishKnowledgeRefreshBundle(getSupabaseClient(), selected.id, bundle);
      setBundleText("");
      await reload();
      setMessage(`${result.channel === "fresh" ? "Fresh" : "Stable"} v${result.publishedVersion} を公開しました。Knowledge ${result.knowledgeCount}件 / Prompt ${result.promptCount}件です。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新Bundleを公開できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const activeRequests = requests.filter((request) => request.status === "pending" || request.status === "processing");
  const recentRequests = requests.filter((request) => request.status !== "pending" && request.status !== "processing").slice(0, 8);

  return (
    <section className="knowledge-admin-panel knowledge-refresh-panel">
      <div className="knowledge-panel-head">
        <div>
          <p className="eyebrow">AUTO UPDATE CONTROL</p>
          <h2>Knowledge / Prompt 更新</h2>
          <p>更新期限は自動でキュー化し、調査結果は管理者確認後にFresh / Stableへ版管理して公開します。</p>
        </div>
        <button type="button" disabled={busy} onClick={() => void reload()}>再読込</button>
      </div>

      <div className="knowledge-refresh-safety">
        <strong>自動収集＝自動公開ではありません</strong>
        <span>外部Webの内容はそのまま採用せず、公式情報・根拠URL・変更内容を確認したJSONだけを公開します。Freshは先行配信、Stableは確認期間を置いて反映します。</span>
      </div>

      <div className="knowledge-refresh-actions">
        <button type="button" disabled={busy} onClick={() => void enqueue("fresh")}>Fresh更新を開始</button>
        <button type="button" disabled={busy} onClick={() => void enqueue("stable")}>Stable更新を開始</button>
      </div>

      {message && <div className="route-notice knowledge-message">{message}</div>}

      {activeRequests.length === 0 ? (
        <p className="knowledge-empty">現在、処理待ちの更新はありません。期限到達時はDBスケジューラが自動でキューへ追加します。</p>
      ) : (
        <div className="knowledge-refresh-list">
          {activeRequests.map((request) => (
            <article key={request.id} className={selectedId === request.id ? "active" : ""}>
              <button type="button" className="knowledge-refresh-select" onClick={() => setSelectedId(request.id)}>
                <span>{request.channel === "fresh" ? "Fresh" : "Stable"} / {statusLabel(request.status)}</span>
                <strong>更新 #{request.id}</strong>
                <small>要求 {formatDate(request.requestedAt)} / 開始 {formatDate(request.startedAt)}</small>
              </button>
              <div className="knowledge-refresh-row-actions">
                {request.status === "pending" && <button type="button" disabled={busy} onClick={() => void start(request)}>調査開始</button>}
                <button type="button" disabled={busy} onClick={() => void copyResearchPrompt(request)}>調査プロンプトをコピー</button>
                <button type="button" disabled={busy} onClick={() => launchAiApp("chatgpt")}>ChatGPTを開く</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {selected && (selected.status === "pending" || selected.status === "processing") && (
        <div className="knowledge-refresh-import">
          <div>
            <strong>{selected.channel === "fresh" ? "Fresh" : "Stable"} 更新 #{selected.id} のレビュー済みJSON</strong>
            <p>調査AIの出力を確認し、根拠URL・内容・重複・安全性に問題がない場合だけ貼り付けて公開してください。</p>
          </div>
          <textarea
            rows={14}
            value={bundleText}
            onChange={(event) => setBundleText(event.target.value)}
            placeholder='{"summary":"...","knowledge_rules":[],"prompt_optimizations":[]}'
            spellCheck={false}
          />
          <button type="button" className="approve" disabled={busy || !bundleText.trim()} onClick={() => void publish()}>
            検証して公開
          </button>
        </div>
      )}

      {recentRequests.length > 0 && (
        <div className="knowledge-refresh-history">
          <strong>最近の更新履歴</strong>
          {recentRequests.map((request) => (
            <article key={request.id}>
              <span>{request.channel === "fresh" ? "Fresh" : "Stable"} / {statusLabel(request.status)}</span>
              <small>
                v{request.publishedVersion ?? "-"} / Knowledge {request.publishedKnowledgeCount} / Prompt {request.publishedPromptCount} / {formatDate(request.completedAt)}
              </small>
              {request.researchSummary && <p>{request.researchSummary}</p>}
              {request.errorMessage && <p className="error">{request.errorMessage}</p>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
