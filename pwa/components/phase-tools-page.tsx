"use client";

import { useEffect, useState } from "react";

import { OPENAI_LINKS } from "@/lib/openai-links";
import { loadAccessState, type AccessState } from "@/lib/phase6-access";
import { getSupabaseClient } from "@/lib/supabase";

type State = AccessState | { kind: "loading" } | { kind: "unavailable" };

type ToolCard = { href: string; category: string; title: string; description: string };

const memberTools: ToolCard[] = [
  { href: "/create", category: "記事制作", title: "記事を作る", description: "7ステップで条件設定から本文・画像計画・保存まで進められます。" },
  { href: "/images", category: "画像", title: "画像生成計画", description: "記事条件からアイキャッチ・挿絵用の統一画像プロンプトを作成します。" },
  { href: "/sns", category: "SNS", title: "SNS投稿を作る", description: "記事ライブラリからX・Instagram・Threads向け投稿プロンプトを作成します。" },
  { href: "/sidejob", category: "副業支援", title: "AI副業プランナー", description: "作業時間・得意分野・予算から、副業候補と30日プラン用プロンプトを作成します。" },
  { href: "/sns-plan", category: "SNS設計", title: "SNSアカウント設計", description: "ジャンル選定からプロフィール、投稿の柱、収益導線、改善までまとめて設計します。" },
  { href: "/export", category: "出力", title: "記事を出力", description: "掲載用本文をコピーし、Markdownファイルとして端末へ保存します。" },
  { href: "/publish", category: "公開", title: "公開管理", description: "公開予定・公開済みURL・公開日時を記事ライブラリへ記録します。" },
  { href: "/analytics", category: "分析", title: "コンテンツ分析", description: "記事ストック、掲載先、状態、最近更新した記事をAAS内のデータから集計します。" },
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
  const cards = ready ? memberTools : [];

  return (
    <main className="creator-page">
      <header className="creator-head">
        <div><p className="eyebrow">AI ARTICLE STUDIO</p><h1>機能一覧</h1><p>記事制作・画像・SNS・出力・公開・分析など、AASで使える機能をまとめています。</p></div>
        <a className="route-back" href="/">← ホーム</a>
      </header>

      {state.kind === "loading" && <div className="route-notice">利用可能な機能を確認しています…</div>}
      {state.kind === "unavailable" && <div className="route-notice error">アカウントとPWA利用権を確認できませんでした。</div>}
      {state.kind === "signed_out" && <div className="route-notice">ログインすると利用可能な機能が表示されます。</div>}
      {(state.kind === "suspended" || state.kind === "disabled") && <div className="route-notice error">現在のアカウント状態ではPWA機能を利用できません。</div>}
      {invite && <div className="route-notice">PWA機能を使うには利用権が必要です。<a className="route-inline-link" href="/invite">招待コードを登録</a></div>}

      <section className="tool-grid">
        {cards.map((tool) => <a key={tool.href} className="tool-card" href={tool.href}><span>{tool.category}</span><h2>{tool.title}</h2><p>{tool.description}</p><strong>開く →</strong></a>)}
        {invite && <a className="tool-card" href="/invite"><span>PWA</span><h2>PWA招待</h2><p>購入・招待コードをPWA利用権へ登録します。</p><strong>開く →</strong></a>}
        {admin && <a className="tool-card" href="/admin"><span>管理</span><h2>管理ダッシュボード</h2><p>ユーザー承認、Windows/PWA利用権、PWA招待コードを管理します。</p><strong>開く →</strong></a>}
      </section>

      {ready && (
        <section className="openai-tools-section" aria-labelledby="openai-tools-title">
          <div className="openai-tools-heading"><div><p className="eyebrow">OPENAI</p><h2 id="openai-tools-title">OpenAIツール</h2></div><small>外部の公式サービスを新しい画面で開きます</small></div>
          <div className="openai-tools-grid">
            <a href={OPENAI_LINKS.chatgpt} target="_blank" rel="noreferrer"><span>ChatGPT</span><strong>記事・タイトル・相談</strong><b>開く ↗</b></a>
            <a href={OPENAI_LINKS.work} target="_blank" rel="noreferrer"><span>ChatGPT Work</span><strong>まとまった作業・成果物作成</strong><b>開く ↗</b></a>
            <a href={OPENAI_LINKS.images} target="_blank" rel="noreferrer"><span>ChatGPT Images</span><strong>画像生成・画像編集</strong><b>開く ↗</b></a>
            <a href={OPENAI_LINKS.codex} target="_blank" rel="noreferrer"><span>Codex</span><strong>コード作成・開発作業</strong><b>開く ↗</b></a>
          </div>
          <p className="openai-tools-note">端末の設定によってChatGPTアプリまたはWeb版で開きます。</p>
        </section>
      )}
    </main>
  );
}
