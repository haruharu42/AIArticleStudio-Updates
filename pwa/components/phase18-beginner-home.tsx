"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { Phase7App } from "@/components/phase6-app";
import { Phase7Library } from "@/components/phase7-library";
import { AI_APP_LINKS, launchAiApp, type AiAppKey } from "@/lib/ai-app-links";
import { loadAccessState, type AccessState } from "@/lib/phase6-access";
import { listCloudArticles, type ArticleStatus, type ArticleSummary } from "@/lib/phase7-articles";
import {
  AGE_GROUP_OPTIONS,
  GENDER_OPTIONS,
  GENRE_OPTIONS,
  TARGET_LENGTH_OPTIONS,
  subgenreOptionsFor,
} from "@/lib/phase18-content-options";
import { getSupabaseClient } from "@/lib/supabase";

type HomeState = AccessState | { kind: "loading" } | { kind: "unavailable" };
type Section = "home" | "library" | "settings";
type Accent = "blue" | "purple" | "green" | "pink";

type QuickSetup = {
  publicationTarget: "note" | "tips" | "brain" | "blog";
  articleType: "free" | "paid";
  genre: string;
  subgenre: string;
  ageGroup: string;
  gender: string;
  targetLength: number;
  inlineCount: number;
};

type ActionCardProps = {
  icon: string;
  title: string;
  description: string;
  accent?: Accent;
  onClick?: () => void;
  href?: string;
};

const STATUS_LABELS: Record<ArticleStatus, string> = {
  draft: "下書き",
  writing: "作成中",
  ready: "完成",
  waiting_publish: "公開待ち",
  published: "公開済み",
  on_hold: "保留",
  archived: "保管済み",
};

const QUICK_SETUP_INITIAL: QuickSetup = {
  publicationTarget: "note",
  articleType: "free",
  genre: "AI副業",
  subgenre: "AIおまかせ",
  ageGroup: "30代",
  gender: "AIおまかせ",
  targetLength: 5000,
  inlineCount: 2,
};

function ActionCard({ icon, title, description, accent = "blue", onClick, href }: ActionCardProps) {
  const content = (
    <>
      <span className={`beginner-action-icon ${accent}`} aria-hidden="true">{icon}</span>
      <span><strong>{title}</strong><small>{description}</small></span>
      <b aria-hidden="true">›</b>
    </>
  );
  if (href) return <a className="beginner-action-card" href={href}>{content}</a>;
  return <button className="beginner-action-card" type="button" onClick={onClick}>{content}</button>;
}

function AiLaunchCard({ appKey }: { appKey: AiAppKey }) {
  const app = AI_APP_LINKS[appKey];
  const mark = appKey === "chatgpt" ? "◎" : appKey === "claude" ? "✳" : "✦";
  return (
    <button className={`beginner-ai-card ${appKey}`} type="button" onClick={() => launchAiApp(appKey)}>
      <span aria-hidden="true">{mark}</span>
      <strong>{app.name}</strong>
      <small>{app.description}</small>
      <b aria-hidden="true">↗</b>
    </button>
  );
}

function QuickSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="beginner-quick-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>
    </label>
  );
}

export function Phase18BeginnerHome() {
  const [state, setState] = useState<HomeState>({ kind: "loading" });
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [section, setSection] = useState<Section>("home");
  const [imageUnsaved, setImageUnsaved] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [recentArticles, setRecentArticles] = useState<ArticleSummary[] | null>(null);
  const [quickSetup, setQuickSetup] = useState<QuickSetup>(QUICK_SETUP_INITIAL);

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
      queueMicrotask(() => { if (active) setState({ kind: "unavailable" }); });
      return;
    }
    queueMicrotask(() => {
      if (!active) return;
      setClient(activeClient);
      void refresh(activeClient);
    });
    const { data } = activeClient.auth.onAuthStateChange(() => {
      window.setTimeout(() => { if (active) void refresh(activeClient); }, 0);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [refresh]);

  useEffect(() => {
    if (state.kind !== "ready" || !client) return;
    let active = true;
    void listCloudArticles(client, state.profile.id, 3).then(
      (articles) => { if (active) setRecentArticles(articles); },
      () => { if (active) setRecentArticles([]); },
    );
    return () => { active = false; };
  }, [client, state]);

  const quickSubgenres = useMemo(() => subgenreOptionsFor(quickSetup.genre), [quickSetup.genre]);
  const quickCreateHref = useMemo(() => {
    const params = new URLSearchParams({
      publicationTarget: quickSetup.publicationTarget,
      articleType: quickSetup.articleType,
      genre: quickSetup.genre,
      subgenre: quickSetup.subgenre,
      ageGroup: quickSetup.ageGroup,
      gender: quickSetup.gender,
      targetLength: String(quickSetup.targetLength),
      inlineCount: String(quickSetup.inlineCount),
      from: "home-quick-setup",
    });
    return `/create?${params.toString()}`;
  }, [quickSetup]);

  if (state.kind !== "ready" || !client) return <Phase7App />;

  const profile = state.profile;
  const mayLeave = () => !imageBusy && (!imageUnsaved || window.confirm("未保存の画像情報・選択した画像を破棄して移動しますか？"));
  const openSection = (next: Section) => { if (next === section || mayLeave()) setSection(next); };
  const openRoute = (path: string) => { if (mayLeave()) window.location.assign(path); };
  const logout = async () => { if (mayLeave()) await client.auth.signOut({ scope: "local" }); };
  const setQuickGenre = (genre: string) => {
    const nextSubgenres = subgenreOptionsFor(genre);
    setQuickSetup((current) => ({
      ...current,
      genre,
      subgenre: nextSubgenres.includes(current.subgenre) ? current.subgenre : nextSubgenres[0] ?? "AIおまかせ",
    }));
  };

  const sidebar = (
    <aside className="beginner-desktop-sidebar" aria-label="メインメニュー">
      <nav>
        <button className={section === "home" ? "active" : ""} type="button" onClick={() => openSection("home")}><span>⌂</span>ホーム</button>
        <a href="/create"><span>✎</span>記事作成</a>
        <button className={section === "library" ? "active" : ""} type="button" onClick={() => openSection("library")}><span>▤</span>記事ライブラリ</button>
        <a href="/images"><span>▧</span>画像作成</a>
        <a href="/sns"><span>↗</span>SNS投稿</a>
        <button className={section === "settings" ? "active" : ""} type="button" onClick={() => openSection("settings")}><span>⚙</span>設定</button>
      </nav>
      <div className="beginner-sidebar-tip"><span aria-hidden="true">♛</span><strong>AIで、アイデアをカタチに。</strong><small>迷ったらホームの「記事を作成する」から始めれば大丈夫です。</small></div>
    </aside>
  );

  return (
    <div className="beginner-shell beginner-dashboard-shell">
      <header className="beginner-topbar beginner-dashboard-topbar">
        <a className="beginner-brand" href="/" aria-label="AI Article Studio ホーム"><span aria-hidden="true">✦</span><strong>AI ARTICLE <em>STUDIO</em></strong></a>
        <div className="beginner-account"><span>{profile.display_name || "ユーザー"}</span><small>{profile.aas_user_id}</small></div>
      </header>

      <div className="beginner-dashboard-frame">
        {sidebar}

        {section === "home" && (
          <main className="beginner-main beginner-dashboard-main">
            <section className="beginner-dashboard-hero">
              <div>
                <p>AI ARTICLE STUDIO PWA</p>
                <h1>はじめてでも、<em>迷わず</em>使える。</h1>
                <span>記事作成・画像・SNS投稿まで、やりたいことを順番に選ぶだけです。</span>
                <div className="beginner-hero-actions"><a href="/create">✎ 記事を作成する →</a><a className="secondary" href="#beginner-guide">使い方を見る</a></div>
              </div>
              <div className="beginner-hero-visual" aria-hidden="true"><span>✦</span><strong>アイデアを<br />カタチに。</strong><small>はじめの一歩を<br />サポートします</small></div>
            </section>

            <section className="beginner-dashboard-actions" aria-label="主要機能">
              <ActionCard icon="▤" title="記事作成" description="AIで文章作成をサポート" href="/create" accent="blue" />
              <ActionCard icon="▰" title="記事ライブラリ" description="作成した記事を管理" onClick={() => openSection("library")} accent="purple" />
              <ActionCard icon="▧" title="画像作成" description="アイキャッチ・挿絵を準備" href="/images" accent="green" />
              <ActionCard icon="↗" title="SNS投稿" description="SNS向け文章を作成" href="/sns" accent="pink" />
            </section>

            <section className="beginner-quick-setup" aria-labelledby="quick-setup-title">
              <div className="beginner-card-title"><div><span aria-hidden="true">⚙</span><div><h2 id="quick-setup-title">記事の基本設定</h2><p>ここで選んだ条件は記事作成画面へ引き継がれます。</p></div></div><button type="button" onClick={() => setQuickSetup(QUICK_SETUP_INITIAL)}>↻ 設定をリセット</button></div>
              <div className="beginner-quick-grid">
                <QuickSelect label="掲載先" value={quickSetup.publicationTarget} onChange={(value) => setQuickSetup((current) => ({ ...current, publicationTarget: value as QuickSetup["publicationTarget"] }))}><option value="note">note</option><option value="tips">Tips</option><option value="brain">Brain</option><option value="blog">ブログ</option></QuickSelect>
                <QuickSelect label="記事タイプ" value={quickSetup.articleType} onChange={(value) => setQuickSetup((current) => ({ ...current, articleType: value as QuickSetup["articleType"] }))}><option value="free">無料記事</option><option value="paid">有料記事</option></QuickSelect>
                <QuickSelect label="ジャンル" value={quickSetup.genre} onChange={setQuickGenre}>{GENRE_OPTIONS.map((genre) => <option key={genre} value={genre}>{genre}</option>)}</QuickSelect>
                <QuickSelect label="サブジャンル" value={quickSetup.subgenre} onChange={(value) => setQuickSetup((current) => ({ ...current, subgenre: value }))}>{quickSubgenres.map((subgenre) => <option key={subgenre} value={subgenre}>{subgenre}</option>)}</QuickSelect>
                <QuickSelect label="対象年齢" value={quickSetup.ageGroup} onChange={(value) => setQuickSetup((current) => ({ ...current, ageGroup: value }))}>{AGE_GROUP_OPTIONS.map((age) => <option key={age} value={age}>{age}</option>)}</QuickSelect>
                <QuickSelect label="性別" value={quickSetup.gender} onChange={(value) => setQuickSetup((current) => ({ ...current, gender: value }))}>{GENDER_OPTIONS.map((gender) => <option key={gender} value={gender}>{gender}</option>)}</QuickSelect>
                <QuickSelect label="文字数目安" value={quickSetup.targetLength} onChange={(value) => setQuickSetup((current) => ({ ...current, targetLength: Number(value) }))}>{TARGET_LENGTH_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</QuickSelect>
                <QuickSelect label="挿絵枚数" value={quickSetup.inlineCount} onChange={(value) => setQuickSetup((current) => ({ ...current, inlineCount: Number(value) }))}><option value={0}>なし</option><option value={1}>1枚</option><option value={2}>2枚</option><option value={3}>3枚</option><option value={4}>4枚</option><option value={5}>5枚</option></QuickSelect>
              </div>
              <a className="beginner-quick-start" href={quickCreateHref}>この条件で記事作成を始める →</a>
            </section>

            <section className="beginner-ai-section" aria-labelledby="beginner-ai-title">
              <div className="beginner-card-title"><div><span aria-hidden="true">🔗</span><div><h2 id="beginner-ai-title">AIアプリを開く</h2><p>普段使っているAIへすぐ移動できます。</p></div></div></div>
              <div className="beginner-ai-grid"><AiLaunchCard appKey="chatgpt" /><AiLaunchCard appKey="claude" /><AiLaunchCard appKey="gemini" /></div>
              <p className="beginner-ai-note">スマホではアプリを優先して開き、開けない場合は iPhone は App Store、Android は Google Play の公式ページへ移動します。PCではWeb版を開きます。</p>
            </section>

            <section id="beginner-guide" className="beginner-three-steps">
              <div><span aria-hidden="true">💡</span><strong>はじめての方へ</strong><small>使い方はかんたん3ステップ</small></div>
              <ol><li><b>1</b><span><strong>条件を選ぶ</strong><small>掲載先やジャンルを選択</small></span></li><li><b>2</b><span><strong>AIで作成</strong><small>プロンプトをAIへ渡す</small></span></li><li><b>3</b><span><strong>保存して管理</strong><small>ライブラリでいつでも編集</small></span></li></ol>
            </section>

            <section className="beginner-secondary-section" aria-labelledby="beginner-more-title">
              <div className="beginner-section-heading compact"><div><p>MORE</p><h2 id="beginner-more-title">もっと活用する</h2></div><a href="/tools">すべての機能</a></div>
              <div className="beginner-secondary-grid">
                <a href="/sidejob"><strong>AI副業プランナー</strong><small>自分に合う副業候補を整理</small></a>
                <a href="/sns-plan"><strong>SNSアカウント設計</strong><small>プロフィールから収益導線まで</small></a>
                <a href="/publish"><strong>公開管理</strong><small>公開予定・URLを管理</small></a>
                <a href="/analytics"><strong>コンテンツ分析</strong><small>記事ストックを確認</small></a>
                {profile.role === "admin" && <a href="/admin"><strong>管理ダッシュボード</strong><small>ユーザー・利用権を管理</small></a>}
              </div>
            </section>
          </main>
        )}

        {section === "library" && (
          <main className="beginner-main beginner-library-main beginner-dashboard-main">
            <div className="beginner-library-toolbar"><button type="button" onClick={() => openSection("home")}>← ホーム</button><a href="/create">＋ 新しい記事を作る</a></div>
            <Phase7Library client={client} ownerId={profile.id} onUnsavedChange={setImageUnsaved} onBusyChange={setImageBusy} />
          </main>
        )}

        {section === "settings" && (
          <main className="beginner-main beginner-dashboard-main">
            <section className="beginner-settings-page">
              <p className="eyebrow">SETTINGS</p><h1>設定</h1><p>アカウント・利用権・ヘルプをここから確認できます。</p>
              <div className="beginner-settings-card"><div><strong>{profile.display_name || "ユーザー"}</strong><span>{profile.aas_user_id}</span><small>{profile.role} / {profile.status}</small></div><span className="beginner-access-badge">● PWA利用可能</span></div>
              <div className="beginner-settings-links"><a href="/tools">機能一覧 <span>›</span></a><a href="/terms">利用規約 <span>›</span></a><a href="/privacy">プライバシーポリシー <span>›</span></a><a href="/ai-terms">AI利用条件 <span>›</span></a></div>
              <div className="beginner-settings-actions"><button type="button" onClick={() => void refresh(client)}>利用権を再確認</button><button className="danger" type="button" onClick={() => void logout()}>ログアウト</button></div>
            </section>
          </main>
        )}

        {section === "home" && (
          <aside className="beginner-desktop-right" aria-label="ホーム補助情報">
            <section className="beginner-right-card">
              <div className="beginner-right-title"><strong>最近の記事</strong><button type="button" onClick={() => openSection("library")}>すべて見る ›</button></div>
              {recentArticles === null ? <p className="beginner-right-muted">読み込み中…</p> : recentArticles.length ? <div className="beginner-recent-list">{recentArticles.map((article) => <button key={article.id} type="button" onClick={() => openSection("library")}><strong>{article.title || "無題の記事"}</strong><small>{article.publicationTarget} · {STATUS_LABELS[article.status]}</small></button>)}</div> : <div className="beginner-right-empty"><span aria-hidden="true">▤</span><strong>まだ記事がありません</strong><small>最初の記事を作るとここに表示されます。</small><a href="/create">記事を作る</a></div>}
            </section>
            <section className="beginner-right-card beginner-checklist">
              <div className="beginner-right-title"><strong>はじめての方へ</strong></div>
              <ul><li><span>✓</span><div><strong>記事の条件を選ぶ</strong><small>プルダウンから選ぶだけ</small></div></li><li><span>✓</span><div><strong>AIアプリを開く</strong><small>ChatGPT・Claude・Geminiへ移動</small></div></li><li><span>✓</span><div><strong>記事を保存する</strong><small>クラウドで安全に管理</small></div></li><li><span>✓</span><div><strong>SNS投稿を作る</strong><small>記事から投稿文へ展開</small></div></li></ul>
            </section>
          </aside>
        )}
      </div>

      <nav className="beginner-bottom-nav beginner-mobile-nav" aria-label="メインナビゲーション">
        <button className={section === "home" ? "active" : ""} type="button" onClick={() => openSection("home")}><span>⌂</span>ホーム</button>
        <button type="button" onClick={() => openRoute("/create")}><span>✎</span>作成</button>
        <button className={section === "library" ? "active" : ""} type="button" onClick={() => openSection("library")}><span>▤</span>ライブラリ</button>
        <button type="button" onClick={() => openRoute("/sns")}><span>↗</span>SNS</button>
        <button className={section === "settings" ? "active" : ""} type="button" onClick={() => openSection("settings")}><span>⚙</span>設定</button>
      </nav>
    </div>
  );
}
