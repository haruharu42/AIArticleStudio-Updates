"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { getCreatorRanking, getMyCreatorDashboard, type CreatorDashboard, type RankingKey, type RankingRow } from "@/lib/creator-system";
import { getSupabaseClient } from "@/lib/supabase";
import styles from "@/components/creator-system.module.css";

const TABS: Array<{ key: RankingKey; label: string }> = [
  { key: "level", label: "Creator Level" },
  { key: "completed_articles", label: "完成記事数" },
  { key: "weekly_xp", label: "今週XP" },
];

function displayTime(value: string): string {
  if (!value) return "まだ更新されていません";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "更新時刻不明";
  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function nextRefresh(value: string, hours: number): string {
  if (!value) return "初回ランキング更新を待っています";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "次回更新時刻を確認中";
  date.setTime(date.getTime() + hours * 60 * 60 * 1000);
  return displayTime(date.toISOString());
}

function metricLabel(row: RankingRow, key: RankingKey): string {
  if (key === "level") return `Lv.${row.metricValue}`;
  if (key === "completed_articles") return `${row.metricValue}記事`;
  return `${row.metricValue} XP`;
}

function avatarLetter(name: string): string {
  return (name.trim().charAt(0) || "C").toUpperCase();
}

export default function CreatorRankingPage() {
  const [key, setKey] = useState<RankingKey>("level");
  const [dashboard, setDashboard] = useState<CreatorDashboard | null>(null);
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (rankingKey: RankingKey) => {
    try {
      const client = getSupabaseClient();
      const [nextDashboard, nextRows] = await Promise.all([
        getMyCreatorDashboard(client),
        getCreatorRanking(client, rankingKey, 50),
      ]);
      setDashboard(nextDashboard);
      setRows(nextRows);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ランキングを読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(key); }, [key, load]);

  function chooseRanking(nextKey: RankingKey) {
    if (nextKey === key) return;
    setLoading(true);
    setError("");
    setKey(nextKey);
  }

  const updatedAt = useMemo(() => rows[0]?.generatedAt || dashboard?.rankingLastGeneratedAt || "", [dashboard, rows]);

  return (
    <main className={styles.page}>
      <div className={styles.pageInner}>
        <header className={styles.pageHeader}>
          <div>
            <p className={styles.eyebrow}>CREATOR RANKING</p>
            <h1>ランキング</h1>
            <p>ランキングは12時間ごとのスナップショットです。記事完成数やXPは自分のプロフィールにはすぐ反映されます。</p>
          </div>
          <Link className={styles.backLink} href="/">← ホームへ</Link>
        </header>

        <section className={styles.panel}>
          <div className={styles.rankTabs} role="tablist" aria-label="ランキング種別">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={key === tab.key}
                className={`${styles.rankTab} ${key === tab.key ? styles.rankTabActive : ""}`}
                onClick={() => chooseRanking(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {dashboard ? (
            <div className={styles.notice}>
              最終更新：{displayTime(updatedAt)} ／ 次回目安：{nextRefresh(updatedAt, dashboard.rankingRefreshHours)}
              {!dashboard.rankingOptIn ? "　あなたは現在ランキング非参加です。プロフィール設定からいつでも参加できます。" : ""}
            </div>
          ) : null}

          {loading ? <div className={styles.empty}>ランキングを読み込んでいます…</div> : null}
          {error ? <div className={styles.error}>{error}</div> : null}

          {!loading && !error && rows.length > 0 ? (
            <div className={styles.rankList}>
              {rows.map((row) => (
                <article key={`${row.rankingKey}-${row.rankPosition}-${row.publicName}`} className={`${styles.rankCard} ${row.isMe ? styles.rankMe : ""}`}>
                  <span className={styles.rankPosition}>#{row.rankPosition}</span>
                  <span className={styles.rankAvatar} aria-hidden="true">
                    {row.avatarUrl ? <img src={row.avatarUrl} alt="" /> : avatarLetter(row.publicName)}
                  </span>
                  <div className={styles.rankName}>
                    <strong>{row.publicName}{row.isMe ? "（あなた）" : ""}</strong>
                    <small>
                      {row.level !== null ? `Lv.${row.level}` : "Lv.非公開"}
                      {row.completedArticles !== null ? ` · 完成 ${row.completedArticles}記事` : " · 記事数非公開"}
                    </small>
                  </div>
                  <span className={styles.rankMetric}>{metricLabel(row, key)}</span>
                </article>
              ))}
            </div>
          ) : null}

          {!loading && !error && rows.length === 0 ? (
            <div className={styles.empty}>
              まだこのランキングに参加者がいません。<br />
              公開名を設定してランキング参加をONにすると、次回の12時間更新から反映されます。
            </div>
          ) : null}

          <div className={styles.notice}>
            完成記事数は、タイトルと本文があり記事ステータスが「完成・公開待ち・公開済み」になった最初の1回だけ加算します。再編集やステータスの往復では二重加算しません。
          </div>
          <Link className={styles.actionLink} href="/profile">⚙ プロフィール・公開設定を変更</Link>
        </section>
      </div>
    </main>
  );
}
