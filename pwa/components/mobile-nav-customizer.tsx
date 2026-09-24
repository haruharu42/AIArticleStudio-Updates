"use client";

import { useEffect, useState } from "react";

import {
  DEFAULT_MOBILE_NAV_ITEMS,
  MAX_CUSTOM_MOBILE_NAV_ITEMS,
  mobileNavItemFor,
  mobileNavOptionsFor,
  readMobileNavItems,
  writeMobileNavItems,
  type MobileNavItemKey,
} from "@/features/navigation";

export function MobileNavCustomizer({
  userId = "",
  isAdmin = false,
}: {
  userId?: string;
  isAdmin?: boolean;
}) {
  const [items, setItems] = useState<MobileNavItemKey[]>([...DEFAULT_MOBILE_NAV_ITEMS]);

  useEffect(() => {
    queueMicrotask(() => setItems(readMobileNavItems(userId, isAdmin)));
  }, [userId, isAdmin]);

  const save = (next: MobileNavItemKey[]) => {
    setItems(writeMobileNavItems(next, userId, isAdmin));
  };

  const changeSlot = (index: number, key: MobileNavItemKey) => {
    if (items[index] === key || items.includes(key)) return;
    const next = [...items];
    next[index] = key;
    save(next);
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    save(next);
  };

  const availableOptions = mobileNavOptionsFor(isAdmin);

  return (
    <section className="nav-customizer" aria-labelledby="nav-customizer-title">
      <div className="nav-customizer-head">
        <div>
          <p className="eyebrow">NAVIGATION</p>
          <h2 id="nav-customizer-title">下部ナビをカスタマイズ</h2>
          <p>ホームは固定です。残り{MAX_CUSTOM_MOBILE_NAV_ITEMS}枠を好きな機能へ入れ替え、順番も変更できます。ここで変更した内容はホームを含む全画面のスマホ下部ナビへ共通反映されます。</p>
        </div>
        <button type="button" onClick={() => save([...DEFAULT_MOBILE_NAV_ITEMS])}>初期状態に戻す</button>
      </div>

      <div className="nav-customizer-preview" aria-label="現在の下部ナビ構成">
        <span><b>⌂</b>ホーム</span>
        {items.map((key, index) => {
          const item = mobileNavItemFor(key);
          return (
            <span key={key}>
              <b>{item.icon}</b>{item.label}
              <span className="nav-order-actions">
                <button type="button" aria-label={`${item.label}を左へ移動`} disabled={index === 0} onClick={() => move(index, -1)}>‹</button>
                <button type="button" aria-label={`${item.label}を右へ移動`} disabled={index === items.length - 1} onClick={() => move(index, 1)}>›</button>
              </span>
            </span>
          );
        })}
      </div>

      <div className="nav-customizer-slots" aria-label="下部ナビの4枠">
        {items.map((key, index) => (
          <label key={`slot-${index}`}>
            <span>{index + 2}番目の枠</span>
            <select value={key} onChange={(event) => changeSlot(index, event.target.value as MobileNavItemKey)}>
              {availableOptions.map((option) => (
                <option key={option.key} value={option.key} disabled={option.key !== key && items.includes(option.key)}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {isAdmin && (
        <p className="nav-customizer-note admin-note">
          管理者アカウントでは「問合せ確認 / 管理 / ユーザー / 無料設定 / 販売 / 更新管理 / MFA / 運用」も選べます。これらはactiveな管理者にだけ表示されます。
        </p>
      )}
      <p className="nav-customizer-note">初期状態は「ホーム / 作成 / ライブラリ / ランキング / プロフィール」です。この設定はこの端末のPWA／ブラウザ内で、ログイン中のユーザーごとに保存されます。</p>
    </section>
  );
}
