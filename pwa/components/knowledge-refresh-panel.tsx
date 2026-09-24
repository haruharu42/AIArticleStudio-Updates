"use client";

import { useEffect, useMemo, useState } from "react";

import { launchAiApp } from "@/lib/ai-app-links";
import {
  adminCancelKnowledgeRefresh,
  adminGetKnowledgeRefreshChannels,
  adminListKnowledgeRefreshRequests,
  adminPreviewKnowledgeRefreshBundleDiff,
  adminPublishKnowledgeRefreshBundle,
  adminRequestKnowledgeRefresh,
  adminRetryKnowledgeRefresh,
  adminRunKnowledgeScheduler,
  adminStartKnowledgeRefresh,
  adminValidateKnowledgeRefreshBundle,
  buildKnowledgeRefreshResearchPrompt,
  parseKnowledgeRefreshBundle,
  type KnowledgeQualityReport,
  type KnowledgeRefreshChangeItem,
  type KnowledgeRefreshChannelState,
  type KnowledgeRefreshDiff,
  type KnowledgeRefreshRequest,
} from "@/lib/knowledge-auto-update";
import { getSupabaseClient } from "@/lib/supabase";

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("ja-JP");
}

function formatCycle(hours: number | null | undefined): string {
  if (!hours) return "-";
  if (hours % 24 === 0) return `${hours / 24}日ごと`;
  return `${hours}時間ごと`;
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

function refreshErrorLabel(value: string): string {
  if (value.startsWith("AAS auto-recovery: processing exceeded 24 hours")) {
    return "24時間以上処理中だったため自動解除しました。次回の更新サイクルで再試行できます。";
  }
  return value;
}

const FIELD_LABELS: Record<string, string> = {
  new: "新規追加",
  kind: "分類",
  label: "表示名",
  parent_label: "親分類",
  aliases: "別名",
  guidance: "制作ルール",
  deliverables: "成果物",
  cautions: "注意・禁止",
  tasks: "適用機能",
  priority: "優先度",
  sources: "根拠URL",
  source_summary: "根拠要約",
  provider: "AIプロバイダー",
  plan: "利用プラン",
  task: "用途",
  rules: "Promptルール",
};

function actionLabel(action: KnowledgeRefreshChangeItem["action"]): string {
  if (action === "added") return "追加";
  if (action === "updated") return "変更";
  return "変更なし";
}

function DiffGroup({
  title,
  diff,
}: {
  title: string;
  diff: KnowledgeRefreshDiff["knowledge"];
}) {
  return (
    <section className="knowledge-diff-group">
      <header>
        <strong>{title}</strong>
        <div>
          <span className="added">＋{diff.added} 追加</span>
          <span className="updated">↻ {diff.updated} 変更</span>
          <span className="unchanged">＝{diff.unchanged} 変更なし</span>
        </div>
      </header>
      {diff.items.length > 0 && (
        <div className="knowledge-diff-items">
          {diff.items.map((item) => (
            <article key={item.itemType + ":" + item.key}>
              <div className="knowledge-diff-item-head">
                <span className={"diff-action " + item.action}>{actionLabel(item.action)}</span>
                <strong>{item.label || item.key}</strong>
              </div>
              <small>{item.key}</small>
              {item.changedFields.length > 0 && (
                <p>
                  変更箇所: {item.changedFields.map((field) => FIELD_LABELS[field] ?? field).join(" / ")}
                </p>
              )}
              {item.sourceSummary && <p className="source-summary">根拠: {item.sourceSummary}</p>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function DiffSummary({ diff }: { diff: KnowledgeRefreshDiff }) {
  return (
    <div className="knowledge-diff-summary">
      <DiffGroup title="Knowledge" diff={diff.knowledge} />
      <DiffGroup title="Prompt" diff={diff.prompt} />
    </div>
  );
}

export function KnowledgeRefreshPanel() {
  const [requests, setRequests] = useState<KnowledgeRefreshRequest[]>([]);
  const [channels, setChannels] = useState<KnowledgeRefreshChannelState[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [bundleText, setBundleText] = useState("");
  const [diffPreview, setDiffPreview] = useState<KnowledgeRefreshDiff | null>(null);
  const [qualityReport, setQualityReport] = useState<KnowledgeQualityReport | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const reviewedSources = useMemo(() => {
    if (!diffPreview || !bundleText.trim()) return [] as string[];
    try {
      const bundle = parseKnowledgeRefreshBundle(bundleText);
      const values = [...bundle.knowledge_rules, ...bundle.prompt_optimizations];
      const urls = values.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const sourceUrls = (item as Record<string, unknown>).source_urls;
        return Array.isArray(sourceUrls)
          ? sourceUrls.filter((value): value is string => typeof value === "string" && /^https:\/\//i.test(value))
          : [];
      });
      return [...new Set(urls)].slice(0, 40);
    } catch {
      return [];
    }
  }, [bundleText, diffPreview]);

  const selected = useMemo(
    () => requests.find((request) => request.id === selectedId) ?? null,
    [requests, selectedId],
  );
  const freshState = channels.find((channel) => channel.channel === "fresh") ?? null;
  const stableState = channels.find((channel) => channel.channel === "stable") ?? null;

  const reload = async () => {
    const client = getSupabaseClient();
    const [nextRequests, nextChannels] = await Promise.all([
      adminListKnowledgeRefreshRequests(client, null, 30),
      adminGetKnowledgeRefreshChannels(client),
    ]);
    setRequests(nextRequests);
    setChannels(nextChannels);
    if (selectedId === null) {
      const active = nextRequests.find((request) => request.status === "processing" || request.status === "pending");
      if (active) setSelectedId(active.id);
    }
  };

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        const client = getSupabaseClient();
        const [nextRequests, nextChannels] = await Promise.all([
          adminListKnowledgeRefreshRequests(client, null, 30),
          adminGetKnowledgeRefreshChannels(client),
        ]);
        if (!active) return;
        setRequests(nextRequests);
        setChannels(nextChannels);
        const firstActive = nextRequests.find((request) => request.status === "processing" || request.status === "pending");
        if (firstActive) setSelectedId(firstActive.id);
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : "更新キューを読み込めませんでした。");
      }
    };
    void boot();
    return () => { active = false; };
  }, []);

  const enqueue = async (channel: "fresh" | "stable") => {
    setBusy(true);
    setMessage("");
    setDiffPreview(null);
    setQualityReport(null);
    try {
      const id = await adminRequestKnowledgeRefresh(getSupabaseClient(), channel);
      setSelectedId(id);
      await reload();
      setMessage(channel === "fresh"
        ? "Fresh（先行確認版）の更新をキューへ追加しました。"
        : "Stable（標準版）の更新をキューへ追加しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新を追加できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const start = async (request: KnowledgeRefreshRequest) => {
    setBusy(true);
    setMessage("");
    setDiffPreview(null);
    setQualityReport(null);
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

  const cancel = async (request: KnowledgeRefreshRequest) => {
    if (!window.confirm(`更新 #${request.id} を中止しますか？公開済みKnowledge / Promptには影響しません。`)) return;
    setBusy(true);
    setMessage("");
    try {
      await adminCancelKnowledgeRefresh(getSupabaseClient(), request.id);
      setBundleText("");
      setDiffPreview(null);
    setQualityReport(null);
      if (selectedId === request.id) setSelectedId(null);
      await reload();
      setMessage(`更新 #${request.id} を中止しました。必要なら履歴から再試行できます。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新を中止できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const retry = async (request: KnowledgeRefreshRequest) => {
    setBusy(true);
    setMessage("");
    setDiffPreview(null);
    setQualityReport(null);
    try {
      const nextId = await adminRetryKnowledgeRefresh(getSupabaseClient(), request.id);
      setSelectedId(nextId);
      setBundleText("");
      await reload();
      setMessage(`更新 #${request.id} を再キュー化しました。現在の更新IDは #${nextId} です。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新を再試行できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const syncScheduler = async () => {
    setBusy(true);
    setMessage("");
    try {
      await adminRunKnowledgeScheduler(getSupabaseClient());
      await reload();
      setMessage("更新期限を再確認し、必要なFresh / Stable要求を同期しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新スケジューラを同期できませんでした。");
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

  const previewDiff = async () => {
    if (!bundleText.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const bundle = parseKnowledgeRefreshBundle(bundleText);
      const [diff, quality] = await Promise.all([
        adminPreviewKnowledgeRefreshBundleDiff(getSupabaseClient(), bundle),
        adminValidateKnowledgeRefreshBundle(getSupabaseClient(), bundle),
      ]);
      setDiffPreview(diff);
      setQualityReport(quality);
      setMessage(quality.valid
        ? "差分と品質ゲートを確認しました。ブロック項目はありません。"
        : `品質ゲートで ${quality.blocking.length}件の修正必須項目が見つかりました。公開前に修正してください。`);
    } catch (error) {
      setDiffPreview(null);
    setQualityReport(null);
      setMessage(error instanceof Error ? error.message : "変更点を比較できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!selected || !diffPreview || !qualityReport?.valid || (selected.status !== "pending" && selected.status !== "processing")) return;

    const changedCount =
      diffPreview.knowledge.added + diffPreview.knowledge.updated +
      diffPreview.prompt.added + diffPreview.prompt.updated;
    const channelLabel = selected.channel === "fresh" ? "Fresh（先行確認版）" : "Stable（標準版）";

    if (!window.confirm(
      `${channelLabel}へ公開しますか？\n追加・変更される項目は合計 ${changedCount}件です。\n品質ゲート: ブロック0件 / 警告 ${qualityReport.warnings.length}件\n差分と根拠を確認済みの場合のみ続行してください。`,
    )) return;

    setBusy(true);
    setMessage("");
    try {
      const bundle = parseKnowledgeRefreshBundle(bundleText);
      const result = await adminPublishKnowledgeRefreshBundle(getSupabaseClient(), selected.id, bundle);
      setBundleText("");
      setDiffPreview(null);
    setQualityReport(null);
      await reload();
      setMessage(
        `${result.channel === "fresh" ? "Fresh（先行確認版）" : "Stable（標準版）"} v${result.publishedVersion} を公開しました。Knowledge ${result.knowledgeCount}件 / Prompt ${result.promptCount}件です。`,
      );
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
          <p>記事・SNS・画像に加え、各副業専用Knowledge / Promptも更新対象です。更新期限は自動でキュー化し、管理者が差分と根拠を確認してからFresh / Stableへ版管理して公開します。</p>
        </div>
        <div className="knowledge-panel-actions">
          <button type="button" disabled={busy} onClick={() => void syncScheduler()}>更新期限を同期</button>
          <button type="button" disabled={busy} onClick={() => void reload()}>再読込</button>
        </div>
      </div>

      <div className="knowledge-channel-guide" aria-label="FreshとStableの違い">
        <article className="fresh">
          <div className="knowledge-channel-title">
            <span>FRESH</span>
            <strong>先行確認版</strong>
          </div>
          <h3>新しい重要変更を早めに確認</h3>
          <p>管理者 / Creator Membership向けの先行チャネル。公式根拠を確認した変更を早期に試し、一般側へ広げる前に問題がないか確認します。</p>
          <dl>
            <div><dt>更新周期</dt><dd>{formatCycle(freshState?.refreshHours)}</dd></div>
            <div><dt>現在</dt><dd>v{freshState?.currentVersion ?? "-"}</dd></div>
            <div><dt>次回予定</dt><dd>{formatDate(freshState?.nextRefreshDueAt ?? null)}</dd></div>
          </dl>
          <button type="button" disabled={busy} onClick={() => void enqueue("fresh")}>Fresh（先行確認）を更新</button>
        </article>

        <article className="stable">
          <div className="knowledge-channel-title">
            <span>STABLE</span>
            <strong>標準版</strong>
          </div>
          <h3>確認済みの内容を通常利用へ</h3>
          <p>一般ユーザー向けの標準チャネル。十分に確認できた仕様やPrompt改善を優先し、変化の速さより安定性を重視します。</p>
          <dl>
            <div><dt>更新周期</dt><dd>{formatCycle(stableState?.refreshHours)}</dd></div>
            <div><dt>現在</dt><dd>v{stableState?.currentVersion ?? "-"}</dd></div>
            <div><dt>次回予定</dt><dd>{formatDate(stableState?.nextRefreshDueAt ?? null)}</dd></div>
          </dl>
          <button type="button" disabled={busy} onClick={() => void enqueue("stable")}>Stable（標準版）を更新</button>
        </article>
      </div>

      <div className="knowledge-channel-flow">
        <strong>使い分け</strong>
        <span>Fresh = 早めに確認する場所</span>
        <b aria-hidden="true">→</b>
        <span>Stable = 一般利用の基準</span>
      </div>

      <div className="knowledge-refresh-safety">
        <strong>自動収集＝自動公開ではありません</strong>
        <span>外部Webの内容はそのまま採用しません。公式情報・根拠URL・現在データとの差分を管理者が確認し、「変更点を確認」後にだけ公開できます。</span>
      </div>

      {message && <div className="route-notice knowledge-message">{message}</div>}

      {activeRequests.length === 0 ? (
        <p className="knowledge-empty">現在、処理待ちの更新はありません。期限到達時はDBスケジューラが自動でキューへ追加します。</p>
      ) : (
        <div className="knowledge-refresh-list">
          {activeRequests.map((request) => (
            <article key={request.id} className={selectedId === request.id ? "active" : ""}>
              <button type="button" className="knowledge-refresh-select" onClick={() => {
                setSelectedId(request.id);
                setDiffPreview(null);
    setQualityReport(null);
                setBundleText("");
              }}>
                <span className={"channel-label " + request.channel}>
                  {request.channel === "fresh" ? "Fresh・先行確認" : "Stable・標準版"} / {statusLabel(request.status)}
                </span>
                <strong>更新 #{request.id}</strong>
                <small>要求 {formatDate(request.requestedAt)} / 開始 {formatDate(request.startedAt)}</small>
              </button>
              <div className="knowledge-refresh-row-actions">
                {request.status === "pending" && <button type="button" disabled={busy} onClick={() => void start(request)}>調査開始</button>}
                <button type="button" disabled={busy} onClick={() => void copyResearchPrompt(request)}>調査プロンプトをコピー</button>
                <button type="button" disabled={busy} onClick={() => launchAiApp("chatgpt")}>ChatGPT</button>
                <button type="button" disabled={busy} onClick={() => launchAiApp("claude")}>Claude</button>
                <button type="button" disabled={busy} onClick={() => launchAiApp("gemini")}>Gemini</button>
                <button type="button" className="danger" disabled={busy} onClick={() => void cancel(request)}>中止</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {selected && (selected.status === "pending" || selected.status === "processing") && (
        <div className="knowledge-refresh-import">
          <div>
            <strong>{selected.channel === "fresh" ? "Fresh・先行確認版" : "Stable・標準版"} 更新 #{selected.id} のレビュー済みJSON</strong>
            <p>調査AIの出力を貼り付けたら、公開前に必ず「変更点を確認」を押してください。現在の正式Knowledge / Promptと自動比較します。</p>
          </div>
          <textarea
            rows={14}
            value={bundleText}
            onChange={(event) => {
              setBundleText(event.target.value);
              setDiffPreview(null);
              setQualityReport(null);
    setQualityReport(null);
            }}
            placeholder='{"summary":"...","knowledge_rules":[],"prompt_optimizations":[]}'
            spellCheck={false}
          />
          <div className="knowledge-refresh-publish-actions">
            <button type="button" disabled={busy || !bundleText.trim()} onClick={() => void previewDiff()}>
              変更点を確認
            </button>
            <button type="button" className="approve" disabled={busy || !diffPreview || !qualityReport?.valid} onClick={() => void publish()}>
              差分確認後に公開
            </button>
          </div>

          {diffPreview && (
            <div className="knowledge-diff-preview">
              <div>
                <p className="eyebrow">CHANGE REVIEW</p>
                <strong>今回どこが変わるか</strong>
                <p>「追加」「変更」「変更なし」を正式データと比較した結果です。変更箇所と根拠要約を確認してください。</p>
              </div>
              <DiffSummary diff={diffPreview} />
              {qualityReport && (
                <section className={`knowledge-quality-gate ${qualityReport.valid ? "pass" : "blocked"}`}>
                  <header>
                    <div>
                      <strong>{qualityReport.valid ? "✓ 品質ゲート通過" : "公開前の修正が必要"}</strong>
                      <p>Knowledge {qualityReport.stats.knowledgeCount}件 / Prompt {qualityReport.stats.promptCount}件 / 根拠URL {qualityReport.stats.sourceUrlCount}件</p>
                    </div>
                    <span>{qualityReport.blocking.length} BLOCK / {qualityReport.warnings.length} WARN</span>
                  </header>
                  {qualityReport.blocking.length > 0 && (
                    <div className="knowledge-quality-issues blocking">
                      {qualityReport.blocking.map((issue, index) => (
                        <article key={`blocking:${issue.code}:${issue.key}:${index}`}>
                          <strong>修正必須</strong>
                          <p>{issue.message}</p>
                          {issue.key && <small>{issue.key}</small>}
                        </article>
                      ))}
                    </div>
                  )}
                  {qualityReport.warnings.length > 0 && (
                    <details className="knowledge-quality-warnings">
                      <summary>警告 {qualityReport.warnings.length}件を確認</summary>
                      <div>
                        {qualityReport.warnings.map((issue, index) => (
                          <article key={`warning:${issue.code}:${issue.key}:${index}`}>
                            <strong>確認推奨</strong>
                            <p>{issue.message}</p>
                            {issue.key && <small>{issue.key}</small>}
                          </article>
                        ))}
                      </div>
                    </details>
                  )}
                </section>
              )}
              {reviewedSources.length > 0 && (
                <div className="knowledge-source-review">
                  <strong>今回の根拠URL</strong>
                  <p>公開前に一次情報の内容・更新日・対象地域/プランを確認してください。</p>
                  <div>{reviewedSources.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer">{url}</a>)}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {recentRequests.length > 0 && (
        <div className="knowledge-refresh-history">
          <strong>最近の更新履歴・変更点</strong>
          {recentRequests.map((request) => {
            const diff = request.changeDetails;
            const hasDetails = diff.knowledge.items.length > 0 || diff.prompt.items.length > 0;
            return (
              <article key={request.id}>
                <div className="knowledge-history-head">
                  <span className={"channel-label " + request.channel}>
                    {request.channel === "fresh" ? "Fresh・先行確認" : "Stable・標準版"} / {statusLabel(request.status)}
                  </span>
                  <small>
                    v{request.publishedVersion ?? "-"} / {formatDate(request.completedAt)}
                  </small>
                </div>
                <div className="knowledge-history-counts">
                  <span>Knowledge: ＋{diff.knowledge.added} / 変更 {diff.knowledge.updated}</span>
                  <span>Prompt: ＋{diff.prompt.added} / 変更 {diff.prompt.updated}</span>
                </div>
                {request.researchSummary && <p>{request.researchSummary}</p>}
                {hasDetails && (
                  <details>
                    <summary>変更した場所を詳しく見る</summary>
                    <DiffSummary diff={diff} />
                  </details>
                )}
                {!hasDetails && request.status === "completed" && (
                  <small>この更新は旧形式の履歴のため詳細差分は記録されていません。</small>
                )}
                {request.errorMessage && <p className="error">{refreshErrorLabel(request.errorMessage)}</p>}
                {(request.status === "failed" || request.status === "cancelled") && (
                  <div className="knowledge-refresh-row-actions">
                    <button type="button" disabled={busy} onClick={() => void retry(request)}>この更新を再試行</button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
