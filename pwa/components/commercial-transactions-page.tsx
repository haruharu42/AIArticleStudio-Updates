"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  COMMERCE_PLAN_COPY,
  fetchCommerceConfig,
  formatCommercePrice,
  renewalLabel,
  type PublicCommerceConfig,
} from "@/lib/commerce";

function display(value: string): string {
  return value || "正式販売前に確定・表示します";
}

export function CommercialTransactionsPage() {
  const [config, setConfig] = useState<PublicCommerceConfig | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void fetchCommerceConfig().then(
      (next) => {
        if (active) setConfig(next);
      },
      (error) => {
        if (active) setMessage(error instanceof Error ? error.message : "販売情報を取得できませんでした。");
      },
    );
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="legal-commerce-page">
      <article>
        <Link href="/plans">← 利用プランへ戻る</Link>
        <p className="legal-commerce-label">特定商取引法に基づく表記</p>
        <h1>AI記事スタジオ 販売条件</h1>
        <p className="legal-commerce-lead">一般販売開始前の表示確認ページです。LIVE販売は、必要な販売者情報と決済設定が揃うまでシステム側で無効になります。</p>
        {config?.mode !== "live" && <p className="legal-commerce-warning">現在は正式なLIVE販売状態ではありません。</p>}
        {message && <p className="commerce-message" role="status">{message}</p>}

        <dl className="legal-commerce-table">
          <div><dt>販売事業者</dt><dd>{display(config?.seller.name ?? "")}</dd></div>
          <div><dt>所在地</dt><dd>{display(config?.seller.address ?? "")}</dd></div>
          <div><dt>電話番号</dt><dd>{display(config?.seller.phone ?? "")}</dd></div>
          <div><dt>メールアドレス</dt><dd>{display(config?.seller.email ?? "")}</dd></div>
          <div><dt>問い合わせ窓口</dt><dd>{config?.seller.supportUrl ? <a href={config.seller.supportUrl}>問い合わせページ</a> : "正式販売前に確定・表示します"}</dd></div>
          <div><dt>販売価格</dt><dd>下記の各プランに表示します。決済画面にも最終請求額を表示します。</dd></div>
          <div><dt>商品代金以外の必要料金</dt><dd>インターネット接続料金・通信料金等は利用者の負担です。その他の費用が生じる場合は購入前に表示します。</dd></div>
          <div><dt>支払方法</dt><dd>Stripe Checkoutで提供される支払方法。実際に利用可能な方法は決済画面に表示します。</dd></div>
          <div><dt>支払時期</dt><dd>7日利用パスは購入時に決済します。月額プランは申込時に初回決済し、その後は1か月ごとに自動更新・決済する設計です。</dd></div>
          <div><dt>サービス提供時期</dt><dd>Stripeから決済完了通知を受信し利用権へ反映後、対象機能を利用できます。</dd></div>
          <div><dt>解約</dt><dd>月額プランは契約管理画面から解約できます。解約予約後は原則として現在の請求期間終了まで利用でき、次回更新を停止します。</dd></div>
          <div><dt>7日利用パス</dt><dd>自動更新はありません。有効期間終了後に自動的に利用権が終了します。</dd></div>
          <div><dt>返金・キャンセル</dt><dd>デジタルサービスの性質、法令上の取扱い、重複決済・システム障害等の事情を踏まえた正式条件を一般販売開始前に確定し、購入確定前に表示します。</dd></div>
          <div><dt>動作環境</dt><dd>PWA版は対応ブラウザ、Windows版は対応Windows環境が必要です。正式販売ページで対応範囲を明示します。</dd></div>
        </dl>

        <section className="legal-commerce-plans">
          <h2>プラン別の販売条件</h2>
          {(config?.plans ?? []).map((plan) => (
            <article key={plan.planCode}>
              <h3>{COMMERCE_PLAN_COPY[plan.planCode].name}</h3>
              <strong>{formatCommercePrice(plan.price)}</strong>
              <span>{renewalLabel(plan)}</span>
              <p>{COMMERCE_PLAN_COPY[plan.planCode].description}</p>
            </article>
          ))}
          {!config?.plans.length && <p>価格はStripeの商品・価格設定完了後にこのページへ自動表示されます。</p>}
        </section>

        <section className="legal-commerce-notes">
          <h2>購入確定前の表示</h2>
          <p>購入時は、プラン名、価格、利用期間、自動更新の有無、解約条件を確認したうえでStripe Checkoutへ進みます。決済確定前にもStripeの最終画面で請求内容を確認してください。</p>
        </section>

        <nav className="legal-commerce-links">
          <Link href="/terms">利用規約</Link>
          <Link href="/privacy">プライバシーポリシー</Link>
          <Link href="/ai-terms">AI利用条件</Link>
          <Link href="/billing">契約・利用権</Link>
        </nav>
      </article>
    </main>
  );
}
