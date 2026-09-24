"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useSharedAccessState } from "@/components/access-state-provider";
import { AdminPresetNumberField } from "@/components/admin-form-controls";
import { KnowledgeRefreshPanel } from "@/components/knowledge-refresh-panel";

import {
  adminListKnowledgeCandidates,
  adminReviewKnowledgeCandidate,
  type KnowledgeCandidate,
} from "@/lib/knowledge-catalog";
import {
  adminGetKnowledgeProductionHealth,
  type KnowledgeProductionHealth,
} from "@/lib/knowledge-auto-update";
import {
  KNOWLEDGE_TASKS,
  KNOWLEDGE_TASK_LABELS,
  type KnowledgeTask,
} from "@/lib/knowledge-engine";

type Filter = "all" | "pending" | "approved" | "rejected";
type CatalogRow = {
  key: string;
  kind: string;
  label: string;
  parent_label: string | null;
  status: string;
  priority: number;
  release_channel: string;
  catalog_version: number;
  source_urls: string[];
  source_summary: string | null;
  source_checked_at: string | null;
  stable_available_at: string;
  tasks: KnowledgeTask[];
  updated_at: string;
};

type Editor = {
  canonicalLabel: string;
  guidance: string;
  deliverables: string;
  cautions: string;
  tasks: KnowledgeTask[];
  priority: number;
  notes: string;
};

function lines(value: string): string[] {
  return value.split("\n").map((item) => item.trim().replace(/^[-・]\s*/, "")).filter(Boolean).slice(0, 40);
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("ja-JP");
}

const KNOWLEDGE_STANDARD_DEPTH = 3;
const KNOWLEDGE_DEEP_DEPTH = 5;
const KNOWLEDGE_SOURCE_STALE_DAYS = 90;

function isSourceStale(value: string | null): boolean {
  if (!value) return true;
  const checkedAt = new Date(value).getTime();
  if (!Number.isFinite(checkedAt)) return true;
  return Date.now() - checkedAt > KNOWLEDGE_SOURCE_STALE_DAYS * 24 * 60 * 60 * 1000;
}

export function AdminKnowledgePage() {
  const { state, client } = useSharedAccessState();
  const [candidates, setCandidates] = useState<KnowledgeCandidate[]>([]);
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [health, setHealth] = useState<KnowledgeProductionHealth | null>(null);
  const [filter, setFilter] = useState<Filter>("pending");
  const [selected, setSelected] = useState<KnowledgeCandidate | null>(null);
  const [editor, setEditor] = useState<Editor>({ canonicalLabel: "", guidance: "", deliverables: "", cautions: "", tasks: [...KNOWLEDGE_TASKS], priority: 70, notes: "" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    if (!client) throw new Error("AASへ接続できませんでした。");
    const [nextCandidates, catalogResult, nextHealth] = await Promise.all([
      adminListKnowledgeCandidates(client, null),
      client.from("knowledge_catalog")
        .select("key,kind,label,parent_label,status,priority,release_channel,catalog_version,source_urls,source_summary,source_checked_at,stable_available_at,tasks,updated_at")
        .order("updated_at", { ascending: false })
        .limit(300),
      adminGetKnowledgeProductionHealth(client),
    ]);
    if (catalogResult.error) throw new Error("正式ナレッジ一覧を取得できませんでした。");
    setCandidates(nextCandidates);
    setCatalog((catalogResult.data ?? []) as CatalogRow[]);
    setHealth(nextHealth);
  };

  const isAdmin = state.kind === "ready" && state.profile.role === "admin" && state.profile.status === "active";

  useEffect(() => {
    if (!isAdmin || !client) return;
    let active = true;
    const boot = async () => {
      try {
        const [nextCandidates, catalogResult, nextHealth] = await Promise.all([
          adminListKnowledgeCandidates(client, null),
          client.from("knowledge_catalog")
            .select("key,kind,label,parent_label,status,priority,release_channel,catalog_version,source_urls,source_summary,source_checked_at,stable_available_at,tasks,updated_at")
            .order("updated_at", { ascending: false })
            .limit(300),
          adminGetKnowledgeProductionHealth(client),
        ]);
        if (!active) return;
        if (catalogResult.error) throw new Error("正式ナレッジ一覧を取得できませんでした。");
        setCandidates(nextCandidates);
        setCatalog((catalogResult.data ?? []) as CatalogRow[]);
        setHealth(nextHealth);
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : "ナレッジ管理を初期化できませんでした。");
      }
    };
    void boot();
    return () => { active = false; };
  }, [client, isAdmin]);
  const visible = useMemo(() => candidates.filter((candidate) => filter === "all" || candidate.decisionStatus === filter), [candidates, filter]);
  const stats = useMemo(() => ({
    pending: candidates.filter((item) => item.decisionStatus === "pending").length,
    approved: candidates.filter((item) => item.decisionStatus === "approved").length,
    rejected: candidates.filter((item) => item.decisionStatus === "rejected").length,
    activeCatalog: catalog.filter((item) => item.status === "active").length,
    activePrompt: health?.activePromptOptimizations ?? 0,
  }), [candidates, catalog, health]);

  const sidejobTasks = useMemo(
    () => KNOWLEDGE_TASKS.filter((task): task is KnowledgeTask => task.startsWith("sidejob_")),
    [],
  );
  const sidejobCoverage = useMemo(() => sidejobTasks.map((task) => {
    const matching = catalog.filter((item) => item.status === "active" && item.tasks.includes(task));
    const latestCheckedAt = matching
      .map((item) => item.source_checked_at)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
    const count = matching.length;
    const depth = count >= KNOWLEDGE_DEEP_DEPTH
      ? "deep"
      : count >= KNOWLEDGE_STANDARD_DEPTH
        ? "standard"
        : count > 0
          ? "basic"
          : "missing";
    return {
      task,
      label: KNOWLEDGE_TASK_LABELS[task],
      count,
      latestCheckedAt,
      depth,
      stale: isSourceStale(latestCheckedAt),
    };
  }).sort((a, b) => a.count - b.count || a.label.localeCompare(b.label, "ja")), [catalog, sidejobTasks]);
  const basicSidejobCount = sidejobCoverage.filter((item) => item.count > 0).length;
  const standardSidejobCount = sidejobCoverage.filter((item) => item.count >= KNOWLEDGE_STANDARD_DEPTH).length;
  const deepSidejobCount = sidejobCoverage.filter((item) => item.count >= KNOWLEDGE_DEEP_DEPTH).length;
  const staleSidejobCount = sidejobCoverage.filter((item) => item.stale).length;

  const open = (candidate: KnowledgeCandidate) => {
    setSelected(candidate);
    setEditor({
      canonicalLabel: candidate.canonicalLabel || candidate.value,
      guidance: "",
      deliverables: "",
      cautions: "",
      tasks: [...KNOWLEDGE_TASKS],
      priority: 70,
      notes: candidate.notes,
    });
    setMessage("");
  };

  const review = async (decision: "approved" | "rejected" | "pending") => {
    if (!selected || !client) return;
    if (decision === "approved" && !window.confirm(`「${editor.canonicalLabel || selected.value}」を正式ナレッジとして承認しますか？`)) return;
    if (decision === "rejected" && !window.confirm(`「${selected.value}」を却下しますか？`)) return;
    setBusy(true);
    setMessage("");
    try {
      await adminReviewKnowledgeCandidate(client, {
        kind: selected.kind,
        parentValue: selected.parentValue,
        value: selected.value,
        decision,
        canonicalLabel: editor.canonicalLabel,
        guidance: lines(editor.guidance),
        deliverables: lines(editor.deliverables),
        cautions: lines(editor.cautions),
        tasks: editor.tasks,
        priority: editor.priority,
        notes: editor.notes,
      });
      await reload();
      setMessage(decision === "approved" ? "正式ナレッジとして承認しました。" : decision === "rejected" ? "候補を却下しました。" : "候補を保留へ戻しました。");
      setSelected(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ナレッジ審査を保存できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  if (state.kind === "loading") return null;

  if (!isAdmin) {
    return (
      <main className="standalone-page"><section className="standalone-card">
        <p className="eyebrow">KNOWLEDGE CONTROL</p><h1>ナレッジ管理</h1>
        {state.kind === "signed_out" && <p className="route-notice">先にログインしてください。</p>}
        {state.kind !== "signed_out" && <p className="route-notice error">この機能はactive管理者のみ利用できます。</p>}
        <Link className="route-back" href="/">← ホームへ戻る</Link>
      </section></main>
    );
  }

  return (
    <main className="knowledge-admin-page">
      <header className="knowledge-admin-head">
        <div><p className="eyebrow">KNOWLEDGE CONTROL</p><h1>AASナレッジ管理</h1><p>ユーザーの「その他」入力を匿名集計で確認し、必要な候補だけ正式ナレッジへ昇格します。</p></div>
        <nav><Link href="/admin">管理ダッシュボード</Link><Link href="/tools">機能一覧</Link></nav>
      </header>

      <div className="knowledge-privacy"><strong>個人情報を見せない集計方式</strong><span>管理者画面には候補語、利用回数、利用ユーザー数だけを表示します。ユーザーID・記事本文・AI回答全文は候補審査に表示しません。</span></div>
      {message && <div className="route-notice knowledge-message">{message}</div>}

      <section className="knowledge-stat-grid">
        <article><span>承認待ち</span><strong>{stats.pending}</strong></article>
        <article><span>クラウドKnowledge</span><strong>{stats.activeCatalog}</strong></article>
        <article><span>Prompt最適化</span><strong>{stats.activePrompt}</strong></article>
        <article><span>Fresh / Stable</span><strong>v{health?.freshVersion ?? "-"} / v{health?.stableVersion ?? "-"}</strong></article>
      </section>

      <section className="knowledge-admin-panel knowledge-coverage-panel">
        <div className="knowledge-panel-head">
          <div>
            <p className="eyebrow">SIDE-HUSTLE DEPTH</p>
            <h2>副業Knowledge深度</h2>
            <p>基礎=1件以上 / 標準=3件以上 / 深掘り=5件以上。根拠確認から{KNOWLEDGE_SOURCE_STALE_DAYS}日を超える分野は再確認対象です。</p>
          </div>
          <strong className={standardSidejobCount === sidejobCoverage.length ? "complete" : "incomplete"}>
            標準 {standardSidejobCount}/{sidejobCoverage.length}
          </strong>
        </div>
        <div className="knowledge-coverage-summary">
          <span>基礎 {basicSidejobCount}/{sidejobCoverage.length}</span>
          <span>標準 {standardSidejobCount}/{sidejobCoverage.length}</span>
          <span>深掘り {deepSidejobCount}/{sidejobCoverage.length}</span>
          <span className={staleSidejobCount > 0 ? "warning" : ""}>再確認 {staleSidejobCount}</span>
        </div>
        <div className="knowledge-coverage-grid">
          {sidejobCoverage.map((item) => (
            <article key={item.task} className={`${item.depth}${item.stale ? " stale" : ""}`}>
              <span>
                {item.depth === "deep" ? "◆ 深掘り" : item.depth === "standard" ? "✓ 標準達成" : item.depth === "basic" ? "△ 基礎のみ" : "! Knowledge不足"}
              </span>
              <strong>{item.label}</strong>
              <small>{item.count}件 · 最終根拠確認 {formatDate(item.latestCheckedAt)}</small>
              {item.stale && <small className="stale-note">根拠の再確認が必要です</small>}
            </article>
          ))}
        </div>
      </section>

      <KnowledgeRefreshPanel />

      <section className="knowledge-admin-panel">
        <div className="knowledge-panel-head"><div><p className="eyebrow">CANDIDATE REVIEW</p><h2>自由入力から見つかった候補</h2></div><button type="button" onClick={() => void reload()}>再読込</button></div>
        <div className="knowledge-filter-row">
          {(["pending", "approved", "rejected", "all"] as Filter[]).map((value) => <button key={value} type="button" className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "pending" ? "承認待ち" : value === "approved" ? "承認済み" : value === "rejected" ? "却下" : "すべて"}</button>)}
        </div>
        {visible.length === 0 ? <p className="knowledge-empty">該当する候補はありません。</p> : <div className="knowledge-candidate-list">
          {visible.map((candidate) => <button key={`${candidate.kind}:${candidate.parentValue}:${candidate.value}`} type="button" onClick={() => open(candidate)} className={selected?.kind === candidate.kind && selected.value === candidate.value && selected.parentValue === candidate.parentValue ? "active" : ""}>
            <span>{candidate.kind === "genre" ? "ジャンル" : "サブジャンル"}{candidate.parentValue ? ` / ${candidate.parentValue}` : ""}</span>
            <strong>{candidate.value}</strong>
            <small>{candidate.totalUses}回使用 / {candidate.distinctUsers}ユーザー / 最終 {formatDate(candidate.lastSeenAt)}</small>
          </button>)}
        </div>}
      </section>

      {selected && <section className="knowledge-admin-panel knowledge-editor">
        <div className="knowledge-panel-head"><div><p className="eyebrow">REVIEW</p><h2>候補を正式Knowledgeへ変換</h2></div><button type="button" onClick={() => setSelected(null)}>閉じる</button></div>
        <dl className="knowledge-source-meta"><div><dt>入力候補</dt><dd>{selected.value}</dd></div><div><dt>親ジャンル</dt><dd>{selected.parentValue || "なし"}</dd></div><div><dt>利用</dt><dd>{selected.totalUses}回 / {selected.distinctUsers}ユーザー</dd></div></dl>
        <div className="knowledge-editor-grid">
          <label><span>正式名称</span><input value={editor.canonicalLabel} onChange={(event) => setEditor((current) => ({ ...current, canonicalLabel: event.target.value.slice(0, 120) }))} /></label>
          <AdminPresetNumberField
            label="優先度"
            value={editor.priority}
            presets={[10, 25, 40, 50, 60, 70, 80, 90, 100]}
            min={0}
            max={100}
            description="通常は70。重要度が高いほどPrompt Compilerで優先されます。"
            onChange={(priority) => setEditor((current) => ({ ...current, priority }))}
          />
          <label className="full"><span>制作ルール（1行1項目）</span><textarea rows={5} value={editor.guidance} onChange={(event) => setEditor((current) => ({ ...current, guidance: event.target.value }))} placeholder="例: 初心者が実行できる順番で説明する" /></label>
          <label className="full"><span>価値が出やすい成果物（1行1項目）</span><textarea rows={4} value={editor.deliverables} onChange={(event) => setEditor((current) => ({ ...current, deliverables: event.target.value }))} placeholder="例: チェックリスト" /></label>
          <label className="full"><span>注意・禁止（1行1項目）</span><textarea rows={4} value={editor.cautions} onChange={(event) => setEditor((current) => ({ ...current, cautions: event.target.value }))} placeholder="例: 未確認の効果を断定しない" /></label>
          <fieldset className="full"><legend>適用する機能</legend><div className="knowledge-task-grid">{KNOWLEDGE_TASKS.map((key) => <label key={key}><input type="checkbox" checked={editor.tasks.includes(key)} onChange={(event) => setEditor((current) => ({ ...current, tasks: event.target.checked ? [...current.tasks, key] : current.tasks.filter((item) => item !== key) }))} />{KNOWLEDGE_TASK_LABELS[key]}</label>)}</div></fieldset>
          <label className="full"><span>管理メモ</span><textarea rows={3} value={editor.notes} onChange={(event) => setEditor((current) => ({ ...current, notes: event.target.value.slice(0, 1000) }))} /></label>
        </div>
        <p className="knowledge-review-note">承認後は同じ候補名が記事・タイトル・画像・SNSなどで選ばれた際、ここで設定したルールが共通Prompt Compilerへ追加されます。ルール未入力でも一般Knowledgeは維持されます。</p>
        <div className="knowledge-review-actions"><button type="button" className="approve" disabled={busy || !editor.canonicalLabel.trim()} onClick={() => void review("approved")}>正式ナレッジへ承認</button><button type="button" disabled={busy} onClick={() => void review("pending")}>保留へ戻す</button><button type="button" className="reject" disabled={busy} onClick={() => void review("rejected")}>却下</button></div>
      </section>}

      <section className="knowledge-admin-panel">
        <div className="knowledge-panel-head"><div><p className="eyebrow">CATALOG</p><h2>クラウドKnowledge一覧</h2></div></div>
        {catalog.length === 0 ? <p className="knowledge-empty">まだ管理者承認済みの追加Knowledgeはありません。基本Knowledgeはアプリ内に内蔵されています。</p> : <div className="knowledge-catalog-list">{catalog.map((item) => <article key={item.key}>
          <span>{item.kind}{item.parent_label ? ` / ${item.parent_label}` : ""} · {item.release_channel === "fresh_first" ? "Fresh先行" : "Fresh/Stable"}</span>
          <strong>{item.label}</strong>
          <small>{item.status} / priority {item.priority} / v{item.catalog_version} / 根拠確認 {formatDate(item.source_checked_at)}</small>
          {item.source_summary && <p>{item.source_summary}</p>}
          {item.source_urls.length > 0 && <div className="knowledge-source-links">{item.source_urls.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer">根拠を開く</a>)}</div>}
        </article>)}</div>}
      </section>
    </main>
  );
}
