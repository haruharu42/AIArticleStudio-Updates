"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  formatRefreshCadence,
  getMyCreatorDashboard,
  listCreatorMembershipPlans,
  type CreatorDashboard,
  type CreatorMembershipPlan,
} from "@/lib/creator-system";
import { getSupabaseClient } from "@/lib/supabase";
import styles from "@/components/creator-system.module.css";

export default function CreatorMembershipPage() {
  const [dashboard, setDashboard] = useState<CreatorDashboard | null>(null);
  const [plans, setPlans] = useState<CreatorMembershipPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const client = getSupabaseClient();
      const [nextDashboard, nextPlans] = await Promise.all([
        getMyCreatorDashboard(client),
        listCreatorMembershipPlans(client),
      ]);
      setDashboard(nextDashboard);
      setPlans(nextPlans);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Creator Club特典を読み込めませんでした。");
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

  return (
    <main className={styles.page}>
      <div className={styles.pageInner}>
        <header className={styles.pageHeader}>
          <div>
            <p className={styles.eyebrow}>CREATOR CLUB</p>
            <h1>メンバー特典</h1>
            <p>加入しているnoteメンバーシップのプランに応じて、AAS内の恩恵を自動で切り替えられる構成です。</p>
          </div>
          <Link className={styles.backLink} href="/">← ホームへ</Link>
        </header>

        {dashboard ? (
          <section className={styles.panel}>
            <h2>現在の利用状態</h2>
            <div className={styles.missionSummary}>
              <div><small>PLAN</small><strong>{dashboard.membershipPlanName || "Standard"}</strong></div>
              <div><small>KNOWLEDGE</small><strong>{dashboard.knowledgeTier === "fresh" ? "Fresh" : "Stable"}</strong></div>
              <div><small>ARTICLE XP</small><strong>×{dashboard.articleXpMultiplier.toFixed(1)}</strong></div>
              <div><small>記事枠ボーナス</small><strong>+{dashboard.creatorArticleQuotaBonus}</strong></div>
            </div>
          </section>
        ) : null}

        {loading ? <div className={styles.empty}>Creator Club特典を読み込んでいます…</div> : null}
        {error ? <div className={styles.error}>{error}</div> : null}

        {!loading && !error ? (
          <section className={styles.planGrid} aria-label="Creator Clubプラン">
            {plans.map((plan) => (
              <article className={`${styles.planCard} ${plan.isCurrent ? styles.planCurrent : ""}`} key={plan.planCode}>
                <div className={styles.missionHeader}>
                  <span className={styles.memberBadge}>{plan.badgeLabel}</span>
                  {plan.isCurrent ? <span className={styles.tierBadge}>利用中</span> : null}
                </div>
                <h2>{plan.displayName}</h2>
                <p>プラン変更時も記事・プロフィール・Creator Levelはそのまま保持されます。</p>
                <div className={styles.planBenefits}>
                  <div><small>AI Knowledge</small><strong>{plan.knowledgeChannel === "fresh" ? "Fresh" : "Stable"} / {formatRefreshCadence(plan.knowledgeRefreshHours)}</strong></div>
                  <div><small>完成記事XP</small><strong>×{plan.articleXpMultiplier.toFixed(1)}</strong></div>
                  <div><small>記事ストック上限</small><strong>+{plan.articleQuotaBonus}</strong></div>
                  <div><small>テンプレートTier</small><strong>{plan.templateTier.toUpperCase()}</strong></div>
                </div>
              </article>
            ))}
          </section>
        ) : null}

        <div className={styles.notice}>
          AAS側ではプランと特典を分離して管理しています。note側のプラン名や特典を後から変更しても、AASの主要機能を作り直さず設定を差し替えられます。
        </div>
      </div>
    </main>
  );
}
