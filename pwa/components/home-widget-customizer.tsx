"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DEFAULT_HOME_WIDGET_LAYOUT,
  HOME_WIDGET_DEFINITIONS,
  defaultHomeWidgetPreferences,
  loadHomeWidgetPreferences,
  normalizeHomeWidgetLayout,
  readLocalHomeWidgetLayout,
  saveHomeWidgetPreferences,
  writeLocalHomeWidgetLayout,
  type HomeWidgetDevice,
  type HomeWidgetKey,
  type HomeWidgetLayoutItem,
  type HomeWidgetPreferences,
} from "@/lib/home-widget-preferences";

function moveItem(
  layout: readonly HomeWidgetLayoutItem[],
  key: HomeWidgetKey,
  direction: -1 | 1,
): HomeWidgetLayoutItem[] {
  const next = [...layout];
  const index = next.findIndex((item) => item.key === key);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function moveBefore(
  layout: readonly HomeWidgetLayoutItem[],
  movingKey: HomeWidgetKey,
  targetKey: HomeWidgetKey,
): HomeWidgetLayoutItem[] {
  if (movingKey === targetKey) return [...layout];
  const moving = layout.find((item) => item.key === movingKey);
  if (!moving) return [...layout];
  const without = layout.filter((item) => item.key !== movingKey);
  const targetIndex = without.findIndex((item) => item.key === targetKey);
  if (targetIndex < 0) return [...layout];
  without.splice(targetIndex, 0, moving);
  return without;
}

export function HomeWidgetCustomizer({
  client,
  userId,
}: {
  client: SupabaseClient;
  userId: string;
}) {
  const [device, setDevice] = useState<HomeWidgetDevice>("desktop");
  const [preferences, setPreferences] = useState<HomeWidgetPreferences>(() => defaultHomeWidgetPreferences());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [draggingKey, setDraggingKey] = useState<HomeWidgetKey | null>(null);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setPreferences({
        desktop: readLocalHomeWidgetLayout(userId, "desktop"),
        mobile: readLocalHomeWidgetLayout(userId, "mobile"),
      });
      setLoading(true);
      setMessage("");
    });

    void loadHomeWidgetPreferences(client, userId).then(
      (cloud) => {
        if (!active) return;
        setPreferences(cloud);
        writeLocalHomeWidgetLayout(userId, "desktop", cloud.desktop);
        writeLocalHomeWidgetLayout(userId, "mobile", cloud.mobile);
      },
      () => {
        if (active) setMessage("クラウド設定を取得できなかったため、この端末に保存されている配置を表示しています。");
      },
    ).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [client, userId]);

  const layout = device === "desktop" ? preferences.desktop : preferences.mobile;
  const definitionMap = useMemo(
    () => new Map(HOME_WIDGET_DEFINITIONS.map((item) => [item.key, item])),
    [],
  );

  const updateLayout = (next: readonly HomeWidgetLayoutItem[]) => {
    const normalized = normalizeHomeWidgetLayout(next, device);
    setPreferences((current) => ({
      ...current,
      [device]: normalized,
    }));
  };

  const toggleVisible = (key: HomeWidgetKey) => {
    updateLayout(layout.map((item) => item.key === key ? { ...item, visible: !item.visible } : item));
  };

  const setSize = (key: HomeWidgetKey, size: "wide" | "half") => {
    updateLayout(layout.map((item) => item.key === key ? { ...item, size } : item));
  };

  const resetDevice = () => {
    updateLayout(DEFAULT_HOME_WIDGET_LAYOUT);
    setMessage(`${device === "desktop" ? "PC" : "スマホ"}配置を初期状態へ戻しました。保存すると反映されます。`);
  };

  const save = async () => {
    setSaving(true);
    setMessage("");
    const localDesktop = writeLocalHomeWidgetLayout(userId, "desktop", preferences.desktop);
    const localMobile = writeLocalHomeWidgetLayout(userId, "mobile", preferences.mobile);
    try {
      const saved = await saveHomeWidgetPreferences(client, userId, {
        desktop: localDesktop,
        mobile: localMobile,
      });
      setPreferences(saved);
      setMessage("ホームのウィジェット配置を保存しました。ホームへ戻ると反映されます。");
    } catch {
      setMessage("この端末には保存しましたが、クラウド同期に失敗しました。通信状態を確認してもう一度保存してください。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="home-widget-customizer" aria-labelledby="home-widget-customizer-title">
      <div className="home-widget-customizer-head">
        <div>
          <p className="eyebrow">HOME WIDGETS</p>
          <h2 id="home-widget-customizer-title">ホーム・ウィジェット</h2>
          <p>ホームのカードを好きな順番へ並べ替え、不要なものは非表示にできます。PCとスマホは別々に保存できます。</p>
        </div>
        <div className="home-widget-device-tabs" role="tablist" aria-label="編集する画面">
          <button type="button" role="tab" aria-selected={device === "desktop"} className={device === "desktop" ? "active" : ""} onClick={() => setDevice("desktop")}>PC</button>
          <button type="button" role="tab" aria-selected={device === "mobile"} className={device === "mobile" ? "active" : ""} onClick={() => setDevice("mobile")}>スマホ</button>
        </div>
      </div>

      {loading ? <p className="persistent-settings-status">ウィジェット設定を読み込んでいます…</p> : null}

      <div className="home-widget-preview" aria-label="現在の配置プレビュー">
        {layout.filter((item) => item.visible).map((item) => {
          const definition = definitionMap.get(item.key);
          if (!definition) return null;
          return (
            <span key={item.key} className={device === "desktop" && item.size === "half" ? "half" : "wide"}>
              <b aria-hidden="true">{definition.icon}</b>{definition.label}
            </span>
          );
        })}
      </div>

      <div className="home-widget-editor-list">
        {layout.map((item, index) => {
          const definition = definitionMap.get(item.key);
          if (!definition) return null;
          return (
            <div
              className={`home-widget-editor-row ${item.visible ? "" : "is-hidden"} ${draggingKey === item.key ? "is-dragging" : ""}`}
              key={item.key}
              draggable
              onDragStart={() => setDraggingKey(item.key)}
              onDragEnd={() => setDraggingKey(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (draggingKey) updateLayout(moveBefore(layout, draggingKey, item.key));
                setDraggingKey(null);
              }}
            >
              <span className="home-widget-drag" aria-hidden="true">⋮⋮</span>
              <span className="home-widget-editor-icon" aria-hidden="true">{definition.icon}</span>
              <span className="home-widget-editor-copy">
                <strong>{definition.label}</strong>
                <small>{definition.description}</small>
              </span>

              {device === "desktop" && definition.allowHalf ? (
                <label className="home-widget-size">
                  <span>幅</span>
                  <select value={item.size} onChange={(event) => setSize(item.key, event.target.value as "wide" | "half")}>
                    <option value="wide">ワイド</option>
                    <option value="half">1/2</option>
                  </select>
                </label>
              ) : (
                <span className="home-widget-size-fixed">{device === "desktop" ? "ワイド固定" : "1列表示"}</span>
              )}

              <div className="home-widget-order-buttons" aria-label={`${definition.label}の並べ替え`}>
                <button type="button" disabled={index === 0} onClick={() => updateLayout(moveItem(layout, item.key, -1))} aria-label="上へ移動">↑</button>
                <button type="button" disabled={index === layout.length - 1} onClick={() => updateLayout(moveItem(layout, item.key, 1))} aria-label="下へ移動">↓</button>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={item.visible}
                className={`home-widget-visibility ${item.visible ? "on" : ""}`}
                onClick={() => toggleVisible(item.key)}
              >
                <span aria-hidden="true" />
                <b>{item.visible ? "表示" : "非表示"}</b>
              </button>
            </div>
          );
        })}
      </div>

      {message ? <p className="home-widget-message" role="status">{message}</p> : null}

      <div className="home-widget-actions">
        <button type="button" className="secondary" onClick={resetDevice}>この画面を初期配置へ戻す</button>
        <button type="button" disabled={saving} onClick={() => void save()}>{saving ? "保存中…" : "配置を保存"}</button>
      </div>
      <small className="home-widget-help">PCでは「⋮⋮」をドラッグして並べ替えできます。スマホでは↑↓ボタンを使うと確実に操作できます。</small>
    </section>
  );
}
