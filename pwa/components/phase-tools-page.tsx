"use client";

import Link from "next/link";

import { useSharedAccessState } from "@/components/access-state-provider";
import { MEMBER_TOOL_GROUPS } from "@/features/tools/tool-catalog";

export function PhaseToolsPage() {
  const { state } = useSharedAccessState();

  const ready = state.kind === "ready";
  const invite = state.kind === "pending" || state.kind === "entitlement_denied";

  return (
    <main className="creator-page">
      <header className="creator-head">
        <div>
          <p className="eyebrow">AI ACTION STUDIO</p>
          <h1>機能一覧</h1>
          <p>
            副業ジャンルと用途ごとに機能をまとめています。
            ホームに分かれていた「副業から探す」もここへ統合し、必要な機能をジャンルから選べるようにしました。
            記事生成フロー内で完結する画像設定・タイトル・本文・掲載用コピーは重複表示していません。
          </p>
        </div>
        <Link className="route-back" href="/">← ホーム</Link>
      </header>

      {state.kind === "unavailable" && <div className="route-notice error">アカウントとPWA利用権を確認できませんでした。</div>}
      {state.kind === "signed_out" && <div className="route-notice">ログインすると利用可能な機能が表示されます。</div>}
      {(state.kind === "suspended" || state.kind === "disabled") && <div className="route-notice error">現在のアカウント状態ではPWA機能を利用できません。</div>}
      {invite && <div className="route-notice">PWA機能を使うには利用権が必要です。<Link className="route-inline-link" href="/invite">招待コードを登録</Link></div>}

      {ready && (
        <div className="tool-group-list">
          {MEMBER_TOOL_GROUPS.map((group) => (
            <section className="tool-group-section" key={group.id} aria-labelledby={`tool-group-${group.id}`}>
              <div className="tool-group-heading">
                <div>
                  <p className="eyebrow">FEATURE GENRE</p>
                  <h2 id={`tool-group-${group.id}`}>{group.title}</h2>
                </div>
                <p>{group.description}</p>
              </div>
              <div className="tool-grid">
                {group.tools.map((tool) => (
                  <Link key={`${tool.href}:${tool.title}`} className="tool-card" href={tool.href}>
                    <div className="tool-card-meta">
                      <span>{tool.category}</span>
                      {tool.badge ? <small>{tool.badge}</small> : null}
                    </div>
                    <h3>{tool.title}</h3>
                    <p>{tool.description}</p>
                    <strong>開く →</strong>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {invite && (
        <section className="tool-grid tool-invite-grid">
          <Link className="tool-card" href="/invite">
            <div className="tool-card-meta"><span>PWA</span></div>
            <h3>PWA招待</h3>
            <p>購入・招待コードをPWA利用権へ登録します。</p>
            <strong>開く →</strong>
          </Link>
        </section>
      )}
    </main>
  );
}
