"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import {
  consumeFreeTrialUsage,
  getMyFreeTrialStatus,
  trialUsageMessage,
  type FreeTrialStatus,
  type TrialFeature,
} from "@/lib/free-trial";
import { getSupabaseClient } from "@/lib/supabase";

const LABELS: Record<TrialFeature, string> = {
  article_generate: "記事作成",
  title_generate: "タイトル候補生成",
  article_rewrite: "記事リライト",
  sns_generate: "SNS投稿作成",
  image_generate: "画像作成",
  ai_assist: "AI補助",
};

function featureUsage(status: FreeTrialStatus, feature: TrialFeature): [number, number] {
  if (feature === "article_generate") return [status.articleGenerateUsed, status.articleGenerateLimit];
  if (feature === "title_generate") return [status.titleGenerateUsed, status.titleGenerateLimit];
  if (feature === "article_rewrite") return [status.articleRewriteUsed, status.articleRewriteLimit];
  if (feature === "sns_generate") return [status.snsGenerateUsed, status.snsGenerateLimit];
  if (feature === "image_generate") return [status.imageGenerateUsed, status.imageGenerateLimit];
  return [status.aiAssistUsed, status.aiAssistLimit];
}

export function FreeTrialFeatureGate({ feature, children }: { feature: TrialFeature; children: ReactNode }) {
  const [status, setStatus] = useState<FreeTrialStatus | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    void getMyFreeTrialStatus(getSupabaseClient()).then(
      (next) => {
        if (!active) return;
        setStatus(next);
        setLoadError("");
        if (next.bypassLimits) setReady(true);
      },
      () => {
        if (!active) return;
        setStatus(null);
        setReady(false);
        setLoadError("アカウントと利用回数を確認できませんでした。通信状態を確認して再読み込みしてください。");
      },
    );
    return () => { active = false; };
  }, []);

  if (ready) return <>{children}</>;

  if (loadError) {
    return (
      <main className="standalone-page"><section className="standalone-card trial-feature-gate">
        <p className="eyebrow">ACCESS CHECK</p>
        <h1>{LABELS[feature]}</h1>
        <p className="route-notice error" role="alert">{loadError}</p>
        <button className="primary-action" type="button" onClick={() => window.location.reload()}>再読み込み</button>
        <div className="trial-gate-actions"><Link href="/plans">料金プランを見る</Link><Link href="/">ホームへ戻る</Link></div>
      </section></main>
    );
  }

  if (!status) return null;

  if (status.trialStatus !== "active") {
    return (
      <main className="standalone-page"><section className="standalone-card">
        <p className="eyebrow">FREE TRIAL</p><h1>{LABELS[feature]}</h1>
        <p className="route-notice error">無料トライアルを利用できません。料金プランまたは招待コードをご確認ください。</p>
        <Link className="primary-action" href="/plans">料金プラン・招待コードへ</Link>
        <Link className="route-back" href="/">← ホームへ戻る</Link>
      </section></main>
    );
  }

  const [used, limit] = featureUsage(status, feature);
  const totalRemaining = Math.max(0, status.dailyTotalLimit - status.totalUsed);
  const featureRemaining = Math.max(0, limit - used);
  const canStart = totalRemaining > 0 && featureRemaining > 0;

  const start = async () => {
    setBusy(true); setMessage("");
    try {
      const result = await consumeFreeTrialUsage(getSupabaseClient(), feature);
      if (!result.allowed) {
        setMessage(trialUsageMessage(result));
        setStatus(await getMyFreeTrialStatus(getSupabaseClient()));
        return;
      }
      setReady(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "利用回数を確認できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="standalone-page"><section className="standalone-card trial-feature-gate">
      <p className="eyebrow">FREE TRIAL</p>
      <h1>{LABELS[feature]}を始める</h1>
      <p>無料トライアルでは、機能を開始すると1回分を使用します。</p>
      <dl className="route-meta">
        <div><dt>本日の全体</dt><dd>{status.totalUsed} / {status.dailyTotalLimit} 回</dd></div>
        <div><dt>{LABELS[feature]}</dt><dd>{used} / {limit} 回</dd></div>
        <div><dt>トライアル残り</dt><dd>{status.remainingDays ?? 0} 日</dd></div>
        <div><dt>リセット</dt><dd>{status.resetTimezone} {String(status.resetHour).padStart(2, "0")}:00</dd></div>
      </dl>
      {message && <p className="route-notice error" role="status">{message}</p>}
      <button className="primary-action" type="button" disabled={busy || !canStart} onClick={() => void start()}>{busy ? "確認中…" : `1回使用して${LABELS[feature]}を開始`}</button>
      {!canStart && <p className="route-notice error">本日の利用上限に達しています。リセット後に利用するか、料金プランをご確認ください。</p>}
      <div className="trial-gate-actions"><Link href="/plans">料金プランを見る</Link><Link href="/">ホームへ戻る</Link></div>
    </section></main>
  );
}
