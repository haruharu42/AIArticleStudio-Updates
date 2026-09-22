"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { useSharedAccessState } from "@/components/access-state-provider";
import {
  COMMERCE_PLAN_COPY,
  beginCheckout,
  fetchCommerceConfig,
  formatCommercePrice,
  renewalLabel,
  type CommercePlanCode,
  type PublicCommerceConfig,
} from "@/lib/commerce";
import { redeemPwaInvite } from "@/lib/phase9-invite";
import {
  fetchPublicSalesSettings,
  planSalesEnabled,
  type SalesSettings,
} from "@/lib/sales-settings";
import { getSupabaseClient } from "@/lib/supabase";

export function CommercePlansPage() {
  const { state, client, refresh: refreshAccess } = useSharedAccessState();
  const [config, setConfig] = useState<PublicCommerceConfig | null>(null);
  const [salesSettings, setSalesSettings] = useState<SalesSettings | null>(null);
  const [message, setMessage] = useState("");
  const [busyPlan, setBusyPlan] = useState<CommercePlanCode | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const checkoutInFlight = useRef(false);
  const inviteInFlight = useRef(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetchCommerceConfig(),
      fetchPublicSalesSettings(),
    ]).then(
      ([nextConfig, nextSalesSettings]) => {
        if (!active) return;
        setConfig(nextConfig);
        setSalesSettings(nextSalesSettings);
      },
      (error) => {
        if (!active) return;
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

  const inviteProfile = useMemo(() => {
    if (state.kind === "entitlement_denied" || state.kind === "pending") return state.profile;
    return null;
  }, [state]);

  const visiblePlans = useMemo(
    () => (config?.plans ?? []).filter(
      (plan) => plan.platformScope === "pwa" && planSalesEnabled(salesSettings, plan.planCode),
    ),
    [config, salesSettings],
  );

  const canPurchase = Boolean(
    activeProfile && activeProfile.role === "user" && activeProfile.status === "active",
  );

  const startCheckout = async (planCode: CommercePlanCode) => {
    if (checkoutInFlight.current) return;
    if (!planSalesEnabled(salesSettings, planCode)) {
      setMessage("このプランは現在、新規受付を停止しています。");
      return;
    }
    if (!accepted) {
      setMessage("料金、利用期間、自動更新・解約条件、利用規約をご確認のうえチェックを入れてください。");
      return;
    }
    checkoutInFlight.current = true;
    setBusyPlan(planCode);
    setMessage("");
    try {
      const url = await beginCheckout(planCode);
      window.location.assign(url);
    } catch (error) {
      checkoutInFlight.current = false;
      setMessage(error instanceof Error ? error.message : "決済画面を開始できませんでした。");
      setBusyPlan(null);
    }
  };

  const redeemInvite = async () => {
    if (inviteInFlight.current) return;
    if (!salesSettings?.accessCodeEnabled) {
      setInviteMessage("現在、利用コードの新規受付は停止しています。");
      return;
    }
    inviteInFlight.current = true;
    setInviteBusy(true);
    setInviteMessage("");
    setInviteSuccess(false);
    try {
      if (!client) throw new Error("アカウント接続を確認できません。");
      const result = await redeemPwaInvite(client, inviteCode);
      await refreshAccess();
      setInviteCode("");
      setInviteSuccess(true);
      setInviteMessage(
        result.profileStatus === "active"
          ? "利用コードを適用し、PWA利用権を再確認しました。AI記事スタジオを利用できます。"
          : "利用コードを登録しました。管理者のアカウント承認後に利用できます。",
      );
    } catch (error) {
      setInviteMessage(error instanceof Error ? error.message : "利用コードの登録に失敗しました。");
    } finally {
      inviteInFlight.current = false;
      setInviteBusy(false);
    }
  };

  return (
    <main className="commerce-page">
      <section className="commerce-hero">
        <Link href="/" className="commerce-back">← AI記事スタジオへ戻る</Link>
        <p className="eyebrow">PLANS</p>
        <h1>利用プラン</h1>
        <p>ログイン後、PWA利用権がない一般ユーザーにはこの画面を案内します。現在受付中のPWA購入方法または利用コードが表示されます。</p>
        {config?.mode === "test" && salesSettings?.stripeCheckoutEnabled && <strong className="commerce-mode test">TEST MODE / 実課金なし</strong>}
        {config?.mode === "live" && salesSettings?.stripeCheckoutEnabled && <strong className="commerce-mode live">LIVE</strong>}
        {!salesSettings?.stripeCheckoutEnabled && <strong className="commerce-mode off">Stripe新規受付停止中</strong>}
      </section>

      {message && <p className="commerce-message" role="status">{message}</p>}

      {salesSettings?.externalSalesEnabled && (
        <section className="commerce-empty">
          <h2>外部販売を受付中です</h2>
          <p>{salesSettings.accessCodeEnabled
            ? "現在は外部販売ページで購入後、案内された利用コードをAASへ登録する運用に対応しています。"
            : "現在は外部販売ページで販売を受付中です。購入後の利用方法は販売ページの案内に従ってください。"}</p>
        </section>
      )}

      {salesSettings?.accessCodeEnabled && inviteProfile && inviteProfile.role === "user" && (
        <section className="commerce-invite" aria-labelledby="commerce-invite-title">
          <div>
            <p className="eyebrow">ACCESS CODE</p>
            <h2 id="commerce-invite-title">利用コードをお持ちの方</h2>
            <p>購入後に案内された利用コードを、このAASアカウントへ登録できます。内部では既存の安全な招待コード基盤を利用します。</p>
            <small>旧表記：招待コードをお持ちの方 / 「招待コードを登録」 / AAS ID: {inviteProfile.aas_user_id}</small>
          </div>
          <div className="commerce-invite-form">
            <label>
              <span>利用コード</span>
              <input
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                autoComplete="off"
                inputMode="text"
              />
            </label>
            <button type="button" disabled={inviteBusy || !inviteCode.trim()} onClick={() => void redeemInvite()}>
              {inviteBusy ? "確認中…" : "利用コードを登録"}
            </button>
          </div>
          {inviteMessage && (
            <p className={inviteSuccess ? "commerce-invite-message success" : "commerce-invite-message error"} role="status">
              {inviteMessage}
              {inviteSuccess && state.kind === "ready" && <> <Link href="/">ホームへ進む</Link></>}
            </p>
          )}
        </section>
      )}

      {visiblePlans.length > 0 && (
        <section className="commerce-grid" aria-label="料金プラン">
          {visiblePlans.map((plan) => {
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
                  <li>PWA版の利用権</li>
                  <li>{plan.purchaseType === "one_time" ? "購入日から7日間・自動更新なし" : "1か月ごとの自動更新"}</li>
                  <li>{plan.purchaseType === "subscription" ? "解約後も現在の請求期間終了までは利用可能" : "期間終了後は自動的に利用終了"}</li>
                </ul>
                <button
                  type="button"
                  disabled={Boolean(unavailableReason) || busyPlan !== null}
                  onClick={() => void startCheckout(plan.planCode)}
                >
                  {isBusy ? "決済画面を準備中…" : plan.purchaseType === "one_time" ? "7日利用パスを購入" : "月額プランを申し込む"}
                </button>
                {unavailableReason && <small>{unavailableReason}</small>}
              </article>
            );
          })}
        </section>
      )}

      {salesSettings && visiblePlans.length === 0 && !salesSettings.externalSalesEnabled && !salesSettings.accessCodeEnabled && (
        <section className="commerce-empty">
          <h2>新規販売を一時停止しています</h2>
          <p>既存の契約・利用権には影響しません。販売再開後に、この画面へ受付中の購入方法が表示されます。</p>
        </section>
      )}

      {visiblePlans.length > 0 && (
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
      )}
    </main>
  );
}
