"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { loadOpsSnapshot, type OpsSnapshot } from "@/lib/operations-admin";
import { getSupabaseClient } from "@/lib/supabase";

const SUPABASE_USAGE_URL = "https://supabase.com/dashboard/org/_/usage";
const SUPABASE_BILLING_URL = "https://supabase.com/dashboard/org/_/billing";
const SUPABASE_PRICING_URL = "https://supabase.com/pricing";

const plans = [
  {
    name: "Free",
    price: "$0 / month",
    detail: "Database 500 MB / Storage 1 GB / 50,000 MAU / 5 GB egress",
  },
  {
    name: "Pro",
    price: "From $25 / month",
    detail: "Database disk 8 GB / Storage 100 GB / 100,000 MAU / 250 GB egress / daily backup 7 days",
  },
  {
    name: "Team",
    price: "From $599 / month",
    detail: "Pro相当の利用枠に加え、SSO・より長いバックアップ保持・組織向け機能",
  },
  {
    name: "Enterprise",
    price: "Custom",
    detail: "大規模運用向け。料金と利用枠は個別契約です。",
  },
] as const;

function formatBytes(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value < 1024) return `${Math.max(0, Math.round(value))} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let next = Math.max(0, value);
  let unit = -1;
  do {
    next /= 1024;
    unit += 1;
  } while (next >= 1024 && unit < units.length - 1);
  return `${next >= 100 ? next.toFixed(0) : next >= 10 ? next.toFixed(1) : next.toFixed(2)} ${units[unit]}`;
}

function usageText(used: number, limit: number | null, percent: number | null): string {
  if (limit === null || percent === null) return `${formatBytes(used)} 使用中 / 上限未設定`;
  return `${formatBytes(used)} / ${formatBytes(limit)} (${percent.toFixed(1)}%)`;
}

export function SupabasePlanUsageGuide() {
  const [snapshot, setSnapshot] = useState<OpsSnapshot | null>(null);
  const [loadError, setLoadError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await loadOpsSnapshot(getSupabaseClient()));
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Supabase使用量を取得できませんでした。");
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const capacity = snapshot?.capacity ?? null;
  const currentPlan = capacity?.planLabel || "未確認";
  const normalizedPlan = currentPlan.trim().toLowerCase();
  const cards = useMemo(() => plans.map((plan) => ({
    ...plan,
    current: normalizedPlan === plan.name.toLowerCase(),
  })), [normalizedPlan]);

  return (
    <div className="admin-page" style={{ paddingBottom: 0 }}>
      <section className="admin-panel admin-dashboard-section" aria-label="Supabaseプランと料金">
        <div className="admin-panel-heading">
          <div>
            <p className="eyebrow">SUPABASE PLAN & USAGE</p>
            <h2>Supabaseプラン・使用量・料金</h2>
          </div>
          <button className="secondary-action" type="button" onClick={() => void refresh()}>
            使用量を更新
          </button>
        </div>

        <p className="trial-admin-note">
          AASの容量監視値とSupabase公式料金をまとめて確認できます。プラン変更・請求操作はAAS内では行わず、Supabase公式Billingで実行します。
        </p>

        {loadError && <p className="route-notice error">{loadError}</p>}

        <div className="ops-capacity-grid" style={{ marginTop: 14 }}>
          <article className="ops-capacity-card">
            <header><span>現在プラン</span><strong>{currentPlan}</strong></header>
            <small>プラン変更後は、下の既存「容量監視設定」も新しい契約枠に合わせて更新してください。</small>
          </article>
          <article className="ops-capacity-card">
            <header><span>Database</span><strong>{capacity ? `${capacity.database.percent?.toFixed(1) ?? "—"}%` : "確認中"}</strong></header>
            <small>{capacity ? usageText(capacity.database.usedBytes, capacity.database.limitBytes, capacity.database.percent) : "使用量を取得しています…"}</small>
          </article>
          <article className="ops-capacity-card">
            <header><span>Storage</span><strong>{capacity ? `${capacity.storage.percent?.toFixed(1) ?? "—"}%` : "確認中"}</strong></header>
            <small>{capacity ? usageText(capacity.storage.usedBytes, capacity.storage.limitBytes, capacity.storage.percent) : "使用量を取得しています…"}</small>
          </article>
        </div>

        <div className="admin-actions" style={{ marginTop: 16 }}>
          <a className="primary-action" href={SUPABASE_BILLING_URL} target="_blank" rel="noreferrer">Supabase Billing・プラン変更を開く ↗</a>
          <a className="secondary-action" href={SUPABASE_USAGE_URL} target="_blank" rel="noreferrer">Supabase公式Usageを開く ↗</a>
          <a className="secondary-action" href={SUPABASE_PRICING_URL} target="_blank" rel="noreferrer">最新料金を確認 ↗</a>
        </div>

        <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
          {cards.map((plan) => (
            <article className="choice-card compact" key={plan.name}>
              <span>
                <small>{plan.current ? "現在の設定" : "Supabase plan"}</small>
                <strong>{plan.name} — {plan.price}</strong>
                <small>{plan.detail}</small>
              </span>
            </article>
          ))}
        </div>

        <p className="trial-admin-note" style={{ marginTop: 14 }}>
          料金は2026-09-17時点のSupabase公式公開価格（USD）の目安です。税、為替、追加Compute、超過利用、Add-on等で実際の請求額は変わります。Proは有料プランのCompute creditを含むため、構成によって月額が変動します。
        </p>
      </section>
    </div>
  );
}
