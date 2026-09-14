"use client";

import { useEffect, useMemo, useState } from "react";

import {
  DEFAULT_MOBILE_NAV_ITEMS,
  MAX_CUSTOM_MOBILE_NAV_ITEMS,
  MOBILE_NAV_ITEM_OPTIONS,
  readMobileNavItems,
  writeMobileNavItems,
  type MobileNavItemKey,
} from "@/lib/mobile-nav-preference";

export function MobileNavCustomizer() {
  const [items, setItems] = useState<MobileNavItemKey[]>([...DEFAULT_MOBILE_NAV_ITEMS]);

  useEffect(() => {
    queueMicrotask(() => setItems(readMobileNavItems()));
  }, []);

  const selected = useMemo(
    () => items.map((key) => MOBILE_NAV_ITEM_OPTIONS.find((item) => item.key === key)).filter(Boolean),
    [items],
  );

  const save = (next: MobileNavItemKey[]) => {
    const stored = writeMobileNavItems(next);
    setItems(stored);
  };

  const toggle = (key: MobileNavItemKey) => {
    if (items.includes(key)) {
      save(items.filter((item) => item !== key));
      return;
    }
    if (items.length >= MAX_CUSTOM_MOBILE_NAV_ITEMS) return;
    save([...items, key]);
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    save(next);
  };

  return (
    <section className="nav-customizer" aria-labelledby="nav-customizer-title">
      <div className="nav-customizer-head">
        <div>
          <p className="eyebrow">NAVIGATION</p>
          <h2 id="nav-customizer-title">下部ナビをカスタマイズ</h2>
          <p>ホームと設定は固定です。中央の3枠まで、よく使う機能を選び、順番を変更できます。</p>
        </div>
        <button type="button" onClick={() => save([...DEFAULT_MOBILE_NAV_ITEMS])}>初期状態に戻す</button>
      </div>

      <div className="nav-customizer-preview" aria-label="現在の下部ナビ構成">
        <span><b>⌂</b>ホーム</span>
        {selected.map((item, index) => item && (
          <span key={item.key}>
            <b>{item.icon}</b>{item.label}
            <span className="nav-order-actions">
              <button type="button" aria-label={`${item.label}を左へ移動`} disabled={index === 0} onClick={() => move(index, -1)}>‹</button>
              <button type="button" aria-label={`${item.label}を右へ移動`} disabled={index === items.length - 1} onClick={() => move(index, 1)}>›</button>
            </span>
          </span>
        ))}
        <span><b>⚙</b>設定</span>
      </div>

      <div className="nav-customizer-options" aria-label="下部ナビに追加できる機能">
        {MOBILE_NAV_ITEM_OPTIONS.map((item) => {
          const active = items.includes(item.key);
          const disabled = !active && items.length >= MAX_CUSTOM_MOBILE_NAV_ITEMS;
          return (
            <button
              key={item.key}
              type="button"
              className={active ? "active" : ""}
              aria-pressed={active}
              disabled={disabled}
              onClick={() => toggle(item.key)}
            >
              <span aria-hidden="true">{item.icon}</span>
              <strong>{item.label}</strong>
              <small>{active ? "表示中" : disabled ? "3枠選択済み" : "タップして追加"}</small>
            </button>
          );
        })}
      </div>
      <p className="nav-customizer-note">この設定は、この端末のPWA／ブラウザに保存されます。</p>
    </section>
  );
}
