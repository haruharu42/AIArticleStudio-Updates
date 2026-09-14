"use client";

import { useEffect, useState } from "react";

import { getMyFreeTrialStatus, type FreeTrialStatus } from "@/lib/free-trial";
import { getSupabaseClient } from "@/lib/supabase";

function formatEnd(value: string | null): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

export function FreeTrialBanner() {
  const [status, setStatus] = useState<FreeTrialStatus | null>(null);

  useEffect(() => {
    let active = true;
    void getMyFreeTrialStatus(getSupabaseClient()).then(
      (next) => { if (active) setStatus(next); },
      () => { if (active) setStatus(null); },
    );
    return () => { active = false; };
  }, []);

  if (!status || status.bypassLimits || status.trialStatus !== "active") return null;

  const remaining = Math.max(0, status.dailyTotalLimit - status.totalUsed);
  return (
    <section className="free-trial-banner" aria-label="無料トライアル状態">
      <div>
        <span className="free-trial-badge">7日無料トライアル</span>
        <strong>残り {status.remainingDays ?? 0} 日</strong>
        <small>終了予定 {formatEnd(status.endsAt)}</small>
      </div>
      <div className="free-trial-usage">
        <span>本日の利用</span>
        <strong>{status.totalUsed} / {status.dailyTotalLimit} 回</strong>
        <small>残り {remaining} 回 · {status.resetTimezone} {String(status.resetHour).padStart(2, "0")}:00 リセット</small>
      </div>
      <a href="/plans">料金プランを見る</a>
    </section>
  );
}
