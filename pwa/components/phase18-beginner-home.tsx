"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { Phase7App } from "@/components/phase6-app";
import { Phase7Library } from "@/components/phase7-library";
import { OPENAI_LINKS } from "@/lib/openai-links";
import { loadAccessState, type AccessState } from "@/lib/phase6-access";
import { getSupabaseClient } from "@/lib/supabase";

type HomeState = AccessState | { kind: "loading" } | { kind: "unavailable" };
type Section = "home" | "library";

type ActionCardProps = {
  icon: string;
  title: string;
  description: string;
  accent?: "blue" | "purple" | "green" | "pink";
  onClick?: () => void;
  href?: string;
};

function ActionCard({ icon, title, description, accent = "blue", onClick, href }: ActionCardProps) {
  const content = (
    <>
      <span className={`beginner-action-icon ${accent}`} aria-hidden="true">{icon}</span>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <b aria-hidden="true">›</b>
    </>
  );

  if (href) {
    return <a className="beginner-action-card" href={href}>{content}</a>;
  }

  return <button className="beginner-action-card" type="button" onClick={onClick}>{content}</button>;
}

export function Phase18BeginnerHome() {
  const [state, setState] = useState<HomeState>({ kind: "loading" });
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [section, setSection] = useState<Section>("home");
  const [imageUnsaved, setImageUnsaved] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);

  const refresh = useCallback(async (nextClient?: SupabaseClient) => {
    try {
      const activeClient = nextClient ?? client ?? getSupabaseClient();
      setClient(activeClient);
      const next = await loadAccessState(activeClient);
      setState(next);
    } catch {
      setState({ kind: "unavailable" });
    }
  }, [client]);

  useEffect(() => {
    let active = true;
    let activeClient: SupabaseClient;

    try {
      activeClient = getSupabaseClient();
    } catch {
      queueMicrotask(() => {
        if (active) setState({ kind: "unavailable" });
      });
      return;
    }

    queueMicrotask(() => {
      if (!active) return;
      setClient(activeClient);
      void refresh(activeClient);
    });

    const { data } = activeClient.auth.onAuthStateChange(() => {
      window.setTimeout(() => {
        if (active) void refresh(activeClient);
      }, 0);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [refresh]);

  if (state.kind !== "ready" || !client) {
    return <Phase7App />;
  }

  const profile = state.profile;
  const mayLeave = () =>
    !imageBusy &&
    (!imageUnsaved || window.confirm("未保存の画像情報・選択した画像を破棄して移動しますか？"));

  const openSection = (next: Section) => {
    if (next === section || mayLeave()) setSection(next);
  };

  const openRoute = (path: string) => {
    if (mayLeave()) window.location.assign(path);
  };

  const logout = async () => {
    if (!mayLeave()) return;
    await client.auth.signOut({ scope: "local" });
  };

  return (
    <div className="beginner-shell">
      <header className="beginner-topbar">
        <a className="beginner-brand" href="/" aria-label="AI Article Studio ホーム">
          <span aria-hidden="true">✦</span>
          <strong>AI ARTICLE STUDIO</strong>
        </a>
        <div className="beginner-account">
          <span>{profile.display_name || "ユーザー"}</span>
          <small>{profile.aas_user_id}</small>
        </div>
      </header>

      {section === "home" ? (
        <main className="beginner-main">
          <section className="beginner-welcome">
            <div>
              <p>はじめてでも迷わない記事づくり</p>
              <h1>おかえりなさい！</h1>
              <span>今日は何をしますか？</span>
            </div>
            <span className="beginner-access-badge">● PWA利用可能</span>
          </section>

          <section className="beginner-recommend">
            <div>
              <span className="beginner-recommend-label">おすすめ</span>
              <h2>まずは記事を1本つくってみましょう</h2>
              <p>掲載先・ジャンル・読者を選ぶだけ。順番に進めれば記事作成から画像計画まで完了できます。</p>
            </div>
            <button type="button" onClick={() => openRoute("/create")}>記事を作成する →</button>
          </section>

          <section aria-labelledby="beginner-actions-title">
            <div className="beginner-section-heading">
              <div>
                <p>MAIN MENU</p>
                <h2 id="beginner-actions-title">やりたいことから選ぶ</h2>
              </div>
              <a href="/tools">すべての機能を見る</a>
            </div>

            <div className="beginner-action-grid">
              <ActionCard icon="✎" title="記事を作る" description="質問に答えながら記事を作成" href="/create" accent="blue" />
              <ActionCard icon="▤" title="記事ライブラリ" description="作成した記事を一覧で管理" onClick={() => openSection("library")} accent="purple" />
              <ActionCard icon="▧" title="画像を作る" description="アイキャッチ・挿絵を準備" href="/images" accent="green" />
              <ActionCard icon="↗" title="SNS投稿を作る" description="X・Instagram・Threads向け" href="/sns" accent="pink" />
            </div>
          </section>

          <section className="beginner-openai-section" aria-labelledby="beginner-openai-title">
            <div className="beginner-section-heading compact">
              <div><p>OPENAI</p><h2 id="beginner-openai-title">OpenAIツールを開く</h2></div>
            </div>
            <p className="beginner-openai-help">プロンプトをコピーしたあと、そのまま公式のOpenAIツールへ移動できます。</p>
            <div className="beginner-openai-grid">
              <a href={OPENAI_LINKS.chatgpt} target="_blank" rel="noreferrer">
                <span aria-hidden="true">✦</span><strong>ChatGPT</strong><small>記事・タイトル・相談に</small><b>↗</b>
              </a>
              <a href={OPENAI_LINKS.images} target="_blank" rel="noreferrer">
                <span aria-hidden="true">▧</span><strong>ChatGPT Images</strong><small>画像生成・画像編集に</small><b>↗</b>
              </a>
              <a href={OPENAI_LINKS.codex} target="_blank" rel="noreferrer">
                <span aria-hidden="true">⌘</span><strong>Codex</strong><small>コード作成・開発作業に</small><b>↗</b>
              </a>
            </div>
            <small className="beginner-openai-note">端末の設定によってChatGPTアプリまたはWeb版で開きます。</small>
          </section>

          <section className="beginner-secondary-section" aria-labelledby="beginner-more-title">
            <div className="beginner-section-heading compact">
              <div><p>MORE</p><h2 id="beginner-more-title">その他の機能</h2></div>
            </div>
            <div className="beginner-secondary-grid">
              <a href="/sidejob"><strong>AI副業プランナー</strong><small>自分に合う副業候補を整理</small></a>
              <a href="/sns-plan"><strong>SNSアカウント設計</strong><small>プロフィールから収益導線まで</small></a>
              <a href="/publish"><strong>公開管理</strong><small>公開予定・URLを管理</small></a>
              <a href="/analytics"><strong>コンテンツ分析</strong><small>記事ストックを確認</small></a>
              {profile.role === "admin" && <a href="/admin"><strong>管理ダッシュボード</strong><small>ユーザー・利用権を管理</small></a>}
            </div>
          </section>

          <section className="beginner-account-panel">
            <div>
              <strong>{profile.display_name || "ユーザー"}</strong>
              <span>{profile.aas_user_id} · {profile.role} / {profile.status}</span>
            </div>
            <div>
              <button type="button" onClick={() => void refresh(client)}>利用権を再確認</button>
              <button className="danger" type="button" onClick={() => void logout()}>ログアウト</button>
            </div>
          </section>
        </main>
      ) : (
        <main className="beginner-main beginner-library-main">
          <div className="beginner-library-toolbar">
            <button type="button" onClick={() => openSection("home")}>← ホーム</button>
            <a href="/create">＋ 新しい記事を作る</a>
          </div>
          <Phase7Library
            client={client}
            ownerId={profile.id}
            onUnsavedChange={setImageUnsaved}
            onBusyChange={setImageBusy}
          />
        </main>
      )}

      <nav className="beginner-bottom-nav" aria-label="メインナビゲーション">
        <button className={section === "home" ? "active" : ""} type="button" onClick={() => openSection("home")}><span>⌂</span>ホーム</button>
        <button type="button" onClick={() => openRoute("/create")}><span>✎</span>記事作成</button>
        <button className={section === "library" ? "active" : ""} type="button" onClick={() => openSection("library")}><span>▤</span>ライブラリ</button>
        <button type="button" onClick={() => openRoute("/tools")}><span>▦</span>機能</button>
      </nav>
    </div>
  );
}
