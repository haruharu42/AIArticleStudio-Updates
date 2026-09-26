"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSharedAccessState } from "@/components/access-state-provider";
import { Phase11CreatePage } from "@/components/phase11-create-page";
import { loadArticleWizardProgress } from "@/lib/phase11-wizard-progress";
import {
  AI_PLAN_LABELS,
  AI_PROVIDER_LABELS,
  loadWritingProfile,
  saveWritingProfile,
  setRuntimeWritingProfile,
  summarizeWritingProfile,
  type AiPlan,
  type AiProvider,
  type UserWritingProfile,
} from "@/lib/user-personalization";

type SetupState =
  | { kind: "loading" }
  | { kind: "setup"; profile: UserWritingProfile }
  | { kind: "bypass" }
  | { kind: "error"; message: string };

export function CreateAiSetup() {
  const { state: accessState, client } = useSharedAccessState();
  const [state, setState] = useState<SetupState>({ kind: "loading" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (accessState.kind === "loading") return;
    if (accessState.kind !== "ready" || !client) {
      queueMicrotask(() => setState({ kind: "bypass" }));
      return;
    }

    let active = true;
    setRuntimeWritingProfile(null);

    const boot = async () => {
      try {
        const writingProfile = await loadWritingProfile(client, accessState.profile.id);
        if (!active) return;

        // Every new article starts by confirming the AI/provider plan so the prompt
        // matches the AI the user will actually use. Resume flows must not interrupt
        // in-progress work, so only an existing wizard draft bypasses this first step.
        setRuntimeWritingProfile(writingProfile);
        const wizardProgress = loadArticleWizardProgress(accessState.profile.id);
        setState({ kind: "setup", profile: writingProfile });
        setConfirmed(Boolean(wizardProgress));
      } catch (error) {
        if (active) {
          setState({
            kind: "error",
            message: error instanceof Error ? error.message : "AI設定を取得できませんでした。",
          });
        }
      }
    };

    void boot();
    return () => {
      active = false;
    };
  }, [accessState, client]);

  if (state.kind === "bypass") return <Phase11CreatePage />;

  if (state.kind === "loading") return null;

  if (state.kind === "error") {
    return (
      <main className="creator-page beginner-creator-page ai-setup-page">
        <section className="creator-card ai-setup-card">
          <p className="eyebrow">AI SETUP</p>
          <h1>AI設定を読み込めませんでした</h1>
          <p className="route-notice error">{state.message}</p>
          <div className="ai-setup-actions">
            <button type="button" className="secondary-action" onClick={() => { setRuntimeWritingProfile(null); setState({ kind: "bypass" }); }}>
              個人最適化なしで続ける
            </button>
            <Link className="route-back" href="/settings">設定を確認する</Link>
          </div>
        </section>
      </main>
    );
  }

  const profile = state.profile;

  if (confirmed) {
    return (
      <div className={`ai-selected-provider ai-selected-${profile.preferredAi}`}>
        <div className="ai-active-banner" role="status">
          <span><strong>{AI_PROVIDER_LABELS[profile.preferredAi]}</strong> / {AI_PLAN_LABELS[profile.preferredPlan]}</span>
          <span>{profile.personalizationEnabled ? "あなた向け最適化 ON" : "個人最適化 OFF"}</span>
          <button type="button" onClick={() => setConfirmed(false)}>AI設定を変更</button>
        </div>
        <Phase11CreatePage />
      </div>
    );
  }

  const patchProfile = <K extends keyof UserWritingProfile>(key: K, value: UserWritingProfile[K]) => {
    setState((current) => current.kind === "setup"
      ? { kind: "setup", profile: { ...current.profile, [key]: value } }
      : current);
  };

  const confirm = async () => {
    if (!client) return;
    setBusy(true);
    setMessage("");
    try {
      const saved = await saveWritingProfile(client, profile);
      setRuntimeWritingProfile(saved);
      setState({ kind: "setup", profile: saved });
      setConfirmed(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI設定を保存できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="creator-page beginner-creator-page ai-setup-page">
      <header className="creator-head ai-setup-head">
        <div>
          <p className="eyebrow">AI SETUP</p>
          <h1>使用するAIを選びます</h1>
          <p>新しい記事を作る最初に、今回使うAIと無料版・有料版を確認します。途中作業を復元する場合は、この確認を飛ばして同じ工程へ戻ります。</p>
        </div>
        <Link className="route-back" href="/">← ホーム</Link>
      </header>

      <section className="creator-card ai-setup-card">
        <div className="ai-setup-block">
          <span className="ai-setup-number">1</span>
          <div>
            <h2>使用AI</h2>
            <p>今回の記事生成に使うAIを選択してください。</p>
          </div>
        </div>
        <div className="ai-provider-grid" role="radiogroup" aria-label="使用AI">
          {(Object.keys(AI_PROVIDER_LABELS) as AiProvider[]).map((provider) => (
            <button
              key={provider}
              type="button"
              role="radio"
              aria-checked={profile.preferredAi === provider}
              className={profile.preferredAi === provider ? "active" : ""}
              onClick={() => patchProfile("preferredAi", provider)}
            >
              <strong>{AI_PROVIDER_LABELS[provider]}</strong>
              <small>{provider === "chatgpt" ? "構造化された記事指示" : provider === "claude" ? "長文の一貫性を意識" : "条件整理と構造化を意識"}</small>
            </button>
          ))}
        </div>

        <div className="ai-setup-block ai-setup-block-spaced">
          <span className="ai-setup-number">2</span>
          <div>
            <h2>利用プラン</h2>
            <p>モデル名は固定せず、無料版は重要条件を優先した簡潔な指示、有料版は構成・推敲・整合性確認まで含む詳細な指示へ調整します。</p>
          </div>
        </div>
        <div className="ai-plan-grid" role="radiogroup" aria-label="利用プラン">
          {(Object.keys(AI_PLAN_LABELS) as AiPlan[]).map((plan) => (
            <button
              key={plan}
              type="button"
              role="radio"
              aria-checked={profile.preferredPlan === plan}
              className={profile.preferredPlan === plan ? "active" : ""}
              onClick={() => patchProfile("preferredPlan", plan)}
            >
              <strong>{AI_PLAN_LABELS[plan]}</strong>
              <small>{plan === "free" ? "重要条件を優先してコンパクトに" : "詳細条件と長文整合性まで活用"}</small>
            </button>
          ))}
        </div>

        <label className="ai-personalization-toggle">
          <span>
            <strong>あなた向け最適化</strong>
            <small>ONでは設定した文章の好みと、記事保存時の小さな利用傾向を次回プロンプトへ反映します。</small>
          </span>
          <input
            type="checkbox"
            checked={profile.personalizationEnabled}
            onChange={(event) => patchProfile("personalizationEnabled", event.target.checked)}
          />
        </label>

        <div className="ai-profile-summary">
          {summarizeWritingProfile(profile).map((line) => <span key={line}>{line}</span>)}
        </div>
        <p className="ai-privacy-note">記事本文・AI回答全文・プロンプト全文を個人最適化プロフィールとして保存しません。保存するのはAI設定、文章の好み、掲載先・ジャンルの集計などの小さなデータです。</p>
        {message && <p className="route-notice error" role="status">{message}</p>}

        <div className="ai-setup-actions">
          <button type="button" className="primary-action" disabled={busy} onClick={() => void confirm()}>
            {busy ? "保存中…" : "この設定で記事作成へ"}
          </button>
          <Link href="/settings">文章の好みを詳しく設定</Link>
        </div>
      </section>
    </main>
  );
}
