"use client";

import { useEffect, useMemo, useState } from "react";

import { launchAiApp } from "@/lib/ai-app-links";
import { PresetNumberSelectWithCustom, SelectWithCustom } from "@/components/select-with-custom";
import {
  adminGetKnowledgeAutomationAiConfig,
  adminGetKnowledgeAutomationStatus,
  adminGetKnowledgeRefreshChannels,
  adminListKnowledgeAutomationCandidates,
  adminListKnowledgeAutomationSources,
  adminListKnowledgeRefreshRequests,
  adminPreviewKnowledgeRefreshBundleDiff,
  adminPublishKnowledgeRefreshBundle,
  adminRequestKnowledgeAutomationRun,
  adminRequestKnowledgeRefresh,
  adminRetryKnowledgeAutomationCandidateAi,
  adminReviewKnowledgeAutomationCandidate,
  adminSetKnowledgeAutomationAiConfig,
  adminStartKnowledgeRefresh,
  buildKnowledgeAutomationCandidateBundle,
  buildKnowledgeRefreshResearchPrompt,
  parseKnowledgeRefreshBundle,
  type KnowledgeAutomationAiConfig,
  type KnowledgeAutomationCandidate,
  type KnowledgeAutomationSource,
  type KnowledgeAutomationStatus,
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

function automationActionLabel(action: KnowledgeAutomationCandidate["candidateAction"]): string {
  switch (action) {
    case "new": return "新規候補";
    case "update": return "更新候補";
    case "recheck": return "再確認";
    case "retire": return "廃止候補";
  }
}

const SIDE_HUSTLE_COVERAGE_TASKS = [
  ["sidejob_content", "記事・コンテンツ"],
  ["sidejob_sns", "SNS運用"],
  ["sidejob_video", "YouTube・ショート動画"],
  ["sidejob_affiliate", "アフィリエイト"],
  ["sidejob_resale", "物販・フリマ"],
  ["sidejob_crowdsourcing", "クラウドソーシング"],
  ["sidejob_skill_sales", "スキル販売"],
  ["sidejob_digital_product", "デジタル商品"],
  ["sidejob_outreach", "営業・案件獲得"],
  ["sidejob_research", "リサーチ"],
  ["sidejob_efficiency", "業務効率化"],
  ["sidejob_planning", "AI副業プラン"],
] as const;

function sourceKindLabel(value: string): string {
  switch (value) {
    case "official_changelog": return "公式Changelog";
    case "official_docs": return "公式Docs";
    case "official_help": return "公式Help";
    case "official_policy": return "公式Policy";
    case "official_feed": return "公式Feed";
    default: return "公式ページ";
  }
}

function sourceHost(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
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
  const [automationStatus, setAutomationStatus] = useState<KnowledgeAutomationStatus | null>(null);
  const [automationSources, setAutomationSources] = useState<KnowledgeAutomationSource[]>([]);
  const [automationCandidates, setAutomationCandidates] = useState<KnowledgeAutomationCandidate[]>([]);
  const [automationAiConfig, setAutomationAiConfig] = useState<KnowledgeAutomationAiConfig | null>(null);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiModel, setAiModel] = useState("gpt-5.6");
  const [aiMaxCandidates, setAiMaxCandidates] = useState(6);
  const [aiApiKey, setAiApiKey] = useState("");
  const [preparedAutomationCandidateId, setPreparedAutomationCandidateId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [bundleText, setBundleText] = useState("");
  const [diffPreview, setDiffPreview] = useState<KnowledgeRefreshDiff | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => requests.find((request) => request.id === selectedId) ?? null,
    [requests, selectedId],
  );
  const freshState = channels.find((channel) => channel.channel === "fresh") ?? null;
  const stableState = channels.find((channel) => channel.channel === "stable") ?? null;
  const enabledAutomationSources = useMemo(
    () => automationSources.filter((source) => source.enabled),
    [automationSources],
  );
  const failingAutomationSources = useMemo(
    () => enabledAutomationSources.filter(
      (source) => source.consecutiveFailures > 0 || (source.lastHttpStatus !== null && source.lastHttpStatus >= 400),
    ),
    [enabledAutomationSources],
  );
  const automationCoverage = useMemo(
    () => SIDE_HUSTLE_COVERAGE_TASKS.map(([task, label]) => ({
      task,
      label,
      count: enabledAutomationSources.filter(
        (source) => source.tasks.includes("all") || source.tasks.includes(task),
      ).length,
    })),
    [enabledAutomationSources],
  );

  const reload = async () => {
    const client = getSupabaseClient();
    const [nextRequests, nextChannels, nextAutomationStatus, nextAutomationSources, nextAutomationCandidates, nextAiConfig] = await Promise.all([
      adminListKnowledgeRefreshRequests(client, null, 30),
      adminGetKnowledgeRefreshChannels(client),
      adminGetKnowledgeAutomationStatus(client),
      adminListKnowledgeAutomationSources(client, 200),
      adminListKnowledgeAutomationCandidates(client, "pending", 50),
      adminGetKnowledgeAutomationAiConfig(client),
    ]);
    setRequests(nextRequests);
    setChannels(nextChannels);
    setAutomationStatus(nextAutomationStatus);
    setAutomationSources(nextAutomationSources);
    setAutomationCandidates(nextAutomationCandidates);
    setAutomationAiConfig(nextAiConfig);
    setAiEnabled(nextAiConfig.enabled);
    setAiModel(nextAiConfig.model);
    setAiMaxCandidates(nextAiConfig.maxCandidatesPerRun);
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
        const [nextRequests, nextChannels, nextAutomationStatus, nextAutomationSources, nextAutomationCandidates, nextAiConfig] = await Promise.all([
          adminListKnowledgeRefreshRequests(client, null, 30),
          adminGetKnowledgeRefreshChannels(client),
          adminGetKnowledgeAutomationStatus(client),
          adminListKnowledgeAutomationSources(client, 200),
          adminListKnowledgeAutomationCandidates(client, "pending", 50),
          adminGetKnowledgeAutomationAiConfig(client),
        ]);
        if (!active) return;
        setRequests(nextRequests);
        setChannels(nextChannels);
        setAutomationStatus(nextAutomationStatus);
        setAutomationSources(nextAutomationSources);
        setAutomationCandidates(nextAutomationCandidates);
        setAutomationAiConfig(nextAiConfig);
        setAiEnabled(nextAiConfig.enabled);
        setAiModel(nextAiConfig.model);
        setAiMaxCandidates(nextAiConfig.maxCandidatesPerRun);
        const firstActive = nextRequests.find((request) => request.status === "processing" || request.status === "pending");
        if (firstActive) setSelectedId(firstActive.id);
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : "更新キューを読み込めませんでした。");
      }
    };
    void boot();
    return () => { active = false; };
  }, []);

  const saveAutomationAiConfig = async () => {
    setBusy(true);
    setMessage("");
    try {
      await adminSetKnowledgeAutomationAiConfig(getSupabaseClient(), {
        enabled: aiEnabled,
        provider: "openai",
        model: aiModel,
        maxCandidatesPerRun: aiMaxCandidates,
        apiKey: aiApiKey,
      });
      setAiApiKey("");
      await reload();
      setMessage(aiEnabled
        ? "AI候補JSON自動生成を有効化しました。APIキーはVaultへ保存され、画面には再表示しません。"
        : "AI候補JSON自動生成を無効化しました。公式ソース監視は継続します。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI自動解析設定を保存できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const retryAutomationAi = async (candidate: KnowledgeAutomationCandidate) => {
    setBusy(true);
    setMessage("");
    try {
      await adminRetryKnowledgeAutomationCandidateAi(getSupabaseClient(), candidate.id);
      await reload();
      setMessage("AI解析を再試行待ちへ戻しました。次回の自動調査で再解析されます。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI解析を再試行状態へ戻せませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const prepareAutomationCandidate = async (candidate: KnowledgeAutomationCandidate) => {
    const bundle = buildKnowledgeAutomationCandidateBundle(candidate);
    if (!bundle) {
      setMessage("この候補にはFresh差分へ取り込めるAI提案JSONがありません。");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const client = getSupabaseClient();
      const requestId = await adminRequestKnowledgeRefresh(client, "fresh");
      setSelectedId(requestId);
      setPreparedAutomationCandidateId(candidate.id);
      setBundleText(JSON.stringify(bundle, null, 2));
      setDiffPreview(null);
      await reload();
      setSelectedId(requestId);
      setPreparedAutomationCandidateId(candidate.id);
      setMessage("AI提案をFresh差分レビューへ取り込みました。候補状態もまだ確定していません。「変更点を確認」後、公開に成功した場合だけ処理済みにします。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI提案をFresh差分レビューへ取り込めませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const runAutomation = async () => {
    setBusy(true);
    setMessage("");
    try {
      const runId = await adminRequestKnowledgeAutomationRun(getSupabaseClient());
      await reload();
      setMessage(`公式ソース自動調査 #${runId} を開始しました。候補は自動公開されません。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "公式ソース自動調査を開始できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const copyAutomationPrompt = async (candidate: KnowledgeAutomationCandidate) => {
    try {
      await navigator.clipboard.writeText(candidate.researchPrompt);
      setMessage("候補専用の検証プロンプトをコピーしました。Web検索できるAIで公式ソースを再確認してください。");
    } catch {
      setMessage("クリップボードへコピーできませんでした。");
    }
  };

  const reviewAutomationCandidate = async (
    candidate: KnowledgeAutomationCandidate,
    decision: "approved" | "rejected",
  ) => {
    setBusy(true);
    setMessage("");
    try {
      await adminReviewKnowledgeAutomationCandidate(
        getSupabaseClient(),
        candidate.id,
        decision,
        decision === "approved"
          ? "管理者が調査継続候補として承認。正式公開は別途Quality Gateと差分確認が必要。"
          : "管理者が自動調査候補を却下。",
      );
      await reload();
      setMessage(decision === "approved"
        ? "候補を承認しました。まだ正式Knowledgeには公開されていません。"
        : "候補を却下しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "候補のレビュー結果を保存できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const enqueue = async (channel: "fresh" | "stable") => {
    setBusy(true);
    setMessage("");
    setDiffPreview(null);
    try {
      const id = await adminRequestKnowledgeRefresh(getSupabaseClient(), channel);
      setSelectedId(id);
      setPreparedAutomationCandidateId(null);
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

  const previewDiff = async () => {
    if (!bundleText.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const bundle = parseKnowledgeRefreshBundle(bundleText);
      const diff = await adminPreviewKnowledgeRefreshBundleDiff(getSupabaseClient(), bundle);
      setDiffPreview(diff);
      setMessage("現在の正式データとの差分を確認しました。内容を確認してから公開してください。");
    } catch (error) {
      setDiffPreview(null);
      setMessage(error instanceof Error ? error.message : "変更点を比較できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!selected || !diffPreview || (selected.status !== "pending" && selected.status !== "processing")) return;

    const changedCount =
      diffPreview.knowledge.added + diffPreview.knowledge.updated +
      diffPreview.prompt.added + diffPreview.prompt.updated;
    const channelLabel = selected.channel === "fresh" ? "Fresh（先行確認版）" : "Stable（標準版）";

    if (!window.confirm(
      `${channelLabel}へ公開しますか？\n追加・変更される項目は合計 ${changedCount}件です。\n差分内容を確認済みの場合のみ続行してください。`,
    )) return;

    setBusy(true);
    setMessage("");
    try {
      const bundle = parseKnowledgeRefreshBundle(bundleText);
      const client = getSupabaseClient();
      const result = await adminPublishKnowledgeRefreshBundle(client, selected.id, bundle);
      if (preparedAutomationCandidateId !== null) {
        await adminReviewKnowledgeAutomationCandidate(
          client,
          preparedAutomationCandidateId,
          "converted",
          "Fresh差分確認と管理者公開が完了したため、AI自動提案候補を処理済みに変更。",
        );
      }
      setPreparedAutomationCandidateId(null);
      setBundleText("");
      setDiffPreview(null);
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
        <button type="button" disabled={busy} onClick={() => void reload()}>再読込</button>
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

      <section className="knowledge-automation-panel" aria-label="公式ソース自動監視">
        <div className="knowledge-automation-head">
          <div>
            <p className="eyebrow">OFFICIAL SOURCE MONITOR</p>
            <h3>公式ソース自動監視</h3>
            <p>登録済みの公式・一次情報を自動巡回し、本文ハッシュ・HTTP状態・Changelog更新から「新規 / 更新 / 再確認 / 廃止」の候補だけを作ります。</p>
          </div>
          <button type="button" disabled={busy || automationStatus?.enabled === false} onClick={() => void runAutomation()}>
            今すぐ公式ソースを調査
          </button>
        </div>

        <div className="knowledge-automation-guard">
          <strong>自動調査 ≠ 自動公開</strong>
          <span>候補承認は「詳しく確認する価値がある」という状態変更だけです。正式反映には従来のQuality Gate・差分確認・Fresh / Stable公開操作が必要です。</span>
        </div>

        <div className="knowledge-ai-config">
          <div className="knowledge-ai-config-head">
            <div>
              <strong>AI候補JSON自動生成</strong>
              <p>公式ソースの取得・差分検知後にAIが候補JSONを作成します。AIが候補を作っても自動公開はされません。</p>
            </div>
            <span className={automationAiConfig?.apiKeyConfigured ? "configured" : "missing"}>
              APIキー {automationAiConfig?.apiKeyConfigured ? "Vault設定済み" : "未設定"}
            </span>
          </div>
          <div className="knowledge-ai-config-grid">
            <label className="knowledge-ai-toggle">
              <input
                type="checkbox"
                checked={aiEnabled}
                onChange={(event) => setAiEnabled(event.target.checked)}
              />
              <span>AI自動解析を有効にする</span>
            </label>
            <SelectWithCustom
              label="モデル"
              value={aiModel}
              onChange={setAiModel}
              options={[
                { value: "gpt-6-luna", label: "GPT-6 Luna（低コスト・大量処理向け）" },
                { value: "gpt-5.6-luna", label: "GPT-5.6 Luna（低コスト）" },
                { value: "gpt-5.6-terra", label: "GPT-5.6 Terra（バランス）" },
                { value: "gpt-5.6", label: "GPT-5.6 Sol（高精度）" },
              ]}
              description="候補作成用AIです。新しいモデルIDを使う場合は「その他・自由入力」を選べます。"
              customPlaceholder="OpenAI APIのモデルIDを入力"
            />
            <PresetNumberSelectWithCustom
              label="1回の最大解析候補数"
              value={aiMaxCandidates}
              onChange={setAiMaxCandidates}
              presets={[1, 3, 6, 10, 15, 20]}
              min={1}
              max={20}
              suffix="件"
              description="API費用を抑えたい場合は1〜3件から始める設定がおすすめです。"
            />
            <label>
              <span>OpenAI APIキー（変更時のみ入力）</span>
              <input
                type="password"
                value={aiApiKey}
                onChange={(event) => setAiApiKey(event.target.value)}
                placeholder={automationAiConfig?.apiKeyConfigured ? "設定済み・変更する場合だけ入力" : "APIキーを入力"}
                autoComplete="new-password"
              />
            </label>
          </div>
          <div className="knowledge-ai-config-actions">
            <small>APIキーはSupabase Vaultへ保存し、この画面では再表示しません。AI解析が無効でも公式ソース監視は動き続けます。</small>
            <button type="button" disabled={busy || !aiModel.trim()} onClick={() => void saveAutomationAiConfig()}>
              AI自動解析設定を保存
            </button>
          </div>
        </div>

        <dl className="knowledge-automation-metrics">
          <div><dt>監視中</dt><dd>{automationStatus?.trackedSources ?? "-"} URL</dd></div>
          <div><dt>次回対象</dt><dd>{automationStatus?.dueSources ?? "-"} URL</dd></div>
          <div><dt>未確認候補</dt><dd>{automationStatus?.pendingCandidates ?? "-"} 件</dd></div>
          <div><dt>承認済み候補</dt><dd>{automationStatus?.approvedCandidates ?? "-"} 件</dd></div>
          <div><dt>最終成功</dt><dd>{formatDate(automationStatus?.lastSuccessAt ?? null)}</dd></div>
          <div>
            <dt>直近実行</dt>
            <dd>
              {automationStatus?.latestRunId
                ? `#${automationStatus.latestRunId} / ${automationStatus.latestRunSourcesChecked} URL / 候補 ${automationStatus.latestRunCandidatesCreated}`
                : "-"}
            </dd>
          </div>
        </dl>

        <section className="knowledge-source-health" aria-label="監視ソース健全性">
          <div className="knowledge-source-health-head">
            <div>
              <strong>監視ソース健全性</strong>
              <p>どの公式URLを監視しているか、取得状態・失敗回数・次回確認時刻を管理者画面だけで確認できます。</p>
            </div>
            <span className={failingAutomationSources.length > 0 ? "warning" : "healthy"}>
              {failingAutomationSources.length > 0 ? `要確認 ${failingAutomationSources.length} URL` : "正常"}
            </span>
          </div>

          <div className="knowledge-source-health-stats">
            <article><span>有効URL</span><strong>{enabledAutomationSources.length}</strong></article>
            <article className={failingAutomationSources.length > 0 ? "warning" : ""}><span>取得失敗</span><strong>{failingAutomationSources.length}</strong></article>
            <article><span>次回対象</span><strong>{automationStatus?.dueSources ?? "-"}</strong></article>
          </div>

          <div className="knowledge-source-coverage">
            <div>
              <strong>副業Knowledgeカバレッジ</strong>
              <small>「all」指定の公式ソースは各副業にも共通根拠として数えます。</small>
            </div>
            <div className="knowledge-source-coverage-grid">
              {automationCoverage.map((item) => (
                <article key={item.task} className={item.count === 0 ? "missing" : ""}>
                  <span>{item.label}</span>
                  <strong>{item.count} URL</strong>
                </article>
              ))}
            </div>
          </div>

          <details className="knowledge-source-list" open={failingAutomationSources.length > 0}>
            <summary>監視URL一覧（{automationSources.length}件）</summary>
            <div>
              {automationSources.map((source) => {
                const isFailing = source.consecutiveFailures > 0
                  || (source.lastHttpStatus !== null && source.lastHttpStatus >= 400);
                return (
                  <article key={source.id} className={isFailing ? "warning" : ""}>
                    <header>
                      <span className={isFailing ? "warning" : "healthy"}>{isFailing ? "要確認" : "正常"}</span>
                      <strong>{sourceHost(source.sourceUrl)}</strong>
                      <small>{sourceKindLabel(source.sourceKind)}</small>
                    </header>
                    <a href={source.sourceUrl} target="_blank" rel="noreferrer">{source.sourceUrl}</a>
                    <dl>
                      <div><dt>HTTP</dt><dd>{source.lastHttpStatus ?? "未確認"}</dd></div>
                      <div><dt>連続失敗</dt><dd>{source.consecutiveFailures}回</dd></div>
                      <div><dt>最終確認</dt><dd>{formatDate(source.lastCheckedAt)}</dd></div>
                      <div><dt>次回確認</dt><dd>{formatDate(source.nextCheckAt)}</dd></div>
                    </dl>
                    {source.tasks.length > 0 && (
                      <div className="knowledge-source-tasks">
                        {source.tasks.map((task) => <span key={task}>{task}</span>)}
                      </div>
                    )}
                    {source.lastError && <p className="knowledge-source-error">{source.lastError}</p>}
                  </article>
                );
              })}
            </div>
          </details>
        </section>

        {automationStatus?.lastError && (
          <p className="knowledge-automation-error">直近エラー: {automationStatus.lastError}</p>
        )}

        {automationCandidates.length === 0 ? (
          <p className="knowledge-empty">現在、管理者確認が必要な自動調査候補はありません。</p>
        ) : (
          <div className="knowledge-automation-candidates">
            {automationCandidates.map((candidate) => (
              <article key={candidate.id}>
                <header>
                  <span className={"automation-action " + candidate.candidateAction}>
                    {automationActionLabel(candidate.candidateAction)}
                  </span>
                  <strong>{candidate.sourceTitle || candidate.existingItemKey || candidate.sourceUrl}</strong>
                  <small>信頼度 {candidate.confidence}% / 検出 {formatDate(candidate.detectedAt)}</small>
                </header>

                <p>{candidate.reason}</p>
                {candidate.matchedTasks.length > 0 && (
                  <div className="knowledge-automation-tasks">
                    {candidate.matchedTasks.map((task) => <span key={task}>{task}</span>)}
                  </div>
                )}
                {candidate.existingItemKey && (
                  <small className="knowledge-automation-existing">
                    現行: {candidate.existingItemType ?? "item"} / {candidate.existingItemKey}
                  </small>
                )}
                {candidate.sourceExcerpt && (
                  <details>
                    <summary>自動取得した抜粋を見る</summary>
                    <p>{candidate.sourceExcerpt}</p>
                  </details>
                )}

                <div className={"knowledge-ai-analysis " + candidate.analysisStatus}>
                  <div>
                    <strong>AI解析: {candidate.analysisStatus === "completed" ? "完了" : candidate.analysisStatus === "failed" ? "失敗" : "待機中"}</strong>
                    {candidate.analysisDecision && <span>判定: {candidate.analysisDecision}</span>}
                    {candidate.analysisModel && <span>{candidate.analysisProvider} / {candidate.analysisModel}</span>}
                  </div>
                  {candidate.analysisReason && <p>{candidate.analysisReason}</p>}
                  {candidate.analysisError && <p className="knowledge-automation-error">{candidate.analysisError}</p>}
                  {candidate.verifiedSourceUrls.length > 0 && (
                    <div className="knowledge-ai-sources">
                      {candidate.verifiedSourceUrls.map((url) => (
                        <a key={url} href={url} target="_blank" rel="noreferrer">確認済み根拠</a>
                      ))}
                    </div>
                  )}
                  {candidate.proposedPayload && (
                    <details>
                      <summary>AI提案JSONを見る</summary>
                      <pre>{JSON.stringify(candidate.proposedPayload, null, 2)}</pre>
                    </details>
                  )}
                </div>

                <div className="knowledge-automation-actions">
                  <a href={candidate.sourceUrl} target="_blank" rel="noreferrer">公式ソースを開く</a>
                  <button type="button" disabled={busy} onClick={() => void copyAutomationPrompt(candidate)}>
                    検証プロンプトをコピー
                  </button>
                  <button type="button" disabled={busy} onClick={() => launchAiApp("chatgpt")}>
                    ChatGPTを開く
                  </button>
                  {candidate.analysisStatus === "failed" && (
                    <button type="button" disabled={busy} onClick={() => void retryAutomationAi(candidate)}>
                      AI解析を再試行
                    </button>
                  )}
                  {buildKnowledgeAutomationCandidateBundle(candidate) && (
                    <button type="button" className="prepare" disabled={busy} onClick={() => void prepareAutomationCandidate(candidate)}>
                      Fresh差分へ取り込む
                    </button>
                  )}
                  <button
                    type="button"
                    className="approve"
                    disabled={busy}
                    onClick={() => void reviewAutomationCandidate(candidate, "approved")}
                  >
                    候補承認（公開しない）
                  </button>
                  <button
                    type="button"
                    className="reject"
                    disabled={busy}
                    onClick={() => void reviewAutomationCandidate(candidate, "rejected")}
                  >
                    却下
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
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
                setPreparedAutomationCandidateId(null);
                setDiffPreview(null);
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
                <button type="button" disabled={busy} onClick={() => launchAiApp("chatgpt")}>ChatGPTを開く</button>
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
            }}
            placeholder='{"summary":"...","knowledge_rules":[],"prompt_optimizations":[]}'
            spellCheck={false}
          />
          <div className="knowledge-refresh-publish-actions">
            <button type="button" disabled={busy || !bundleText.trim()} onClick={() => void previewDiff()}>
              変更点を確認
            </button>
            <button type="button" className="approve" disabled={busy || !diffPreview} onClick={() => void publish()}>
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
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
