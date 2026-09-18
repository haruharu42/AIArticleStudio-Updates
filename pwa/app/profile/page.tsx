"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { AasReferenceBottomNav, AasReferenceHeader } from "@/components/aas-reference-shell";
import { getMyCreatorDashboard, updateMyCreatorProfile, xpProgress, type CreatorDashboard } from "@/lib/creator-system";
import { GENRE_OPTIONS } from "@/lib/phase18-content-options";
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

function avatarLetter(name: string): string {
  return (name.trim().charAt(0) || "C").toUpperCase();
}

function avatarUrlValidationMessage(value: string): string {
  const candidate = value.trim();
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    if (url.protocol === "https:" || url.protocol === "http:") return "";
  } catch {
    // Handled by the common validation message below.
  }
  return "プロフィール画像URLは http:// または https:// で始まる正しいURLを入力してください。";
}

function Achievement({
  icon,
  title,
  description,
  achieved,
}: {
  icon: string;
  title: string;
  description: string;
  achieved: boolean;
}) {
  return (
    <article className={`${styles.referenceAchievement} ${achieved ? styles.referenceAchievementDone : ""}`}>
      <span aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      <small>{achieved ? description : "まだ未達成です"}</small>
    </article>
  );
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
    setMessage("");
    setError("");
    if (form.rankingOptIn && !form.publicName.trim()) {
      setError("ランキングへ参加するには表示名を入力してください。");
      return;
    }
    const avatarUrlError = avatarUrlValidationMessage(form.avatarUrl);
    if (avatarUrlError) {
      setError(avatarUrlError);
      return;
    }
    setBusy(true);
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
      setMessage("プロフィールを保存しました。ランキング設定は次回の更新から反映されます。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "プロフィールを保存できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  const xp = useMemo(() => dashboard ? xpProgress(dashboard.totalXp, dashboard.level) : null, [dashboard]);

  return (
    <div className="reference-page">
      <AasReferenceHeader hasUnreadNotifications={Boolean(dashboard?.claimableMissions)} />
      <main className="reference-page-inner reference-profile-page">
        <div className="reference-title-row">
          <div>
            <Link className="reference-back" href="/" aria-label="ホームへ戻る">‹</Link>
            <div><h1>プロフィール</h1><p>公開プロフィールとランキングの表示範囲を設定できます。</p></div>
          </div>
        </div>

        {error && !form ? <div className={styles.error} role="alert">{error}</div> : null}

        {form && dashboard && xp ? (
          <form onSubmit={save} className={styles.referenceProfileForm}>
            <section className="reference-status-card">
              <span className="reference-avatar" aria-hidden="true">
                {dashboard.avatarUrl ? <img src={dashboard.avatarUrl} alt="" /> : avatarLetter(form.publicName || "Creator")}
              </span>
              <div className="reference-creator-main">
                <div className="reference-name-row">
                  <strong>{form.publicName || "公開名未設定"}</strong>
                  <span className="reference-level-pill">♛ Creator Lv.{dashboard.level}</span>
                </div>
                <div className="reference-xp-row">
                  <div className="reference-xp-track"><span style={{ width: `${xp.percent}%` }} /></div>
                  <b>{xp.current} / {xp.needed} XP</b>
                </div>
                <small className="reference-xp-note">あと {Math.max(0, xp.needed - xp.current)} XPで次のレベルです。</small>
              </div>
              <div className={styles.referenceMemberBox}>
                <span aria-hidden="true">♛</span>
                <strong>{dashboard.noteMember ? dashboard.membershipBadgeLabel || dashboard.membershipPlanName || "Creator Club" : "通常利用"}</strong>
                <small>{dashboard.noteMember ? `記事XP ×${dashboard.articleXpMultiplier.toFixed(1)}` : "Creator Level特典を利用中"}</small>
              </div>
            </section>

            <section className={styles.referenceProfileGrid}>
              <label className={styles.referenceProfileTile}>
                <span className={styles.referenceTileIcon}>♙</span>
                <span><strong>表示名</strong><small>ランキングや公開画面で使用</small></span>
                <input maxLength={40} value={form.publicName} onChange={(event) => setForm({ ...form, publicName: event.target.value })} placeholder="例：はる Creator" />
              </label>

              <label className={styles.referenceProfileTile}>
                <span className={styles.referenceTileIcon}>▧</span>
                <span><strong>自己紹介</strong><small>どんな記事を作っているか紹介</small></span>
                <textarea maxLength={300} value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} placeholder="AIで広がる創作の楽しさを発信しています。" />
              </label>

              <label className={styles.referenceProfileTile}>
                <span className={styles.referenceTileIcon}>◇</span>
                <span><strong>得意ジャンル</strong><small>よく作る記事ジャンル</small></span>
                <select value={GENRE_OPTIONS.includes(form.favoriteGenre as (typeof GENRE_OPTIONS)[number]) ? form.favoriteGenre : ""} onChange={(event) => setForm({ ...form, favoriteGenre: event.target.value })}>
                  <option value="">未設定</option>
                  {GENRE_OPTIONS.filter((genre) => genre !== "その他").map((genre) => <option key={genre} value={genre}>{genre}</option>)}
                </select>
              </label>

              <label className={styles.referenceProfileTile}>
                <span className={styles.referenceTileIcon}>◎</span>
                <span><strong>目標</strong><small>今後の制作目標</small></span>
                <input maxLength={200} value={form.creatorGoal} onChange={(event) => setForm({ ...form, creatorGoal: event.target.value })} placeholder="例：今月はマガジンを1冊完成させる" />
              </label>

              <label className={`${styles.referenceProfileTile} ${styles.referenceProfileTileWide}`}>
                <span className={styles.referenceTileIcon}>◉</span>
                <span><strong>プロフィール画像URL</strong><small>未設定の場合は公開名の頭文字を表示</small></span>
                <input maxLength={2048} value={form.avatarUrl} onChange={(event) => setForm({ ...form, avatarUrl: event.target.value })} placeholder="https://..." inputMode="url" />
              </label>
            </section>

            <section className={styles.referenceProfileSection}>
              <div className={styles.referenceSectionTitle}><span>▥</span><div><h2>ランキング公開設定</h2><p>公開する情報は自分で選べます。</p></div></div>
              <div className={styles.referenceToggleGrid}>
                <label className={styles.referenceSwitchCard}>
                  <span><strong>ランキングに参加する</strong><small>OFFでも自分のXP・レベルは利用できます。</small></span>
                  <input type="checkbox" checked={form.rankingOptIn} onChange={(event) => setForm({ ...form, rankingOptIn: event.target.checked })} />
                </label>
                <label className={styles.referenceSwitchCard}>
                  <span><strong>記事数を公開</strong><small>完成した記事数だけを表示</small></span>
                  <input type="checkbox" checked={form.showCompletedArticles} onChange={(event) => setForm({ ...form, showCompletedArticles: event.target.checked })} />
                </label>
                <label className={styles.referenceSwitchCard}>
                  <span><strong>レベルを公開</strong><small>Creator Levelをランキングに表示</small></span>
                  <input type="checkbox" checked={form.showLevel} onChange={(event) => setForm({ ...form, showLevel: event.target.checked })} />
                </label>
              </div>
            </section>

            <section className={styles.referenceProfileSection}>
              <div className={styles.referenceSectionTitle}><span>🏅</span><div><h2>実績・バッジ</h2><p>実データから達成状況を表示します。</p></div></div>
              <div className={styles.referenceAchievementGrid}>
                <Achievement icon="▧" title="初記事完成" description="最初の記事を完成しました" achieved={dashboard.completedArticles >= 1} />
                <Achievement icon="🔥" title="7日継続" description="7日以上の連続記録を達成しました" achieved={dashboard.bestStreak >= 7} />
                <Achievement icon="▤" title="マガジン編集者" description="マガジンを完成しました" achieved={dashboard.completedMagazines >= 1} />
              </div>
            </section>

            <section className={styles.referenceProfileSection}>
              <div className={styles.referenceSectionTitle}><span>▥</span><div><h2>制作データ</h2><p>完成した記事だけが完成記事数に加算されます。</p></div></div>
              <div className={styles.referenceDataGrid}>
                <div><span>▧</span><small>完成記事数</small><strong>{dashboard.completedArticles}<em>記事</em></strong></div>
                <div><span>✎</span><small>今週XP</small><strong>{dashboard.weeklyXp}<em>XP</em></strong></div>
                <div><span>▤</span><small>マガジン数</small><strong>{dashboard.completedMagazines}<em>個</em></strong></div>
                <div><span>🔥</span><small>連続日数</small><strong>{dashboard.currentStreak}<em>日</em></strong></div>
              </div>
            </section>

            <button className={styles.referenceSaveButton} type="submit" disabled={busy}>✦ {busy ? "保存中…" : "プロフィールを保存"}</button>
            {message && <div className={styles.success} role="status" aria-live="polite">{message}</div>}
            {error && <div className={styles.error} role="alert">{error}</div>}
          </form>
        ) : !error ? <div className={styles.notice} role="status" aria-live="polite">プロフィールを読み込んでいます…</div> : null}
      </main>
      <AasReferenceBottomNav active="profile" />
    </div>
  );
}
