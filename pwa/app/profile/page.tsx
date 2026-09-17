"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { getMyCreatorDashboard, updateMyCreatorProfile, type CreatorDashboard } from "@/lib/creator-system";
import { getSupabaseClient } from "@/lib/supabase";
import styles from "@/components/creator-system.module.css";

type FormState = {
  publicName: string;
  bio: string;
  avatarUrl: string;
  favoriteGenre: string;
  creatorGoal: string;
  rankingOptIn: boolean;
  showLevel: boolean;
  showCompletedArticles: boolean;
};

function toForm(data: CreatorDashboard): FormState {
  return {
    publicName: data.publicName,
    bio: data.bio,
    avatarUrl: data.avatarUrl,
    favoriteGenre: data.favoriteGenre,
    creatorGoal: data.creatorGoal,
    rankingOptIn: data.rankingOptIn,
    showLevel: data.showLevel,
    showCompletedArticles: data.showCompletedArticles,
  };
}

export default function CreatorProfilePage() {
  const [dashboard, setDashboard] = useState<CreatorDashboard | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let client: ReturnType<typeof getSupabaseClient>;
    try {
      client = getSupabaseClient();
    } catch {
      queueMicrotask(() => {
        if (active) setError("プロフィールを読み込めませんでした。");
      });
      return () => { active = false; };
    }

    queueMicrotask(() => {
      if (!active) return;
      void getMyCreatorDashboard(client).then(
        (next) => {
          if (!active) return;
          setDashboard(next);
          setForm(toForm(next));
        },
        (reason: unknown) => {
          if (active) setError(reason instanceof Error ? reason.message : "プロフィールを読み込めませんでした。");
        },
      );
    });
    return () => { active = false; };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || busy) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const client = getSupabaseClient();
      await updateMyCreatorProfile(client, {
        public_name: form.publicName,
        bio: form.bio,
        avatar_url: form.avatarUrl,
        favorite_genre: form.favoriteGenre,
        creator_goal: form.creatorGoal,
        ranking_opt_in: form.rankingOptIn,
        show_level: form.showLevel,
        show_completed_articles: form.showCompletedArticles,
      });
      const next = await getMyCreatorDashboard(client);
      setDashboard(next);
      setForm(toForm(next));
      setMessage("プロフィールを保存しました。ランキング設定は次回の12時間更新から反映されます。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "プロフィールを保存できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.pageInner}>
        <header className={styles.pageHeader}>
          <div>
            <p className={styles.eyebrow}>CREATOR PROFILE</p>
            <h1>プロフィール設定</h1>
            <p>公開する情報は自分で選べます。ランキング参加は初期状態ではOFFです。</p>
          </div>
          <Link className={styles.backLink} href="/">← ホームへ</Link>
        </header>

        {error && !form ? <div className={styles.error}>{error}</div> : null}

        {form && dashboard ? (
          <div className={styles.gridTwo}>
            <form className={styles.panel} onSubmit={save}>
              <h2>公開プロフィール</h2>
              <p className={styles.panelLead}>ログイン情報やメールアドレスとは分離され、ランキングではここで設定した公開名だけを使います。</p>
              <div className={styles.formGrid}>
                <label className={styles.field}>
                  公開名
                  <input maxLength={40} value={form.publicName} onChange={(event) => setForm({ ...form, publicName: event.target.value })} placeholder="例：はる Creator" />
                </label>
                <label className={styles.field}>
                  自己紹介
                  <textarea maxLength={300} value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} placeholder="どんな記事を作っているかを短く紹介できます。" />
                </label>
                <label className={styles.field}>
                  得意・好きなジャンル
                  <input maxLength={120} value={form.favoriteGenre} onChange={(event) => setForm({ ...form, favoriteGenre: event.target.value })} placeholder="例：AI副業 / ガジェット" />
                </label>
                <label className={styles.field}>
                  Creator目標
                  <input maxLength={200} value={form.creatorGoal} onChange={(event) => setForm({ ...form, creatorGoal: event.target.value })} placeholder="例：今月はマガジンを1冊完成させる" />
                </label>
                <label className={styles.field}>
                  アイコン画像URL（任意）
                  <input maxLength={2048} value={form.avatarUrl} onChange={(event) => setForm({ ...form, avatarUrl: event.target.value })} placeholder="https://..." inputMode="url" />
                </label>
              </div>

              <div className={styles.toggleList}>
                <label className={styles.toggle}>
                  <input type="checkbox" checked={form.rankingOptIn} onChange={(event) => setForm({ ...form, rankingOptIn: event.target.checked })} />
                  <span>ランキングに参加する<small>OFFのままでもレベル・XP・完成記事数は自分の画面で利用できます。</small></span>
                </label>
                <label className={styles.toggle}>
                  <input type="checkbox" checked={form.showLevel} onChange={(event) => setForm({ ...form, showLevel: event.target.checked })} />
                  <span>ランキングでレベルを表示する</span>
                </label>
                <label className={styles.toggle}>
                  <input type="checkbox" checked={form.showCompletedArticles} onChange={(event) => setForm({ ...form, showCompletedArticles: event.target.checked })} />
                  <span>ランキングで完成記事数を表示する<small>作成途中の記事はカウントされません。</small></span>
                </label>
              </div>

              <button className={styles.primaryButton} type="submit" disabled={busy}>{busy ? "保存中…" : "プロフィールを保存"}</button>
              {message && <div className={styles.success}>{message}</div>}
              {error && <div className={styles.error}>{error}</div>}
            </form>

            <aside className={styles.panel}>
              <h2>Creator Status</h2>
              <p className={styles.panelLead}>記事は「完成」まで進めた最初の1回だけ実績に加算されます。再編集やステータス往復では増えません。</p>
              <div className={styles.statGrid}>
                <div className={styles.miniStat}><small>LEVEL</small><strong>{dashboard.level}</strong></div>
                <div className={styles.miniStat}><small>TOTAL XP</small><strong>{dashboard.totalXp}</strong></div>
                <div className={styles.miniStat}><small>完成記事</small><strong>{dashboard.completedArticles}</strong></div>
                <div className={styles.miniStat}><small>今週XP</small><strong>{dashboard.weeklyXp}</strong></div>
                <div className={styles.miniStat}><small>連続制作</small><strong>{dashboard.currentStreak}日</strong></div>
                <div className={styles.miniStat}><small>BEST</small><strong>{dashboard.bestStreak}日</strong></div>
              </div>
              <div className={styles.notice}>
                {dashboard.noteMember
                  ? `Creator Club特典：Fresh Knowledge（${dashboard.knowledgeRefreshHours}時間周期）`
                  : `通常利用：Stable Knowledge（${Math.round(dashboard.knowledgeRefreshHours / 24)}日周期）`}
              </div>
              <Link className={styles.actionLink} href="/ranking">🏆 ランキングを見る</Link>
            </aside>
          </div>
        ) : !error ? <div className={styles.notice}>プロフィールを読み込んでいます…</div> : null}
      </div>
    </main>
  );
}
