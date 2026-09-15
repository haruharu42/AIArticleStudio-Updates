"use client";

import { useCallback, useEffect, useState } from "react";

import {
  FREE_TRIAL_USAGE_CHANGED_EVENT,
  getMyFreeTrialStatus,
  type FreeTrialStatus,
} from "@/lib/free-trial";
import { fetchPublicSalesSettings, type SalesSettings } from "@/lib/sales-settings";
import { getSupabaseClient } from "@/lib/supabase";

function formatEnd(value: string | null): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

function dismissedKey(usageDate: string): string {
  return `aas:free-trial-limit-dismissed:${usageDate}`;
}

export function FreeTrialBanner() {
  const [status, setStatus] = useState<FreeTrialStatus | null>(null);
  const [sales, setSales] = useState<SalesSettings | null>(null);
  const [showLimitDialog, setShowLimitDialog] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const next = await getMyFreeTrialStatus(getSupabaseClient());
      setStatus(next);
      if (next.bypassLimits || next.trialStatus !== "active") {
        setShowLimitDialog(false);
        return;
      }
      const remaining = Math.max(0, next.dailyTotalLimit - next.totalUsed);
      if (remaining > 0) {
        setShowLimitDialog(false);
        return;
      }
      const dismissed = window.localStorage.getItem(dismissedKey(next.usageDate)) === "1";
      setShowLimitDialog(!dismissed);
    } catch {
      setStatus(null);
      setShowLimitDialog(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      loadStatus(),
      fetchPublicSalesSettings().then((next) => { if (active) setSales(next); }),
    ]);

    const refresh = () => { if (active) void loadStatus(); };
    window.addEventListener(FREE_TRIAL_USAGE_CHANGED_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener(FREE_TRIAL_USAGE_CHANGED_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [loadStatus]);

  if (!status || status.bypassLimits || status.trialStatus !== "active") return null;

  const remaining = Math.max(0, status.dailyTotalLimit - status.totalUsed);
  const purchaseUrl = sales?.externalSalesEnabled && sales.externalSalesUrl ? sales.externalSalesUrl : "";
  const closeLimitDialog = () => {
    try {
      window.localStorage.setItem(dismissedKey(status.usageDate), "1");
    } catch {
      // Dismiss still works for this render even when storage is unavailable.
    }
    setShowLimitDialog(false);
  };

  return (
    <>
      <section className="free-trial-banner" aria-label="無料トライアル状態">
        <div>
          <span className="free-trial-badge">無料トライアル</span>
          <strong>残り {status.remainingDays ?? 0} 日</strong>
          <small>終了予定 {formatEnd(status.endsAt)}</small>
        </div>
        <div className="free-trial-usage">
          <span>本日の利用</span>
          <strong>{status.totalUsed} / {status.dailyTotalLimit} 回</strong>
          <small>残り {remaining} 回 · {status.resetTimezone} {String(status.resetHour).padStart(2, "0")}:00 リセット</small>
        </div>
        {purchaseUrl ? (
          <a href={purchaseUrl} target="_blank" rel="noopener noreferrer">利用権を見る</a>
        ) : (
          <a href="/plans">利用プランを見る</a>
        )}
      </section>

      {showLimitDialog && (
        <div className="free-limit-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeLimitDialog(); }}>
          <section className="free-limit-dialog" role="dialog" aria-modal="true" aria-labelledby="free-limit-title">
            <button className="free-limit-close" type="button" aria-label="閉じる" onClick={closeLimitDialog}>×</button>
            <span className="free-trial-badge">本日の無料枠を使い切りました</span>
            <h2 id="free-limit-title">明日になると無料利用回数が戻ります</h2>
            <p>{status.resetTimezone} {String(status.resetHour).padStart(2, "0")}:00 のリセット後に、管理者が設定した1日分の無料回数を再び利用できます。</p>
            {purchaseUrl && (
              <p>今すぐ継続して利用する場合は、外部販売ページで利用権をご確認ください。購入後に案内される利用コードをAASへ登録すると、有効な利用権として利用できます。</p>
            )}
            <div className="free-limit-actions">
              {purchaseUrl && <a className="primary-action" href={purchaseUrl} target="_blank" rel="noopener noreferrer">利用権を見る ↗</a>}
              <button className="secondary-action" type="button" onClick={closeLimitDialog}>閉じる</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
