"use client";

import { useEffect, useMemo, useState } from "react";

import { useWorkspacePreset } from "@/features/presets/workspace-preset-provider";
import {
  createAasPlatformAccountPresetDraft,
  emptyPlatformAccountPreset,
  type PlatformAccountPresetDraft,
  type PlatformAccountPresetPlatform,
} from "@/features/presets/platform-account-presets";

const PLATFORM_LABELS: Record<PlatformAccountPresetPlatform, string> = {
  note: "note",
  tips: "Tips",
  brain: "Brain",
};

export function PlatformAccountPresetSettings() {
  const {
    preference,
    isAdmin,
    accountPresets,
    accountPresetsLoading,
    accountPresetError,
    saveAccountPreset,
    deleteAccountPreset,
  } = useWorkspacePreset();
  const ownerId = preference?.userId ?? "";
  const [platform, setPlatform] = useState<PlatformAccountPresetPlatform>("note");
  const [selectedId, setSelectedId] = useState("__new__");
  const [draft, setDraft] = useState<PlatformAccountPresetDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const platformPresets = useMemo(
    () => accountPresets.filter((item) => item.platform === platform),
    [accountPresets, platform],
  );
  const defaultPreset = platformPresets.find((item) => item.isDefault) ?? null;

  useEffect(() => {
    if (!ownerId || accountPresetsLoading || draft) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const existing = defaultPreset ?? platformPresets[0] ?? null;
      if (existing) {
        setSelectedId(existing.id);
        setDraft(existing);
      } else {
        setSelectedId("__new__");
        setDraft(emptyPlatformAccountPreset(ownerId, platform));
      }
    });
    return () => { active = false; };
  }, [ownerId, platform, platformPresets, defaultPreset, accountPresetsLoading, draft]);

  if (!ownerId || !draft) {
    return <p className="persistent-settings-status">アカウント別プリセットを準備しています…</p>;
  }

  const patch = <K extends keyof PlatformAccountPresetDraft>(key: K, value: PlatformAccountPresetDraft[K]) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
    setMessage("");
  };

  const choosePlatform = (next: PlatformAccountPresetPlatform) => {
    setPlatform(next);
    setSelectedId("__new__");
    const existing = accountPresets.find((item) => item.platform === next && item.isDefault)
      ?? accountPresets.find((item) => item.platform === next)
      ?? null;
    setDraft(existing ?? emptyPlatformAccountPreset(ownerId, next));
    if (existing) setSelectedId(existing.id);
    setMessage("");
  };

  const choosePreset = (id: string) => {
    setSelectedId(id);
    if (id === "__new__") {
      setDraft(emptyPlatformAccountPreset(ownerId, platform));
      return;
    }
    const existing = platformPresets.find((item) => item.id === id);
    if (existing) setDraft(existing);
  };

  const save = async () => {
    setBusy(true);
    setMessage("");
    try {
      const saved = await saveAccountPreset({ ...draft, userId: ownerId, platform });
      setDraft(saved);
      setSelectedId(saved.id);
      setMessage(`${PLATFORM_LABELS[platform]}の「${saved.presetName}」を保存しました。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "アカウント別プリセットを保存できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!draft.id || !window.confirm(`「${draft.presetName}」を削除しますか？`)) return;
    setBusy(true);
    setMessage("");
    try {
      await deleteAccountPreset(draft.id);
      setSelectedId("__new__");
      setDraft(emptyPlatformAccountPreset(ownerId, platform));
      setMessage("アカウント別プリセットを削除しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "アカウント別プリセットを削除できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="platform-account-preset-settings" aria-labelledby="platform-account-preset-title">
      <div className="workspace-preset-intro compact">
        <div>
          <p className="eyebrow">ACCOUNT PRESETS</p>
          <h3 id="platform-account-preset-title">note / Tips / Brain アカウント別プリセット</h3>
          <p>同じ掲載先で複数アカウントを運営する場合も、アカウント名・ジャンル・読者・発信方針を個別に保存できます。「既定」にしたプリセットは、その掲載先の記事・画像・SNS・シリーズ等へ自動で共有されます。</p>
        </div>
        <span>{accountPresets.length}件</span>
      </div>

      <div className="platform-account-preset-toolbar">
        <label><span>掲載先</span><select value={platform} onChange={(event) => choosePlatform(event.target.value as PlatformAccountPresetPlatform)}><option value="note">note</option><option value="tips">Tips</option><option value="brain">Brain</option></select></label>
        <label><span>登録済みプリセット</span><select value={selectedId} onChange={(event) => choosePreset(event.target.value)}><option value="__new__">＋ 新しいアカウントプリセット</option>{platformPresets.map((item) => <option key={item.id} value={item.id}>{item.isDefault ? "★ " : ""}{item.presetName}{item.accountName ? ` / ${item.accountName}` : ""}</option>)}</select></label>
        <button type="button" onClick={() => choosePreset("__new__")}>新規作成</button>
        {isAdmin && <button className="admin" type="button" onClick={() => {
          const next = createAasPlatformAccountPresetDraft(ownerId, platform);
          setDraft(next);
          setSelectedId("__new__");
          setMessage("AAS公式アカウント用の設定案を反映しました。確認して保存してください。");
        }}>AAS公式案を反映</button>}
      </div>

      {defaultPreset && <div className="platform-account-default"><strong>現在の既定:</strong><span>{defaultPreset.presetName}</span><small>{defaultPreset.accountName || "アカウント名未設定"}</small></div>}
      {accountPresetsLoading && <p className="persistent-settings-status">アカウント別プリセットを更新しています…</p>}

      <div className="platform-account-preset-grid">
        <label><span>プリセット名 *</span><input value={draft.presetName} maxLength={80} onChange={(event) => patch("presetName", event.target.value)} placeholder="例: AI副業note / ガジェットBrain" /></label>
        <label><span>アカウント名</span><input value={draft.accountName} maxLength={120} onChange={(event) => patch("accountName", event.target.value)} placeholder="実際に使う表示名" /></label>
        <label><span>アカウントID・補足</span><input value={draft.accountHandle} maxLength={120} onChange={(event) => patch("accountHandle", event.target.value)} placeholder="@IDや識別用メモ。パスワードは保存しない" /></label>
        <label><span>ジャンル</span><input value={draft.genre} maxLength={160} onChange={(event) => patch("genre", event.target.value)} placeholder="例: AI副業 / 子育て / ガジェット" /></label>
        <label className="wide"><span>アカウント型・発信スタイル</span><input value={draft.accountStyle} maxLength={240} onChange={(event) => patch("accountStyle", event.target.value)} placeholder="例: 初心者向け手順＋実践記録" /></label>
        <label className="wide"><span>想定読者</span><textarea value={draft.audience} maxLength={400} onChange={(event) => patch("audience", event.target.value)} placeholder="誰に読んでもらうアカウントか" /></label>
        <label><span>文章・発信トーン</span><input value={draft.tone} maxLength={180} onChange={(event) => patch("tone", event.target.value)} placeholder="例: やさしく具体的" /></label>
        <label><span>運営目的</span><input value={draft.operationGoal} maxLength={240} onChange={(event) => patch("operationGoal", event.target.value)} placeholder="例: 読者獲得 / 販売 / 専門性" /></label>
        <label className="wide"><span>収益化方針</span><textarea value={draft.monetization} maxLength={320} onChange={(event) => patch("monetization", event.target.value)} placeholder="無料中心、有料への導線など" /></label>
        <label className="wide"><span>主なテーマ・キーワード</span><textarea value={draft.mainTopics.join("\n")} onChange={(event) => patch("mainTopics", event.target.value.split(/[\n,、]/).map((item) => item.trim()).filter(Boolean).slice(0, 16))} placeholder={"AI活用\n記事作成\nnote運営"} /></label>
        <label className="wide"><span>プロフィール・運営メモ</span><textarea value={draft.profileNote} maxLength={1600} onChange={(event) => patch("profileNote", event.target.value)} placeholder="このアカウントで事実として扱ってよい方針や補足。パスワード・Cookie・トークンは保存しないでください。" /></label>
      </div>

      <label className="platform-account-default-toggle">
        <input type="checkbox" checked={draft.isDefault} onChange={(event) => patch("isDefault", event.target.checked)} />
        <span><strong>{PLATFORM_LABELS[platform]}の既定アカウントとして使う</strong><small>ONにすると、この掲載先の記事・画像・SNS・シリーズ等でこのアカウント設定を自動参照します。</small></span>
      </label>

      <div className="workspace-preset-actions">
        <button type="button" disabled={busy || !draft.presetName.trim()} onClick={() => void save()}>{busy ? "保存中…" : "アカウントプリセットを保存"}</button>
        {draft.id && <button className="secondary" type="button" disabled={busy} onClick={() => void remove()}>削除</button>}
      </div>

      {(message || accountPresetError) && <p className="personalization-message" role="status">{message || accountPresetError}</p>}
    </section>
  );
}
