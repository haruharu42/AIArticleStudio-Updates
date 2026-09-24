"use client";

import { useEffect, useMemo, useState } from "react";

import { launchAiApp } from "@/lib/ai-app-links";
import {
  adminCancelKnowledgeRefresh,
  adminGetKnowledgeRefreshChannels,
  adminGetSourceFreshnessQueue,
  adminGetSourceRiskReport,
  adminGetStableReleaseQueue,
  adminListKnowledgeRefreshRequests,
  adminPreviewKnowledgeRefreshBundleDiff,
  adminPrepareSourceFreshnessRecheck,
  adminPrepareStableRelease,
  adminPublishKnowledgeRefreshBundle,
  adminRequestKnowledgeRefresh,
  adminRetryKnowledgeRefresh,
  adminRunKnowledgeScheduler,
  adminStartKnowledgeRefresh,
  adminValidateKnowledgeRefreshBundle,
  adminValidateStablePromotionBundle,
  buildKnowledgeRefreshResearchPrompt,
  buildSourceFreshnessResearchPrompt,
  parseKnowledgeRefreshBundle,
  type KnowledgeQualityReport,
  type KnowledgeRefreshChangeItem,
  type KnowledgeRefreshChannelState,
  type KnowledgeRefreshDiff,
  type KnowledgeRefreshRequest,
  type SourceFreshnessQueue,
  type SourceRiskReport,
  type StablePromotionReport,
  type StableReleaseQueue,
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
  const [stablePromotionReport, setStablePromotionReport] = useState<StablePromotionReport | null>(null);
  const [stableQueue, setStableQueue] = useState<StableReleaseQueue | null>(null);
  const [sourceQueue, setSourceQueue] = useState<SourceFreshnessQueue | null>(null);
  const [sourceRisk, setSourceRisk] = useState<SourceRiskReport | null>(null);
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
    const [nextRequests, nextChannels, nextStableQueue, nextSourceQueue, nextSourceRisk] = await Promise.all([
      adminListKnowledgeRefreshRequests(client, null, 30),
      adminGetKnowledgeRefreshChannels(client),
      adminGetStableReleaseQueue(client),
      adminGetSourceFreshnessQueue(client),
      adminGetSourceRiskReport(client),
    ]);
    setRequests(nextRequests);
    setChannels(nextChannels);
    setStableQueue(nextStableQueue);
    setSourceQueue(nextSourceQueue);
    setSourceRisk(nextSourceRisk);
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
        const [nextRequests, nextChannels, nextStableQueue, nextSourceQueue, nextSourceRisk] = await Promise.all([
          adminListKnowledgeRefreshRequests(client, null, 30),
          adminGetKnowledgeRefreshChannels(client),
          adminGetStableReleaseQueue(client),
          adminGetSourceFreshnessQueue(client),
          adminGetSourceRiskReport(client),
        ]);
        if (!active) return;
        setRequests(nextRequests);
        setChannels(nextChannels);
        setStableQueue(nextStableQueue);
        setSourceQueue(nextSourceQueue);
        setSourceRisk(nextSourceRisk);
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
    setStablePromotionReport(null);
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
    setStablePromotionReport(null);
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
    setStablePromotionReport(null);
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
    setStablePromotionReport(null);
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

  const prepareStableRelease = async () => {
    if (!stableQueue || stableQueue.readyCount < 1) return;
    setBusy(true);
    setMessage("");
    setDiffPreview(null);
    setQualityReport(null);
    setStablePromotionReport(null);
    try {
      const prepared = await adminPrepareStableRelease(getSupabaseClient());
      setSelectedId(prepared.requestId);
      setBundleText(JSON.stringify(prepared.bundle, null, 2));
      await reload();
      setSelectedId(prepared.requestId);
      setMessage(
        `Stableレビュー候補を自動準備しました。Knowledge ${prepared.knowledgeCount}件 / Prompt ${prepared.promptCount}件です。「変更点を確認」からレビューしてください。`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Stableレビュー候補を準備できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const prepareSourceRecheck = async () => {
    if (!sourceQueue || sourceQueue.missingCount + sourceQueue.staleCount + sourceQueue.dueCount < 1) return;
    setBusy(true);
    setMessage("");
    setDiffPreview(null);
    setQualityReport(null);
    setStablePromotionReport(null);
    setBundleText("");
    try {
      const prepared = await adminPrepareSourceFreshnessRecheck(getSupabaseClient(), 20);
      const prompt = buildSourceFreshnessResearchPrompt(prepared);
      await navigator.clipboard.writeText(prompt);
      await reload();
      setSelectedId(prepared.requestId);
      setMessage(
        `根拠再確認対象 ${prepared.itemCount}件をFresh更新 #${prepared.requestId} に準備し、専用調査プロンプトをコピーしました。Web検索できるAIで再確認し、JSONを貼り付けてください。`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "根拠再確認を準備できませんでした。");
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
      const client = getSupabaseClient();
      const [diff, quality, stableGate] = await Promise.all([
        adminPreviewKnowledgeRefreshBundleDiff(client, bundle),
        adminValidateKnowledgeRefreshBundle(client, bundle),
        selected?.channel === "stable"
          ? adminValidateStablePromotionBundle(client, bundle)
          : Promise.resolve(null),
      ]);
      setDiffPreview(diff);
      setQualityReport(quality);
      setStablePromotionReport(stableGate);
      if (!quality.valid) {
        setMessage(`品質ゲートで ${quality.blocking.length}件の修正必須項目が見つかりました。公開前に修正してください。`);
      } else if (stableGate && !stableGate.valid) {
        setMessage(`Stable昇格ゲートで ${stableGate.blocking.length}件の回帰を検出しました。Stable公開前に修正してください。`);
      } else {
        setMessage(selected?.channel === "stable"
          ? "差分・品質ゲート・Stable昇格ゲートを確認しました。ブロック項目はありません。"
          : "差分と品質ゲートを確認しました。ブロック項目はありません。");
      }
    } catch (error) {
      setDiffPreview(null);
      setQualityReport(null);
    setStablePromotionReport(null);
      setMessage(error instanceof Error ? error.message : "変更点を比較できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (
      !selected
      || !diffPreview
      || !qualityReport?.valid
      || (selected.channel === "stable" && !stablePromotionReport?.valid)
      || (selected.status !== "pending" && selected.status !== "processing")
    ) return;

    const changedCount =
      diffPreview.knowledge.added + diffPreview.knowledge.updated +
      diffPreview.prompt.added + diffPreview.prompt.updated;
    const channelLabel = selected.channel === "fresh" ? "Fresh（先行確認版）" : "Stable（標準版）";

    if (!window.confirm(
      `${channelLabel}へ公開しますか？\n追加・変更される項目は合計 ${changedCount}件です。\n品質ゲート: ブロック0件 / 警告 ${qualityReport.warnings.length}件${selected.channel === "stable" ? "\nStable昇格ゲート: 12副業のTop 5回帰なし" : ""}\n差分と根拠を確認済みの場合のみ続行してください。`,
    )) return;

    setBusy(true);
    setMessage("");
    try {
      const bundle = parseKnowledgeRefreshBundle(bundleText);
      const result = await adminPublishKnowledgeRefreshBundle(getSupabaseClient(), selected.id, bundle);
      setBundleText("");
      setDiffPreview(null);
      setQualityReport(null);
    setStablePromotionReport(null);
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

      <section className="knowledge-source-freshness-queue">
        <header>
          <div>
            <p className="eyebrow">SOURCE FRESHNESS QUEUE</p>
            <strong>公式根拠の再確認</strong>
            <p>Knowledge / Promptの根拠確認日を監視し、{sourceQueue?.staleDays ?? 90}日失効の{sourceQueue?.warningDays ?? 30}日前から再確認対象へ入れます。確認済み扱いへの自動更新はしません。</p>
          </div>
          <div className="knowledge-source-freshness-counts">
            <span className={(sourceQueue?.missingCount ?? 0) > 0 ? "missing" : ""}>MISSING {sourceQueue?.missingCount ?? 0}</span>
            <span className={(sourceQueue?.staleCount ?? 0) > 0 ? "stale" : ""}>STALE {sourceQueue?.staleCount ?? 0}</span>
            <span className={(sourceQueue?.dueCount ?? 0) > 0 ? "due" : ""}>DUE {sourceQueue?.dueCount ?? 0}</span>
            <span className="fresh">FRESH {sourceQueue?.freshCount ?? 0}</span>
          </div>
        </header>
        <div className="knowledge-source-freshness-meta">
          <span>次の再確認開始: {formatDate(sourceQueue?.nextDueAt ?? null)}</span>
          <span>期限基準: {sourceQueue?.staleDays ?? 90}日</span>
        </div>
        {(sourceQueue?.items.filter((item) => item.state !== "fresh").length ?? 0) > 0 ? (
          <div className="knowledge-source-freshness-items">
            {sourceQueue?.items.filter((item) => item.state !== "fresh").slice(0, 12).map((item) => (
              <article key={item.itemType + ":" + item.key} className={item.state}>
                <div>
                  <span>{item.itemType === "knowledge" ? "Knowledge" : "Prompt"} · v{item.catalogVersion}</span>
                  <strong>{item.label}</strong>
                  <small>{item.key}</small>
                </div>
                <div>
                  <b>{item.state === "missing" ? "根拠不足" : item.state === "stale" ? "期限切れ" : "再確認時期"}</b>
                  <small>確認 {formatDate(item.sourceCheckedAt)}{item.ageDays !== null ? ` · ${item.ageDays}日経過` : ""}</small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="knowledge-empty">現在、再確認が必要な根拠はありません。</p>
        )}
        <button
          type="button"
          className="knowledge-source-recheck"
          disabled={busy || !sourceQueue || sourceQueue.missingCount + sourceQueue.staleCount + sourceQueue.dueCount < 1}
          onClick={() => void prepareSourceRecheck()}
        >
          再確認プロンプトを準備・コピー
        </button>
        <p className="knowledge-review-note">最大20件をFresh更新へ準備します。公式ページを実際に確認したJSONを貼り付け、既存の差分・品質ゲートを通してから公開してください。</p>
      </section>

      <section className="knowledge-source-risk-report">
        <header>
          <div>
            <p className="eyebrow">SOURCE DIVERSITY</p>
            <strong>根拠ドメインの分散状況</strong>
            <p>鮮度とは別に、Knowledge / Promptが1つのURLや1ドメインへ依存しすぎていないかを確認します。単一ソースは自動で不合格にはしません。</p>
          </div>
          <div className="knowledge-source-risk-summary">
            <span>DOMAIN {sourceRisk?.uniqueDomainCount ?? 0}</span>
            <span>MULTI {sourceRisk?.multiDomainCount ?? 0}</span>
            <span className={(sourceRisk?.singleSourceCount ?? 0) > 0 ? "attention" : ""}>1 URL {sourceRisk?.singleSourceCount ?? 0}</span>
          </div>
        </header>
        <div className="knowledge-source-risk-metrics">
          <article><span>対象</span><strong>{sourceRisk?.itemCount ?? 0}</strong><small>Knowledge + Prompt</small></article>
          <article><span>複数ドメイン</span><strong>{sourceRisk?.multiDomainCount ?? 0}</strong><small>2ドメイン以上</small></article>
          <article><span>単一ドメイン</span><strong>{sourceRisk?.singleDomainCount ?? 0}</strong><small>追加確認候補</small></article>
          <article><span>最大ドメイン比率</span><strong>{sourceRisk?.topDomainSharePercent ?? 0}%</strong><small>{sourceRisk?.topDomainItemCount ?? 0}項目で利用</small></article>
        </div>
        {(sourceRisk?.domains.length ?? 0) > 0 && (
          <div className="knowledge-source-domain-list">
            <strong>使用ドメイン上位</strong>
            <div>
              {sourceRisk?.domains.slice(0, 8).map((domain) => (
                <span key={domain.domain}><b>{domain.domain}</b><small>{domain.itemCount}項目 / {domain.urlCount}URL</small></span>
              ))}
            </div>
          </div>
        )}
        {(sourceRisk?.reviewItems.length ?? 0) > 0 ? (
          <div className="knowledge-source-risk-items">
            <strong>単一ソース / 単一ドメインの確認候補</strong>
            {sourceRisk?.reviewItems.slice(0, 10).map((item) => (
              <article key={item.itemType + ":" + item.key}>
                <div>
                  <span>{item.itemType === "knowledge" ? "Knowledge" : "Prompt"} · v{item.catalogVersion}</span>
                  <strong>{item.label}</strong>
                  <small>{item.key}</small>
                </div>
                <div>
                  <b>{item.sourceCount} URL / {item.domainCount} domain</b>
                  <small>根拠確認 {formatDate(item.sourceCheckedAt)}</small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="knowledge-empty">単一ソース依存の確認候補はありません。</p>
        )}
        <p className="knowledge-review-note">1つの公式一次情報だけで十分な場合もあります。この表示は自動判定ではなく、重要なルールほど追加根拠が必要か管理者が判断するための補助です。</p>
      </section>

      <section className="knowledge-stable-release-queue">
        <header>
          <div>
            <p className="eyebrow">STABLE RELEASE QUEUE</p>
            <strong>Fresh → Stable 昇格候補</strong>
            <p>Freshで検証済みかつ待機期間を完了し、現在のStableスナップショットと差分がある項目だけを候補化します。ここでは公開されません。</p>
          </div>
          <div className="knowledge-stable-release-counts">
            <span className="ready">READY {stableQueue?.readyCount ?? 0}</span>
            <span>WAIT {stableQueue?.waitingCount ?? 0}</span>
            <span className={(stableQueue?.blockedCount ?? 0) > 0 ? "blocked" : ""}>BLOCK {stableQueue?.blockedCount ?? 0}</span>
          </div>
        </header>
        <div className="knowledge-stable-release-meta">
          <span>Knowledge READY: {stableQueue?.knowledgeReadyCount ?? 0}</span>
          <span>Prompt READY: {stableQueue?.promptReadyCount ?? 0}</span>
          <span>次の昇格可能: {formatDate(stableQueue?.nextReadyAt ?? null)}</span>
        </div>
        {(stableQueue?.items.length ?? 0) > 0 ? (
          <div className="knowledge-stable-release-items">
            {stableQueue?.items.slice(0, 12).map((item) => (
              <article key={item.itemType + ":" + item.key} className={item.state}>
                <div>
                  <span>{item.itemType === "knowledge" ? "Knowledge" : "Prompt"} · {item.changeType === "new" ? "新規" : "更新"}</span>
                  <strong>{item.label}</strong>
                  <small>{item.key}</small>
                </div>
                <div>
                  <b>{item.state === "ready" ? "昇格可能" : item.state === "waiting" ? "待機中" : "要修正"}</b>
                  <small>{item.stateReason || `根拠確認 ${formatDate(item.sourceCheckedAt)}`}</small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="knowledge-empty">現在、Stableとの差分はありません。</p>
        )}
        {(stableQueue?.items.length ?? 0) > 12 && (
          <small className="knowledge-stable-release-more">ほか {(stableQueue?.items.length ?? 0) - 12}件</small>
        )}
        <button
          type="button"
          className="knowledge-stable-prepare"
          disabled={busy || (stableQueue?.readyCount ?? 0) < 1}
          onClick={() => void prepareStableRelease()}
        >
          Stableレビューを自動準備
        </button>
        <p className="knowledge-review-note">このボタンはレビュー用JSONを作るだけです。公開には「変更点を確認」→品質ゲート→Stable昇格ゲート→管理者確認が必要です。</p>
      </section>

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
    setStablePromotionReport(null);
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
    setStablePromotionReport(null);
            }}
            placeholder='{"summary":"...","knowledge_rules":[],"prompt_optimizations":[]}'
            spellCheck={false}
          />
          <div className="knowledge-refresh-publish-actions">
            <button type="button" disabled={busy || !bundleText.trim()} onClick={() => void previewDiff()}>
              変更点を確認
            </button>
            <button
              type="button"
              className="approve"
              disabled={busy || !diffPreview || !qualityReport?.valid || (selected.channel === "stable" && !stablePromotionReport?.valid)}
              onClick={() => void publish()}
            >
              {selected.channel === "stable" ? "Stableゲート通過後に公開" : "差分確認後に公開"}
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
              {selected.channel === "stable" && stablePromotionReport && (
                <section className={`knowledge-stable-gate ${stablePromotionReport.valid ? "pass" : "blocked"}`}>
                  <header>
                    <div>
                      <strong>{stablePromotionReport.valid ? "✓ Stable昇格ゲート通過" : "Stable公開を停止中"}</strong>
                      <p>公開後のStableカタログで12副業のTop 5を再計算しています。根拠鮮度は{stablePromotionReport.staleDays}日以内が基準です。</p>
                    </div>
                    <span>{stablePromotionReport.tasks.filter((task) => (
                      task.selectedCount >= 5
                      && task.corePass
                      && task.supportPass
                      && task.topTaskSpecific
                      && task.missingSourceCount === 0
                      && task.staleSourceCount === 0
                    )).length}/{stablePromotionReport.tasks.length} PASS</span>
                  </header>
                  <div className="knowledge-stable-gate-grid">
                    {stablePromotionReport.tasks.map((task) => {
                      const passed = task.selectedCount >= 5
                        && task.corePass
                        && task.supportPass
                        && task.topTaskSpecific
                        && task.missingSourceCount === 0
                        && task.staleSourceCount === 0;
                      return (
                        <article key={task.task} className={passed ? "pass" : "fail"}>
                          <strong>{task.task.replace("sidejob_", "")}</strong>
                          <small>Top5 {task.selectedCount}/5 · Core {task.corePass ? "✓" : "!"} · Support {task.supportPass ? "✓" : "!"}</small>
                          <small>根拠欠落 {task.missingSourceCount} · 古い根拠 {task.staleSourceCount}</small>
                        </article>
                      );
                    })}
                  </div>
                  {stablePromotionReport.blocking.length > 0 && (
                    <div className="knowledge-quality-issues blocking">
                      {stablePromotionReport.blocking.map((issue, index) => (
                        <article key={`stable:${issue.code}:${issue.key}:${index}`}>
                          <strong>Stable公開ブロック</strong>
                          <p>{issue.message}</p>
                          {issue.key && <small>{issue.key}</small>}
                        </article>
                      ))}
                    </div>
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
