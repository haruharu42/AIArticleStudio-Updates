"use client";

import { useMemo, useState } from "react";

import { PlatformAccountPresetSettings } from "@/features/presets/platform-account-preset-settings";
import { useWorkspacePreset } from "@/features/presets/workspace-preset-provider";
import {
  WORKSPACE_PRESETS,
  availableWorkspacePresets,
  type WorkspacePresetPreference,
} from "@/features/presets/workspace-presets";

const FEATURE_SWITCHES = [
  { key: "applyImages", label: "画像計画", detail: "アイキャッチ・挿絵・画像プロンプト" },
  { key: "applySns", label: "SNS", detail: "SNS投稿・再利用・管理者プロモーション" },
  { key: "applyNote", label: "note運営", detail: "プロフィール・運営計画・月間スケジュール" },
  { key: "applyWorkflow", label: "運営コックピット", detail: "シリーズ・再告知・公開前確認" },
  { key: "applyAccountDesign", label: "アカウント設計", detail: "note / Tips / Brainの設計プロンプト" },
] as const satisfies readonly {
  key: keyof Pick<
    WorkspacePresetPreference,
    "applyArticle" | "applyImages" | "applySns" | "applyNote" | "applyWorkflow" | "applyAccountDesign"
  >;
  label: string;
  detail: string;
}[];

export function WorkspacePresetSettings() {
  const { preference, loading, saving, error, isAdmin, save, replaceLocal } = useWorkspacePreset();
  const [message, setMessage] = useState("");
  const presets = useMemo(() => availableWorkspacePresets(isAdmin), [isAdmin]);
  const activePreset = preference ? WORKSPACE_PRESETS[preference.presetKey] : null;

  if (loading && !preference) {
    return <p className="persistent-settings-status">共通プリセットを読み込んでいます…</p>;
  }

  if (!preference || !activePreset) {
    return <p className="persistent-settings-status">共通プリセットを利用するにはログイン状態を確認してください。</p>;
  }

  const patch = <K extends keyof WorkspacePresetPreference>(key: K, value: WorkspacePresetPreference[K]) => {
    replaceLocal({ ...preference, [key]: value });
    setMessage("");
  };

  const saveCurrent = async () => {
    setMessage("");
    try {
      await save(preference);
      setMessage("共通プリセットをクラウドへ保存しました。次のAI生成から各機能へ反映されます。");
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "共通プリセットを保存できませんでした。");
    }
  };

  const reset = () => {
    replaceLocal({
      ...preference,
      presetKey: "balanced",
      applyArticle: true,
      applyImages: true,
      applySns: true,
      applyNote: true,
      applyWorkflow: true,
      applyAccountDesign: true,
    });
    setMessage("バランス運営へ戻しました。保存すると確定します。");
  };

  return (
    <div className="workspace-preset-settings">
      <div className="workspace-preset-intro">
        <div>
          <p className="eyebrow">SHARED PRESET</p>
          <h3>全機能共通プリセット</h3>
          <p>ここでは画像・SNS・note運営・シリーズなどの共通方針をまとめます。記事作成のジャンルは下の投稿アカウントプリセット、サブジャンル・年齢・性別・文字数・価格・タグは記事ごとの7工程で設定します。</p>
        </div>
        <span>{activePreset.badge}</span>
      </div>

      <div className="workspace-preset-cards" role="radiogroup" aria-label="共通プリセット">
        {presets.map((preset) => (
          <button
            key={preset.key}
            className={preference.presetKey === preset.key ? "active" : ""}
            type="button"
            role="radio"
            aria-checked={preference.presetKey === preset.key}
            onClick={() => patch("presetKey", preset.key)}
          >
            <span>{preset.badge}</span>
            <strong>{preset.label}</strong>
            <small>{preset.description}</small>
            {preset.adminOnly && <b>管理者限定</b>}
          </button>
        ))}
      </div>

      <section className="workspace-preset-preview" aria-label="プリセット影響プレビュー">
        <div><strong>現在の共通プリセットで変わる内容</strong><small>記事ごとの条件はここでは固定しません。</small></div>
        <ul>
          <li>画像: アイキャッチ {activePreset.images.coverEnabled === false ? "OFF" : "ON"} / 挿絵 {activePreset.images.inlineEnabled ? (activePreset.images.inlineCount ?? 2) + "枚" : "OFF"}</li>
          <li>SNS: X 約{activePreset.social.targetCharacters.x}文字 / Threads 約{activePreset.social.targetCharacters.threads}文字</li>
          <li>シリーズ記事数の基準: {activePreset.workflow.defaultSeriesCount}記事</li>
          {activePreset.note.audience && <li>読者の基準: {activePreset.note.audience}</li>}
        </ul>
      </section>

      <div className="workspace-preset-feature-grid">
        {FEATURE_SWITCHES.map((item) => (
          <label key={item.key} className="workspace-preset-feature">
            <input type="checkbox" checked={preference[item.key]} onChange={(event) => patch(item.key, event.target.checked)} />
            <span><strong>{item.label}</strong><small>{item.detail}</small></span>
          </label>
        ))}
      </div>

      {isAdmin && preference.presetKey === "aas_official" && (
        <div className="workspace-preset-admin-note">
          <strong>AAS公式運営モード</strong>
          <p>AASの使い方、開発進捗、実運用テスト、アップデート、公開予告を発信しやすい条件を各機能へ共有します。販売前の段階では、未確認の実績・価格・公開日を作らない指示も自動で追加します。</p>
        </div>
      )}

      <PlatformAccountPresetSettings />

      {(message || error) && <p className="personalization-message" role="status">{message || error}</p>}

      <div className="workspace-preset-actions">
        <button type="button" disabled={saving} onClick={() => void saveCurrent()}>{saving ? "保存中…" : "共通プリセットを保存"}</button>
        <button type="button" className="secondary" disabled={saving} onClick={reset}>標準へ戻す</button>
      </div>
    </div>
  );
}
