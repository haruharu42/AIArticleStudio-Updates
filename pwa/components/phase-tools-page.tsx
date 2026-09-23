"use client";

import Link from "next/link";

import { useSharedAccessState } from "@/components/access-state-provider";

type ToolCard = {
  href: string;
  category: string;
  title: string;
  description: string;
};

type ToolGroup = {
  id: string;
  title: string;
  description: string;
  tools: readonly ToolCard[];
};

const memberToolGroups: readonly ToolGroup[] = [
  {
    id: "operations",
    title: "運営・アカウント",
    description: "記事を作った後の運営や、投稿先アカウントの設計・管理をまとめています。",
    tools: [
      {
        href: "/workflow",
        category: "運営",
        title: "AAS運営コックピット",
        description: "今日やること、公開前チェック、記事→SNS再利用、シリーズ設計を1つの流れで管理します。",
      },
      {
        href: "/note-operations",
        category: "note運営",
        title: "note運営アシスタント",
        description: "アカウント準備、プロフィール、無料・有料noteの投稿計画、カレンダーと今日のToDoを管理します。",
      },
      {
        href: "/account-design",
        category: "アカウント設計",
        title: "note / Tips / Brain アカウント作成",
        description: "表示名・ID候補・プロフィール・発信軸・初期投稿・専用アイコンまで媒体別に設計して保存します。",
      },
    ],
  },
  {
    id: "social",
    title: "SNS・集客",
    description: "SNSアカウントの設計と、記事からの投稿作成をまとめています。",
    tools: [
      {
        href: "/sns-plan",
        category: "SNS設計",
        title: "SNSアカウント設計",
        description: "ジャンル選定からプロフィール、投稿の柱、収益導線、改善までまとめて設計します。",
      },
      {
        href: "/sns",
        category: "SNS投稿",
        title: "SNS投稿を作る",
        description: "記事ライブラリからX・Instagram・Threads向け投稿プロンプトを作成します。",
      },
    ],
  },
  {
    id: "publish",
    title: "公開・改善",
    description: "公開後の記録と、蓄積したコンテンツの状況確認をまとめています。",
    tools: [
      {
        href: "/publish",
        category: "公開管理",
        title: "公開管理",
        description: "公開予定・公開済みURL・公開日時を記事ライブラリへ記録します。",
      },
      {
        href: "/analytics",
        category: "分析",
        title: "コンテンツ分析",
        description: "記事ストック、掲載先、状態、最近更新した記事をAAS内のデータから集計します。",
      },
    ],
  },
  {
    id: "business",
    title: "副業・収益化",
    description: "記事制作とは別の副業計画や活動設計をまとめています。",
    tools: [
      {
        href: "/sidejob",
        category: "副業支援",
        title: "AI副業プランナー",
        description: "作業時間・得意分野・予算から、副業候補と30日プラン用プロンプトを作成します。",
      },
    ],
  },
  {
    id: "support",
    title: "サポート",
    description: "困ったときの問い合わせや要望・不具合連絡はこちらです。",
    tools: [
      {
        href: "/inquiries",
        category: "サポート",
        title: "お問い合わせ",
        description: "追加機能要望、不具合、使い方、アカウント・購入関連を送信し、管理者からの返信を確認します。",
      },
    ],
  },
];

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
          <p>副業・SNS・運営・公開・分析などの関連機能を用途別にまとめています。記事生成に含まれる画像設定・タイトル・本文・掲載用コピーは「記事を作る」へ集約しています。</p>
        </div>
        <Link className="route-back" href="/">← ホーム</Link>
      </header>

      {state.kind === "unavailable" && <div className="route-notice error">アカウントとPWA利用権を確認できませんでした。</div>}
      {state.kind === "signed_out" && <div className="route-notice">ログインすると利用可能な機能が表示されます。</div>}
      {(state.kind === "suspended" || state.kind === "disabled") && <div className="route-notice error">現在のアカウント状態ではPWA機能を利用できません。</div>}
      {invite && <div className="route-notice">PWA機能を使うには利用権が必要です。<Link className="route-inline-link" href="/invite">招待コードを登録</Link></div>}

      {ready && (
        <div className="tool-group-list">
          {memberToolGroups.map((group) => (
            <section className="tool-group-section" key={group.id} aria-labelledby={`tool-group-${group.id}`}>
              <div className="tool-group-heading">
                <div>
                  <p className="eyebrow">FEATURE GROUP</p>
                  <h2 id={`tool-group-${group.id}`}>{group.title}</h2>
                </div>
                <p>{group.description}</p>
              </div>
              <div className="tool-grid">
                {group.tools.map((tool) => (
                  <Link key={tool.href} className="tool-card" href={tool.href}>
                    <span>{tool.category}</span>
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
            <span>PWA</span>
            <h3>PWA招待</h3>
            <p>購入・招待コードをPWA利用権へ登録します。</p>
            <strong>開く →</strong>
          </Link>
        </section>
      )}
    </main>
  );
}
