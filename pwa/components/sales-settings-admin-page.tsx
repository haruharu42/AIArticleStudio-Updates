"use client";

import { useEffect, useState } from "react";

import {
  loadAdminSalesSettings,
  updateAdminSalesSettings,
  type SalesSettings,
} from "@/lib/sales-settings";
import { getSupabaseClient } from "@/lib/supabase";

type Gate =
  | { kind: "loading" }
  | { kind: "signed_out" }
  | { kind: "denied" }
  | { kind: "ready"; aasId: string }
  | { kind: "error"; message: string };

const EMPTY: SalesSettings = {
  externalSalesEnabled: true,
  accessCodeEnabled: true,
  stripeCheckoutEnabled: false,
  pwa7DayEnabled: false,
  pwaMonthlyEnabled: false,
  windowsMonthlyEnabled: false,
  bundleMonthlyEnabled: false,
};

function Toggle({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange(value: boolean): void;
  title: string;
  description: string;
}) {
  return (
    <label className="sales-setting-row">
      <span><strong>{title}</strong><small>{description}</small></span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

export function SalesSettingsAdminPage() {
  const [gate, setGate] = useState<Gate>({ kind: "loading" });
  const [settings, setSettings] = useState<SalesSettings>(EMPTY);
  const [saved, setSaved] = useState<SalesSettings>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        const client = getSupabaseClient();
        const { data: { user }, error } = await client.auth.getUser();
        if (!active) return;
        if (error || !user) { setGate({ kind: "signed_out" }); return; }
        const { data: profile, error: profileError } = await client
          .from("profiles")
          .select("id,aas_user_id,role,status")
          .eq("id", user.id)
          .single();
        if (profileError || !profile || profile.id !== user.id) throw new Error("管理者プロフィールを確認できません。");
        if (profile.role !== "admin" || profile.status !== "active") { setGate({ kind: "denied" }); return; }
        const next = await loadAdminSalesSettings(client);
        if (!active) return;
        setSettings(next); setSaved(next); setGate({ kind: "ready", aasId: profile.aas_user_id });
      } catch (error) {
        if (active) setGate({ kind: "error", message: error instanceof Error ? error.message : "販売設定を初期化できませんでした。" });
      }
    };
    void boot();
    return () => { active = false; };
  }, []);

  const changed = JSON.stringify(settings) !== JSON.stringify(saved);
  const set = <K extends keyof SalesSettings>(key: K, value: SalesSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    if (busy || !changed) return;
    setBusy(true); setMessage("");
    try {
      await updateAdminSalesSettings(getSupabaseClient(), settings);
      const next = await loadAdminSalesSettings(getSupabaseClient());
      setSettings(next); setSaved(next);
      setMessage("販売・決済設定を保存しました。既存の契約・利用権は変更していません。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "販売・決済設定を保存できませんでした。");
    } finally { setBusy(false); }
  };

  if (gate.kind !== "ready") return (
    <main className="standalone-page"><section className="standalone-card">
      <p className="eyebrow">SALES & BILLING</p><h1>販売・決済設定</h1>
      {gate.kind === "loading" && <p className="route-notice">管理者権限を確認しています…</p>}
      {gate.kind === "signed_out" && <p className="route-notice error">先にログインしてください。</p>}
      {gate.kind === "denied" && <p className="route-notice error">active管理者のみ利用できます。</p>}
      {gate.kind === "error" && <p className="route-notice error">{gate.message}</p>}
      <a className="route-back" href="/admin">← 管理ダッシュボード</a>
    </section></main>
  );

  return (
    <main className="admin-page sales-settings-page">
      <header className="admin-head admin-dashboard-head">
        <div><p className="eyebrow">SALES & BILLING</p><h1>販売・決済設定</h1><p>{gate.aasId} / 新規販売の受付方法を管理します。</p></div>
        <div className="admin-head-actions"><a className="route-back" href="/admin">← 管理ダッシュボード</a></div>
      </header>

      <div className="route-notice">OFFにしても、既存の月額契約・利用期間・利用権は停止・取消しされません。新規受付だけを止めます。</div>
      {message && <div className="route-notice">{message}</div>}

      <section className="admin-panel sales-settings-section">
        <div className="admin-panel-heading"><div><p className="eyebrow">EXTERNAL SALES</p><h2>外部販売・利用コード</h2></div></div>
        <Toggle checked={settings.externalSalesEnabled} onChange={(value) => set("externalSalesEnabled", value)} title="note / Brain / Tips等の外部販売" description="外部サービスで販売する運用を受付中として表示します。" />
        <Toggle checked={settings.accessCodeEnabled} onChange={(value) => set("accessCodeEnabled", value)} title="利用コード受付" description="購入者へ渡した利用コード（既存の招待コード基盤）の新規登録を許可します。" />
      </section>

      <section className="admin-panel sales-settings-section">
        <div className="admin-panel-heading"><div><p className="eyebrow">STRIPE</p><h2>Stripe新規決済</h2></div></div>
        <Toggle checked={settings.stripeCheckoutEnabled} onChange={(value) => set("stripeCheckoutEnabled", value)} title="Stripe新規購入受付" description="全Stripeプラン共通のマスタースイッチです。OFFならCheckoutをサーバー側でも拒否します。" />
        <div className="sales-plan-grid">
          <Toggle checked={settings.pwa7DayEnabled} onChange={(value) => set("pwa7DayEnabled", value)} title="PWA 7日利用パス" description="自動更新なしの7日券を表示・受付します。" />
          <Toggle checked={settings.pwaMonthlyEnabled} onChange={(value) => set("pwaMonthlyEnabled", value)} title="PWA 月額プラン" description="PWA版の月額新規契約を表示・受付します。" />
          <Toggle checked={settings.windowsMonthlyEnabled} onChange={(value) => set("windowsMonthlyEnabled", value)} title="Windows 月額プラン" description="Windows版の月額新規契約を表示・受付します。" />
          <Toggle checked={settings.bundleMonthlyEnabled} onChange={(value) => set("bundleMonthlyEnabled", value)} title="PWA + Windows 月額" description="両方を使うセット月額の新規契約を表示・受付します。" />
        </div>
        {!settings.stripeCheckoutEnabled && <p className="sales-master-off">StripeマスタースイッチがOFFのため、個別プランをONにしても現在は購入できません。後日の販売準備として設定を保存できます。</p>}
      </section>

      <section className="admin-panel sales-current-mode">
        <h2>現在の販売モード</h2>
        <p><strong>外部販売:</strong> {settings.externalSalesEnabled ? "ON" : "OFF"} / <strong>利用コード:</strong> {settings.accessCodeEnabled ? "ON" : "OFF"} / <strong>Stripe:</strong> {settings.stripeCheckoutEnabled ? "ON" : "OFF"}</p>
        <p>初期運用は「外部販売 ON・利用コード ON・Stripe OFF」です。X等から直接集客する段階でPWA月額などをONにできます。</p>
      </section>

      <div className="sales-save-bar">
        <button type="button" className="primary-action" disabled={busy || !changed} onClick={() => void save()}>{busy ? "保存中…" : changed ? "変更を保存" : "保存済み"}</button>
        {changed && <button type="button" className="secondary-action" disabled={busy} onClick={() => setSettings(saved)}>変更を元に戻す</button>}
      </div>
    </main>
  );
}
