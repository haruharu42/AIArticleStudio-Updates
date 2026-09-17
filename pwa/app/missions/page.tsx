"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import questStyles from "@/components/creator-quests.module.css";
import styles from "@/components/creator-system.module.css";
import {
  claimCreatorMissionReward,
  getMyCreatorDashboard,
  getMyCreatorMissions,
  type CreatorDashboard,
  type CreatorMission,
} from "@/lib/creator-system";
import { getSupabaseClient } from "@/lib/supabase";

function cadenceLabel(cadence: CreatorMission["cadence"]): string {
  if (cadence === "weekly") return "WEEKLY";
  if (cadence === "lifetime") return "ACHIEVEMENT";
  return "DAILY";
}

export default function CreatorMissionsPage() {
  const [dashboard, setDashboard] = useState<CreatorDashboard | null>(null);
  const [missions, setMissions] = useState<CreatorMission[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const client = getSupabaseClient();
      const [nextDashboard, nextMissions] = await Promise.all([
        getMyCreatorDashboard(client),
        getMyCreatorMissions(client),
      ]);
      setDashboard(nextDashboard);
      setMissions(nextMissions);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ミッションを読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void load();
    });
    return () => { active = false; };
  }, [load]);

  async function claim(mission: CreatorMission) {
    if (!mission.canClaim || claiming) return;
    setClaiming(mission.missionCode);
    setMessage("");
    setError("");
    try {
      const client = getSupabaseClient();
      const result = await claimCreatorMissionReward(client, mission.missionCode);
      setMessage(`${mission.title} の報酬を受け取りました。+${result.rewardXp} XP`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "報酬を受け取れませんでした。");
    } finally {
      setClaiming("");
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.pageInner}>
        <header className={styles.pageHeader}>
          <div>
            <p className={styles.eyebrow}>CREATOR MISSIONS</p>
            <h1>ミッション</h1>
            <p>記事制作を進めるだけで達成できます。無理なログイン維持や連続利用の強制はありません。</p>
          </div>
          <Link className={styles.backLink} href="/">← ホームへ</Link>
        </header>

        {dashboard ? (
          <section className={styles.panel}>
            <div className={questStyles.missionSummary}>
              <div><small>CREATOR LEVEL</small><strong>Lv.{dashboard.level}</strong></div>
              <div><small>CLAIMABLE</small><strong>{dashboard.claimableMissions}</strong></div>
              <div><small>PLAN</small><strong>{dashboard.membershipPlanName || "Standard"}</strong></div>
              <div><small>ARTICLE XP</small><strong>×{dashboard.articleXpMultiplier.toFixed(1)}</strong></div>
            </div>
          </section>
        ) : null}

        {message ? <div className={styles.success}>{message}</div> : null}
        {error ? <div className={styles.error}>{error}</div> : null}
        {loading ? <div className={styles.empty}>ミッションを読み込んでいます…</div> : null}

        {!loading && !error ? (
          <section className={questStyles.missionGrid} aria-label="利用可能なミッション">
            {missions.map((mission) => {
              const percent = Math.min(100, Math.round((mission.progress / mission.targetCount) * 100));
              return (
                <article className={questStyles.missionCard} key={mission.missionCode}>
                  <div className={questStyles.missionHeader}>
                    <span className={styles.tierBadge}>{cadenceLabel(mission.cadence)}</span>
                    {mission.minimumTierRank > 0 ? <span className={styles.memberBadge}>◆ MEMBER</span> : null}
                  </div>
                  <h2>{mission.title}</h2>
                  <p>{mission.description}</p>
                  <div className={questStyles.missionProgressText}>
                    <span>{mission.progress} / {mission.targetCount}</span>
                    <strong>+{mission.rewardXp} XP</strong>
                  </div>
                  <div className={styles.progress} aria-label={`${mission.title} ${percent}%`}><span style={{ width: `${percent}%` }} /></div>
                  {mission.claimed ? (
                    <div className={styles.success}>受け取り済み</div>
                  ) : mission.canClaim ? (
                    <button className={styles.primaryButton} type="button" disabled={Boolean(claiming)} onClick={() => claim(mission)}>
                      {claiming === mission.missionCode ? "受け取り中…" : "報酬を受け取る"}
                    </button>
                  ) : (
                    <div className={styles.notice}>記事を最後まで完成すると自動で進みます。</div>
                  )}
                </article>
              );
            })}
          </section>
        ) : null}

        {!loading && !error && missions.length === 0 ? <div className={styles.empty}>現在利用できるミッションはありません。</div> : null}
      </div>
    </main>
  );
}
