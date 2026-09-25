"use client";

import { useState } from "react";

import {
  PROMOTION_METHOD_OPTIONS,
  SALES_CHANNEL_OPTIONS,
  SALES_PRODUCT_OPTIONS,
  type PromotionMethodKey,
  type SalesChannelKey,
  type SalesProductKey,
} from "@/components/admin-promotion/admin-promotion-options";
import type { PromotionThreeStepSelection } from "@/lib/admin-promotion-three-step";

export function AdminPromotionThreeStep({
  onApply,
}: {
  onApply(selection: PromotionThreeStepSelection): void;
}) {
  const [salesProduct, setSalesProduct] = useState<SalesProductKey>("aas-pwa");
  const [salesChannel, setSalesChannel] = useState<SalesChannelKey>("note");
  const [promotionMethod, setPromotionMethod] = useState<PromotionMethodKey>("article");

  return (
    <section className="admin-promo-three-step" aria-label="3ステップかんたん販促">
      <div className="admin-promo-three-step-head">
        <div>
          <p className="eyebrow">3 STEP AUTO SETUP</p>
          <h2>3ステップかんたん販促</h2>
          <p>商品・販売先・宣伝方法を選ぶだけで、下の詳細設定をまとめて自動入力します。</p>
        </div>
        <strong>販売設定そのものは変更しません</strong>
      </div>
      <div className="admin-promo-three-step-grid">
        <label className="admin-promo-field">
          <span>① 販売する商品・プラン</span>
          <select value={salesProduct} onChange={(event) => setSalesProduct(event.target.value as SalesProductKey)}>
            {SALES_PRODUCT_OPTIONS.map((item) => <option key={item.key} value={item.key}>{item.label} — {item.note}</option>)}
          </select>
        </label>
        <label className="admin-promo-field">
          <span>② 販売先・誘導先</span>
          <select value={salesChannel} onChange={(event) => setSalesChannel(event.target.value as SalesChannelKey)}>
            {SALES_CHANNEL_OPTIONS.map((item) => <option key={item.key} value={item.key}>{item.label} — {item.note}</option>)}
          </select>
        </label>
        <label className="admin-promo-field">
          <span>③ 宣伝方法</span>
          <select value={promotionMethod} onChange={(event) => setPromotionMethod(event.target.value as PromotionMethodKey)}>
            {PROMOTION_METHOD_OPTIONS.map((item) => <option key={item.key} value={item.key}>{item.label} — {item.note}</option>)}
          </select>
        </label>
      </div>
      <div className="admin-promo-three-step-actions">
        <button
          type="button"
          onClick={() => onApply({ salesProduct, salesChannel, promotionMethod })}
        >
          この3項目で自動設定
        </button>
        <small>Stripe・7日券・月額を選んでも販売受付は有効化されません。実際の受付状態は「販売設定」で別途管理します。</small>
      </div>
    </section>
  );
}
