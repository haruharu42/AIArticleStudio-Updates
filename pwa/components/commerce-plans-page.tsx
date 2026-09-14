"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  COMMERCE_PLAN_COPY,
  beginCheckout,
  fetchCommerceConfig,
  formatCommercePrice,
  renewalLabel,
  type CommercePlanCode,
  type PublicCommerceConfig,
} from "@/lib/commerce";
import { loadAccessState, type AccessState } from "@/lib/phase6-access";
import { getSupabaseClient } from "@/lib/supabase";

type PageState = AccessState | { kind: "loading" } | { kind: "unavailable" };

export function CommercePlansPage() {
  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [config, setConfig] = useState<PublicCommerceConfig | null>(null);
  const [message, setMessage] = useState("");
  const [busyPlan, setBusyPlan] = useState<CommercePlanCode | null>(null);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetchCommerceConfig(),
      loadAccessState(getSupabaseClient()).catch(() => ({ kind: "unavailable" }) as const),
    ]).then(
      ([nextConfig, nextState]) => {
        if (!active) return;
        setConfig(nextConfig);
        setState(nextState);
      },
      (error) => {
        if (!active) return;
        setState({ kind: "unavailable" });
        setMessage(error instanceof Error ? error.message : "販売情報を取得できませんでした。");
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const activeProfile = useMemo(() => {
    if (state.kind === "ready" || state.kind === "entitlement_denied") return state.profile;
    return null;
  }, [state]);

  const canPurchase = Boolean(
    activeProfile && activeProfile.role === "user" && activeProfile.status === "active",
  );

  const startCheckout = async (planCode: CommercePlanCode) => {
    if (!accepted) {
      setMessage("料金、利用期間、自動更新・解約条件、利用規約をご確認のうえチェックを入れてください。");
      return;
    }
    setBusyPlan(planCode);
    setMessage("");
    try {
      const url = await beginCheckout(planCode);
      window.location.assign(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "決済画面を開始できませんでした。");
      setBusyPlan(null);
    }
  };

  return (
    <main className="commerce-page">
      <section className="commerce-hero">
        <Link href="/" className="commerce-back">← AI記事スタジオへ戻る</Link>
        <p className="eyebrow">PLANS</p>
        <h1>利用プラン</h1>
        <p>短期間だけ試す7日利用パスと、継続利用向けの月額プランを用意する販売基盤です。表示金額は決済サービス側の設定をそのまま参照します。</p>
        {config?.mode === "test" && <strong className="commerce-mode test">TEST MODE / 実課金なし</strong>}
        {config?.mode === "off" && <strong className="commerce-mode off">販売準備中</strong>}
        {config?.mode === "live" && <strong className="commerce-mode live">LIVE</strong>}
      </section>

      {message && <p className="commerce-message" role="status">{message}</p>}

      <section className="commerce-grid" aria-label="料金プラン">
        {(config?.plans ?? []).map((plan) => {
          const copy = COMMERCE_PLAN_COPY[plan.planCode];
          const isBusy = busyPlan === plan.planCode;
          const unavailableReason =
            !config?.commerceReady || !plan.available
              ? "現在は購入できません"
              : !canPurchase
                ? activeProfile?.role === "admin"
                  ? "管理者は購入不要です"
                  : "有効な一般ユーザーでログインしてください"
                : !accepted
                  ? "確認チェック後に購入できます"
                  : "";
          return (
            <article className={`commerce-plan-card ${plan.planCode === "AAS-PWA-MONTHLY" ? "recommended" : ""}`} key={plan.planCode}>
              <span className="commerce-plan-badge">{copy.badge}</span>
              <h2>{copy.name}</h2>
              <p>{copy.description}</p>
              <div className="commerce-price">
                <strong>{formatCommercePrice(plan.price)}</strong>
                <span>{renewalLabel(plan)}</span>
              </div>
              <ul>
                <li>{plan.platformScope === "pwa" ? "PWA版" : plan.platformScope === "windows" ? "Windows版" : "PWA版 + Windows版"}の利用権</li>
                <li>{plan.purchaseType === "one_time" ? "購入日から7日間・自動更新なし" : "1か月ごとの自動更新"}</li>
                <li>{plan.purchaseType === "subscription" ? "解約後も現在の請求期間終了までは利用可能" : "期間終了後は自動的に利用終了"}</li>
              </ul>
              <button
                type="button"
                disabled={Boolean(unavailableReason) || isBusy}
                onClick={() => void startCheckout(plan.planCode)}
              >
                {isBusy ? "決済画面を準備中…" : plan.purchaseType === "one_time" ? "7日利用パスを購入" : "月額プランを申し込む"}
              </button>
              {unavailableReason && <small>{unavailableReason}</small>}
            </article>
          );
        })}
      </section>

      {!config?.plans.length && (
        <section className="commerce-empty">
          <h2>販売設定を準備しています</h2>
          <p>Stripeの商品・価格・Webhook・販売者情報を設定した後に購入ボタンが有効になります。</p>
        </section>
      )}

      <section className="commerce-confirmation">
        <h2>購入前の確認</h2>
        <label>
          <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
          <span>表示されている料金、利用期間、自動更新の有無、解約条件、利用規約、特定商取引法に基づく表記を確認しました。</span>
        </label>
        <p>月額プランは自動更新です。解約手続きは契約管理画面から行い、Stripe上の現在の請求期間終了後に更新を停止する想定です。最終的な請求額・契約内容は決済画面でも必ず確認してください。</p>
        <nav>
          <Link href="/terms">利用規約</Link>
          <Link href="/privacy">プライバシーポリシー</Link>
          <Link href="/commercial-transactions">特定商取引法に基づく表記</Link>
          <Link href="/billing">現在の契約を確認</Link>
        </nav>
      </section>
    </main>
  );
}
