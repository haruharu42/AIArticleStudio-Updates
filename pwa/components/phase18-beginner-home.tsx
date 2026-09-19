"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { AasReferenceBottomNav, AasReferenceHeader } from "@/components/aas-reference-shell";
import { Phase7App } from "@/components/phase6-app";
import { Phase7Library } from "@/components/phase7-library";\nimport { NoteTodayPanel } from "@/components/note-today-panel";
import { AI_APP_LINKS, launchAiApp, type AiAppKey } from "@/lib/ai-app-links";
import {
  getCreatorRanking,
  getMyCreatorDashboard,
  getMyCreatorMissions,
  xpProgress,
  type CreatorDashboard,
  type CreatorMission,
  type RankingRow,
} from "@/lib/creator-system";
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
type Section = "home" | "library";

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

function avatarLetter(value: string): string {
  return (value.trim().charAt(0) || "A").toUpperCase();
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

function BeginnerAccessFallback({ unavailable = false }: { unavailable?: boolean }) {
  return (
    <div className="reference-home">
      <AasReferenceHeader />
      <main className="reference-home-main">
        <section className="beginner-recommend" role={unavailable ? "alert" : "status"} aria-live="polite">
          <div>
            <span className="beginner-recommend-label">{unavailable ? "CONNECTION" : "LOADING"}</span>
            <h2>{unavailable ? "接続状態を確認できませんでした" : "アカウントと利用権を確認しています"}</h2>
            <p>{unavailable ? "通信状態を確認して、もう一度読み込んでください。" : "確認が終わるとホーム画面を表示します。"}</p>
          </div>
          {unavailable
            ? <button type="button" onClick={() => window.location.reload()}>再読み込み</button>
            : <span className="beginner-access-badge">確認中…</span>}
        </section>
      </main>
    </div>
  );
}

function MissionRows({ missions }: { missions: CreatorMission[] }) {
  const visible = missions.slice(0, 3);
  if (!visible.length) return <p className="beginner-right-muted">現在表示できるミッションはありません。</p>;
  return (
    <div className="reference-mission-list">
      {visible.map((mission) => (
        <a className={`reference-mission-row ${mission.completed ? "done" : ""}`} href="/missions" key={mission.missionCode}>
          <span aria-hidden="true">{mission.completed ? "✓" : "○"}</span>
          <span>
            <strong>{mission.title}</strong>
            <small>{mission.description}</small>
          </span>
          <b>+{mission.rewardXp} XP</b>
        </a>
      ))}
    </div>
  );
}

export function Phase18BeginnerHome() {
  const [state, setState] = useState<HomeState>({ kind: "loading" });
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [section, setSection] = useState<Section>("home");
  const [imageUnsaved, setImageUnsaved] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [recentArticles, setRecentArticles] = useState<ArticleSummary[] | null>(null);
  const [recentArticlesError, setRecentArticlesError] = useState(false);
  const [dashboard, setDashboard] = useState<CreatorDashboard | null>(null);
  const [dashboardError, setDashboardError] = useState(false);
  const [missions, setMissions] = useState<CreatorMission[]>([]);
  const [missionsLoaded, setMissionsLoaded] = useState(false);
  const [missionsError, setMissionsError] = useState(false);
  const [ranking, setRanking] = useState<RankingRow[]>([]);
  const [rankingLoaded, setRankingLoaded] = useState(false);
  const [rankingError, setRankingError] = useState(false);
  const [quickSetup, setQuickSetup] = useState<QuickSetup>(QUICK_SETUP_INITIAL);

  const refresh = useCallback(async (nextClient?: SupabaseClient) => {
    try {
      const activeClient = nextClient ?? getSupabaseClient();
      setClient(activeClient);
      setState(await loadAccessState(activeClient));
    } catch {
      setState({ kind: "unavailable" });
    }
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("section") !== "library") return;
    queueMicrotask(() => setSection("library"));
  }, []);

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
    queueMicrotask(() => {
      if (!active) return;
      setRecentArticlesError(false);
      setDashboardError(false);
      setMissionsLoaded(false);
      setMissionsError(false);
      setRankingLoaded(false);
      setRankingError(false);
    });
    void listCloudArticles(client, state.profile.id, 3).then(
      (articles) => {
        if (!active) return;
        setRecentArticles(articles);
        setRecentArticlesError(false);
      },
      () => {
        if (!active) return;
        setRecentArticles([]);
        setRecentArticlesError(true);
      },
    );
    void getMyCreatorDashboard(client).then(
      (value) => {
        if (!active) return;
        setDashboard(value);
        setDashboardError(false);
      },
      () => {
        if (!active) return;
        setDashboard(null);
        setDashboardError(true);
      },
    );
    void getMyCreatorMissions(client).then(
      (value) => {
        if (!active) return;
        setMissions(value);
        setMissionsLoaded(true);
      },
      () => {
        if (!active) return;
        setMissions([]);
        setMissionsLoaded(true);
        setMissionsError(true);
      },
    );
    void getCreatorRanking(client, "level", 50).then(
      (value) => {
        if (!active) return;
        setRanking(value);
        setRankingLoaded(true);
      },
      () => {
        if (!active) return;
        setRanking([]);
        setRankingLoaded(true);
        setRankingError(true);
      },
    );
    return () => { active = false; };
  }, [client, state]);

  const handleAccessReady = useCallback(() => {
    void refresh();
  }, [refresh]);

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

  const creatorXp = useMemo(
    () => dashboard ? xpProgress(dashboard.totalXp, dashboard.level) : null,
    [dashboard],
  );
  const myRank = useMemo(() => ranking.find((row) => row.isMe) ?? null, [ranking]);

  if (state.kind === "loading") return <BeginnerAccessFallback />;
  if (state.kind === "unavailable") return <BeginnerAccessFallback unavailable />;
  if (state.kind !== "ready") return <Phase7App onAccessReady={handleAccessReady} />;
  if (!client) return <BeginnerAccessFallback />;

  const profile = state.profile;
  const displayName = dashboard?.publicName || profile.display_name || "ユーザー";
  const mayLeave = () => !imageBusy && (!imageUnsaved || window.confirm("未保存の画像情報・選択した画像を破棄して移動しますか？"));

  const openSection = (next: Section) => {
    if (next !== section && !mayLeave()) return;
    setSection(next);
    window.history.replaceState({}, "", next === "library" ? "/?section=library" : "/");
  };

  const setQuickGenre = (genre: string) => {
    const nextSubgenres = subgenreOptionsFor(genre);
    setQuickSetup((current) => ({
      ...current,
      genre,
      subgenre: nextSubgenres.includes(current.subgenre) ? current.subgenre : nextSubgenres[0] ?? "AIおまかせ",
    }));
  };

  if (section === "library") {
    return (
      <div className="reference-home">
        <AasReferenceHeader hasUnreadNotifications={Boolean(dashboard?.claimableMissions)} />
        <main className="reference-home-main beginner-library-main">
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
        <AasReferenceBottomNav active="library" onLibrary={() => openSection("library")} />
      </div>
    );
  }

  return (
    <div className="reference-home">
      <AasReferenceHeader hasUnreadNotifications={Boolean(dashboard?.claimableMissions)} />
      <main className="reference-home-main">
        <div className="reference-home-heading">
          <h1>⌂ ホーム</h1>
          <p>今日も、いい記事をつくりましょう！</p>
        </div>

        <section className="reference-creator-card" aria-label="Creatorステータス">
          <span className="reference-avatar" aria-hidden="true">
            {dashboard?.avatarUrl ? <img src={dashboard.avatarUrl} alt="" /> : avatarLetter(displayName)}
          </span>
          <div className="reference-creator-main">
            <div className="reference-name-row">
              <strong>{displayName}</strong>
              <span className="reference-level-pill">♛ Creator {dashboard ? `Lv.${dashboard.level}` : "—"}</span>
            </div>
            {creatorXp ? (
              <>
                <div className="reference-xp-row">
                  <div className="reference-xp-track" aria-label={`レベル進捗 ${creatorXp.percent}%`}>
                    <span style={{ width: `${creatorXp.percent}%` }} />
                  </div>
                  <b>{creatorXp.current} / {creatorXp.needed} XP</b>
                </div>
                <small className="reference-xp-note">あと {Math.max(0, creatorXp.needed - creatorXp.current)} XPで次のレベルです。</small>
              </>
            ) : <small className="reference-xp-note">Creatorデータを取得できませんでした。</small>}
          </div>
          <div className="reference-streak">
            <strong>🔥 {dashboard ? `${dashboard.currentStreak}日連続` : "—"}</strong>
            <small>継続は力なり！</small>
          </div>
        </section>

        <NoteTodayPanel client={client} ownerId={profile.id} />

        <section className="reference-home-section">
          <div className="reference-section-heading">
            <h2>🎯 今日のミッション</h2>
            <a href="/missions">すべて見る ›</a>
          </div>
          {missionsError ? (
            <p className="beginner-right-muted" role="alert">ミッションを取得できませんでした。再読み込みしてお試しください。</p>
          ) : !missionsLoaded ? (
            <p className="beginner-right-muted" role="status" aria-live="polite">ミッションを読み込んでいます…</p>
          ) : (
            <MissionRows missions={missions.filter((mission) => mission.cadence === "daily").length ? missions.filter((mission) => mission.cadence === "daily") : missions} />
          )}
        </section>

        {dashboard && (
          <section className="reference-home-section">
            <div className="reference-member-banner">
              <span aria-hidden="true">♛</span>
              <div>
                <strong>{dashboard.noteMember ? dashboard.membershipPlanName || "Creator Club" : "Creator Level 特典"}</strong>
                <small>
                  {dashboard.noteMember
                    ? `記事XP ×${dashboard.articleXpMultiplier.toFixed(1)}・記事枠 +${dashboard.membershipArticleQuotaBonus}`
                    : `レベルに応じて記事ストック上限が増えます。現在 +${dashboard.creatorArticleQuotaBonus}`}
                </small>
              </div>
              <a href="/membership">特典を見る ›</a>
            </div>
          </section>
        )}

        <section className="reference-home-section">
          <div className="reference-section-heading">
            <h2>▤ 記事ライブラリ / noteマガジン</h2>
            <button type="button" className="reference-link-button" onClick={() => openSection("library")}>ライブラリを開く ›</button>
          </div>
          {dashboard && (
            <div className="reference-magazine-summary">
              <div><small>完成マガジン</small><strong>{dashboard.completedMagazines}</strong></div>
              <div><small>完成記事</small><strong>{dashboard.completedArticles}</strong></div>
              <div><small>今週XP</small><strong>{dashboard.weeklyXp}</strong></div>
            </div>
          )}
          {recentArticlesError ? (
            <p className="beginner-right-muted" role="alert">最近の記事を取得できませんでした。再読み込みしてお試しください。</p>
          ) : recentArticles === null ? (
            <p className="beginner-right-muted" role="status" aria-live="polite">最近の記事を読み込んでいます…</p>
          ) : recentArticles.length ? (
            <div className="reference-recent-list">
              {recentArticles.map((article) => (
                <button key={article.id} type="button" onClick={() => openSection("library")}>
                  <span>▧</span>
                  <span><strong>{article.title || "無題の記事"}</strong><small>{article.publicationTarget} · {STATUS_LABELS[article.status]}</small></span>
                  <b>›</b>
                </button>
              ))}
            </div>
          ) : (
            <div className="reference-empty-inline">
              <strong>まだ記事がありません</strong>
              <a href="/create">最初の記事を作る →</a>
            </div>
          )}
        </section>

        <section className="reference-home-section">
          <div className="reference-section-heading">
            <h2>⚡ クイックスタート / 使い方</h2>
            <a href="/manual">詳しい使い方 ›</a>
          </div>
          <div className="reference-quick-grid">
            <a className="reference-quick-step" href="/create"><span>1</span><b>▧</b><strong>条件を選ぶ</strong><small>掲載先やジャンルをプルダウンで選択</small></a>
            <a className="reference-quick-step" href="/create"><span>2</span><b>✎</b><strong>記事を作る</strong><small>AI用プロンプトまたは手入力で作成</small></a>
            <button className="reference-quick-step" type="button" onClick={() => openSection("library")}><span>3</span><b>✓</b><strong>保存して管理</strong><small>ライブラリで編集・画像管理</small></button>
          </div>
          <div className="reference-help-links">
            <a className="secondary" href="/manual">使い方を見る</a>
            <a href="/faq">Q&A・よくある質問</a>
          </div>
        </section>

        <section className="reference-home-section beginner-quick-setup" aria-labelledby="quick-setup-title">
          <div className="beginner-card-title">
            <div><span aria-hidden="true">⚙</span><div><h2 id="quick-setup-title">記事の基本設定</h2><p>よく使う条件をプルダウンで選び、そのまま記事作成へ進めます。</p></div></div>
            <button type="button" onClick={() => setQuickSetup(QUICK_SETUP_INITIAL)}>↻ リセット</button>
          </div>
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

        <section className="reference-home-section">
          <div className="reference-section-heading"><h2>🔗 AIアプリを開く</h2><a href="/tools">すべての機能 ›</a></div>
          <div className="beginner-ai-grid"><AiLaunchCard appKey="chatgpt" /><AiLaunchCard appKey="claude" /><AiLaunchCard appKey="gemini" /></div>
          <p className="reference-ai-note">iPhone / iPadでは「アプリを開く」と「Web版を開く」を選べます。Androidはアプリを優先し、開けない場合はGoogle Playの公式ページへ移動します。PCではWeb版を開きます。</p>
          <div className="reference-feature-links">
            <a href="/images"><span>▧</span><strong>画像作成</strong><small>アイキャッチ・挿絵を準備</small></a>
            <a href="/sns"><span>↗</span><strong>SNS投稿</strong><small>記事から投稿文を作成</small></a>
          </div>
        </section>

        <section className="reference-home-section">
          <div className="reference-section-heading"><h2>🏆 週間ランキング</h2><a href="/ranking">ランキングを見る ›</a></div>
          <div className="reference-rank-summary">
            <span aria-hidden="true">🏆</span>
            <div>
              <strong>{rankingError || dashboardError ? "ランキング情報を取得できません" : dashboard ? (dashboard.rankingOptIn ? "あなたの現在の順位" : "ランキングは現在非参加") : "ランキングを読み込んでいます…"}</strong>
              <b>{myRank ? `第 ${myRank.rankPosition} 位` : rankingLoaded && dashboard?.rankingOptIn ? (ranking.length ? "圏外" : "未集計") : "—"}</b>
            </div>
            <a href="/profile">{dashboard?.rankingOptIn ? "公開設定 ›" : "プロフィール設定 ›"}</a>
          </div>
        </section>
      </main>

      <AasReferenceBottomNav active="home" onLibrary={() => openSection("library")} />
    </div>
  );
}
