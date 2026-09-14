"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getAdminFreeTrialSettings,
  getAdminUserFreeTrial,
  resetAdminUserFreeTrialUsage,
  startAdminUserFreeTrial,
  updateAdminFreeTrialSettings,
  updateAdminUserFreeTrial,
  type AdminUserFreeTrial,
  type FreeTrialSettings,
} from "@/lib/free-trial";
import type { AdminUser } from "@/lib/phase10-admin";
import { getSupabaseClient } from "@/lib/supabase";

function localInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function displayDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

function trialStatusLabel(value: string): string {
  if (value === "active") return "利用中";
  if (value === "expired") return "終了";
  if (value === "stopped") return "停止中";
  return "未利用";
}

function NumberField({ label, value, min = 0, max = 10000, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (value: number) => void }) {
  return (
    <label className="route-field">
      <span>{label}</span>
      <input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Math.max(min, Math.min(max, Number(event.target.value) || 0)))} />
    </label>
  );
}

function UsageCell({ label, used, limit }: { label: string; used: number; limit: number }) {
  return <div><span>{label}</span><strong>{used} / {limit}</strong></div>;
}

export function FreeTrialAdminPanel({ selectedUser }: { selectedUser: AdminUser | null }) {
  const [settings, setSettings] = useState<FreeTrialSettings | null>(null);
  const [userTrial, setUserTrial] = useState<AdminUserFreeTrial | null>(null);
  const [userEnd, setUserEnd] = useState("");
  const [manualDays, setManualDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const loadSettings = useCallback(async () => {
    const next = await getAdminFreeTrialSettings(getSupabaseClient());
    setSettings(next);
    setManualDays(next.durationDays);
  }, []);

  const loadUser = useCallback(async () => {
    if (!selectedUser || selectedUser.role !== "user") {
      setUserTrial(null);
      setUserEnd("");
      return;
    }
    const next = await getAdminUserFreeTrial(getSupabaseClient(), selectedUser.id);
    setUserTrial(next);
    setUserEnd(localInput(next.endsAt));
  }, [selectedUser]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      void loadSettings().catch((error) => {
        if (active) setMessage(error instanceof Error ? error.message : "無料トライアル設定を取得できませんでした。");
      });
    });
    return () => { active = false; };
  }, [loadSettings]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      void loadUser().catch((error) => {
        if (active) setMessage(error instanceof Error ? error.message : "ユーザーの無料トライアル状態を取得できませんでした。");
      });
    });
    return () => { active = false; };
  }, [loadUser]);

  const patch = <K extends keyof FreeTrialSettings>(key: K, value: FreeTrialSettings[K]) => {
    setSettings((current) => current ? { ...current, [key]: value } : current);
  };

  const saveSettings = async () => {
    if (!settings) return;
    setBusy(true); setMessage("");
    try {
      await updateAdminFreeTrialSettings(getSupabaseClient(), settings);
      await Promise.all([loadSettings(), loadUser()]);
      setMessage("無料トライアル設定を保存しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "無料トライアル設定を保存できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const runUserAction = async (action: () => Promise<void>, success: string) => {
    setBusy(true); setMessage("");
    try {
      await action();
      await loadUser();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "無料トライアルを更新できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const featureUsage = useMemo(() => userTrial ? [
    ["記事生成", userTrial.articleGenerateUsed, userTrial.articleGenerateLimit],
    ["タイトル候補", userTrial.titleGenerateUsed, userTrial.titleGenerateLimit],
    ["記事リライト", userTrial.articleRewriteUsed, userTrial.articleRewriteLimit],
    ["SNS投稿生成", userTrial.snsGenerateUsed, userTrial.snsGenerateLimit],
    ["画像生成", userTrial.imageGenerateUsed, userTrial.imageGenerateLimit],
    ["AI補助", userTrial.aiAssistUsed, userTrial.aiAssistLimit],
  ] as const : [], [userTrial]);

  return (
    <section id="admin-free-trial" className="admin-panel free-trial-admin admin-dashboard-section">
      <div className="admin-panel-heading">
        <div><p className="eyebrow">FREE TRIAL</p><h2>無料トライアル管理</h2></div>
        <span className={settings?.enabled ? "admin-count-badge" : "admin-count-badge alert"}>{settings?.enabled ? "ON" : "OFF"}</span>
      </div>

      {message && <div className="route-notice">{message}</div>}

      {!settings ? (
        <div className="admin-empty-state"><strong>設定を読み込んでいます…</strong></div>
      ) : (
        <>
          <div className="trial-admin-toggle-grid">
            <label className="choice-card compact"><input type="checkbox" checked={settings.enabled} onChange={(event) => patch("enabled", event.target.checked)} /><span><strong>無料トライアルを有効にする</strong><small>OFFにするとトライアルだけの利用者はPWAへ入れなくなります。</small></span></label>
            <label className="choice-card compact"><input type="checkbox" checked={settings.autoStartOnActivation} onChange={(event) => patch("autoStartOnActivation", event.target.checked)} /><span><strong>active承認時に自動開始</strong><small>承認待ち時間を無料期間に含めません。</small></span></label>
            <label className="choice-card compact"><input type="checkbox" checked={settings.newUsersOnly} onChange={(event) => patch("newUsersOnly", event.target.checked)} /><span><strong>初回新規ユーザーのみ</strong><small>対象開始日時より前の既存ユーザーへ自動付与しません。</small></span></label>
            <label className="choice-card compact"><input type="checkbox" checked={settings.applyDurationChangesToActive} onChange={(event) => patch("applyDurationChangesToActive", event.target.checked)} /><span><strong>期間変更を利用中ユーザーにも適用</strong><small>保存時に進行中トライアルの終了日時を開始日基準で再計算します。</small></span></label>
          </div>

          <div className="admin-form-grid trial-admin-settings-grid">
            <NumberField label="無料期間（日）" value={settings.durationDays} min={1} max={365} onChange={(value) => patch("durationDays", value)} />
            <NumberField label="1日の総利用回数" value={settings.dailyTotalLimit} onChange={(value) => patch("dailyTotalLimit", value)} />
            <NumberField label="記事生成 / 日" value={settings.articleGenerateLimit} onChange={(value) => patch("articleGenerateLimit", value)} />
            <NumberField label="タイトル候補 / 日" value={settings.titleGenerateLimit} onChange={(value) => patch("titleGenerateLimit", value)} />
            <NumberField label="記事リライト / 日" value={settings.articleRewriteLimit} onChange={(value) => patch("articleRewriteLimit", value)} />
            <NumberField label="SNS投稿生成 / 日" value={settings.snsGenerateLimit} onChange={(value) => patch("snsGenerateLimit", value)} />
            <NumberField label="画像生成 / 日" value={settings.imageGenerateLimit} onChange={(value) => patch("imageGenerateLimit", value)} />
            <NumberField label="AI補助 / 日" value={settings.aiAssistLimit} onChange={(value) => patch("aiAssistLimit", value)} />
            <label className="route-field"><span>リセットタイムゾーン</span><input value={settings.resetTimezone} onChange={(event) => patch("resetTimezone", event.target.value)} /></label>
            <NumberField label="リセット時刻（0〜23時）" value={settings.resetHour} min={0} max={23} onChange={(value) => patch("resetHour", value)} />
            <label className="route-field full"><span>新規ユーザー判定の対象開始日時</span><input type="datetime-local" value={localInput(settings.eligibleFrom)} onChange={(event) => event.target.value && patch("eligibleFrom", new Date(event.target.value).toISOString())} /></label>
          </div>
          <p className="trial-admin-note">各機能の上限を0にすると、無料トライアル中はその機能を利用できません。有料PWA利用権を持つユーザーとactive管理者は回数制限を受けません。日次カウントはブラウザーではなくSupabase側で管理します。</p>
          <button className="primary-action trial-save-button" type="button" disabled={busy} onClick={() => void saveSettings()}>{busy ? "保存中…" : "無料トライアル設定を保存"}</button>
        </>
      )}

      <div className="trial-user-admin">
        <div className="admin-subsection-heading"><h3>ユーザー個別トライアル</h3><small>{selectedUser ? selectedUser.aasUserId : "ユーザーを上の一覧から選択"}</small></div>
        {!selectedUser && <div className="admin-empty-state compact"><strong>ユーザーが選択されていません。</strong><span>ユーザー一覧から対象ユーザーを開くと、ここで期間・状態・本日の回数を変更できます。</span></div>}
        {selectedUser?.role === "admin" && <div className="admin-empty-state compact"><strong>管理者はトライアル対象外です。</strong><span>active管理者はPWAを無制限で利用できます。</span></div>}
        {selectedUser?.role === "user" && userTrial && (
          <>
            <div className="trial-user-summary">
              <div><span>状態</span><strong>{trialStatusLabel(userTrial.trialStatus)}</strong></div>
              <div><span>開始</span><strong>{displayDate(userTrial.startedAt)}</strong></div>
              <div><span>終了</span><strong>{displayDate(userTrial.endsAt)}</strong></div>
              <div><span>本日</span><strong>{userTrial.totalUsed} / {userTrial.dailyTotalLimit} 回</strong></div>
            </div>

            {userTrial.hasTrial ? (
              <>
                <div className="trial-usage-grid">
                  {featureUsage.map(([label, used, limit]) => <UsageCell key={label} label={label} used={used} limit={limit} />)}
                </div>
                <div className="admin-form-grid trial-user-controls">
                  <label className="route-field full"><span>終了日時</span><input type="datetime-local" value={userEnd} onChange={(event) => setUserEnd(event.target.value)} /></label>
                </div>
                <div className="admin-actions trial-user-actions">
                  <button className="primary-action" disabled={busy || !userEnd} type="button" onClick={() => void runUserAction(() => updateAdminUserFreeTrial(getSupabaseClient(), selectedUser.id, "active", new Date(userEnd).toISOString()), "トライアルを有効化し、終了日時を更新しました。")}>有効化・期限更新</button>
                  <button className="secondary-action" disabled={busy || !userEnd} type="button" onClick={() => void runUserAction(() => updateAdminUserFreeTrial(getSupabaseClient(), selectedUser.id, "stopped", new Date(userEnd).toISOString()), "トライアルを停止しました。")}>停止</button>
                  <button className="secondary-action" disabled={busy} type="button" onClick={() => void runUserAction(() => resetAdminUserFreeTrialUsage(getSupabaseClient(), selectedUser.id), "本日の利用回数を0へリセットしました。")}>本日の回数をリセット</button>
                </div>
              </>
            ) : (
              <div className="trial-manual-start">
                <NumberField label="手動開始する日数" value={manualDays} min={1} max={365} onChange={setManualDays} />
                <button className="primary-action" disabled={busy || selectedUser.status !== "active"} type="button" onClick={() => void runUserAction(() => startAdminUserFreeTrial(getSupabaseClient(), selectedUser.id, manualDays), "無料トライアルを開始しました。")}>このユーザーの初回トライアルを開始</button>
                {selectedUser.status !== "active" && <small>手動開始にはactive一般ユーザーが必要です。</small>}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
