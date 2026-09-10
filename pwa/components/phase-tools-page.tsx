"use client";

import { useEffect, useState } from "react";

import { loadAccessState, type AccessState } from "@/lib/phase6-access";
import { getSupabaseClient } from "@/lib/supabase";

type State = AccessState | { kind: "loading" } | { kind: "unavailable" };

type ToolCard = {
  href: string;
  phase: string;
  title: string;
  description: string;
};

const publicTools: ToolCard[] = [
  {
    href: "/sidejob",
    phase: "Phase 15",
    title: "AI副業プランナー",
    description: "作業時間・得意分野・予算から、副業候補と30日プラン用プロンプトを作成。",
  },
];

const memberTools: ToolCard[] = [
  {
    href: "/create",
    phase: "Phase 11–13",
    title: "記事を作る",
    description: "7ステップの記事制作、ジャンル専用プロンプト、画像計画をWorkspaceへ保存。",
  },
  {
    href: "/images",
    phase: "Phase 13",
    title: "画像生成計画",
    description: "記事条件からアイキャッチ・挿絵用の統一画像プロンプトを作成。",
  },
  {
    href: "/sns",
    phase: "Phase 14",
    title: "SNS投稿を作る",
    description: "記事ライブラリからX・Instagram・Threads向け投稿プロンプトへ変換。",
  },
  {
    href: "/publish",
    phase: "Phase 16",
    title: "公開管理",
    description: "公開予定・公開済みURL・公開日時を共通記事DBへ記録。",
  },
  {
    href: "/analytics",
    phase: "Phase 17",
    title: "コンテンツ分析",
    description: "記事ストック、掲載先、状態、最近更新した記事を内部データから集計。",
  },
];

export function PhaseToolsPage() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        const client = getSupabaseClient();
        const value = await loadAccessState(client);
        if (active) setState(value);
      } catch {
        if (active) setState({ kind: "unavailable" });
      }
    };
    void boot();
    return () => { active = false; };
  }, []);

  const ready = state.kind === "ready";
  const admin = state.kind === "ready" && state.profile.role === "admin";
  const invite = state.kind === "pending" || state.kind === "entitlement_denied";
  const cards = ready ? [...memberTools, ...publicTools] : publicTools;

  return (
    <main className="creator-page">
      <header className="creator-head">
        <div>
          <p className="eyebrow">AI ARTICLE STUDIO</p>
          <h1>機能一覧</h1>
          <p>Phase 8の共通基盤の上に、記事制作・画像・SNS・公開・分析を追加しています。</p>
        </div>
        <a className="route-back" href="/">← ホーム</a>
      </header>

      {state.kind === "loading" && <div className="route-notice">利用可能な機能を確認しています…</div>}
      {state.kind === "unavailable" && <div className="route-notice error">アカウント状態を確認できませんでした。副業プランナーは引き続き利用できます。</div>}
      {state.kind === "signed_out" && <div className="route-notice">ログインすると記事・画像・SNS・公開・分析機能が表示されます。</div>}
      {(state.kind === "suspended" || state.kind === "disabled") && <div className="route-notice error">現在のアカウント状態ではクラウド機能を利用できません。</div>}
      {invite && <div className="route-notice">PWA機能を使うには利用権が必要です。<a className="route-inline-link" href="/invite">招待コードを登録</a></div>}

      <section className="tool-grid">
        {cards.map((tool) => (
          <a key={tool.href} className="tool-card" href={tool.href}>
            <span>{tool.phase}</span>
            <h2>{tool.title}</h2>
            <p>{tool.description}</p>
            <strong>開く →</strong>
          </a>
        ))}
        {invite && (
          <a className="tool-card" href="/invite">
            <span>Phase 9</span><h2>PWA招待</h2><p>購入・招待コードをAAS-PWA-BETA利用権へ登録。</p><strong>開く →</strong>
          </a>
        )}
        {admin && (
          <a className="tool-card" href="/admin">
            <span>Phase 10</span><h2>管理ダッシュボード</h2><p>ユーザー承認、Windows/PWA利用権、PWA招待コードを共通管理。</p><strong>開く →</strong>
          </a>
        )}
      </section>
    </main>
  );
}
