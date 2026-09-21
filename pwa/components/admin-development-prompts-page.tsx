"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { useSharedAccessState } from "@/components/access-state-provider";
import {
  DEVELOPMENT_AREAS,
  DEVELOPMENT_REQUEST_TYPES,
  DEVELOPMENT_TARGETS,
  buildAdminDevelopmentPrompt,
  developmentSubTargets,
  type AdminDevelopmentArea,
  type AdminDevelopmentRequestType,
} from "@/features/admin/development-prompts";
import { launchAiApp } from "@/lib/ai-app-links";

export function AdminDevelopmentPromptsPage() {
  const { state } = useSharedAccessState();
  const [requestType, setRequestType] = useState<AdminDevelopmentRequestType>("update");
  const [area, setArea] = useState<AdminDevelopmentArea>("ui");
  const [target, setTarget] = useState(DEVELOPMENT_TARGETS.ui[0]);
  const [subTarget, setSubTarget] = useState(developmentSubTargets(DEVELOPMENT_TARGETS.ui[0])[0]);
  const [details, setDetails] = useState("");
  const [currentBehavior, setCurrentBehavior] = useState("");
  const [expectedBehavior, setExpectedBehavior] = useState("");
  const [message, setMessage] = useState("");

  const isAdmin = state.kind === "ready"
    && state.profile.role === "admin"
    && state.profile.status === "active";

  const targetOptions = DEVELOPMENT_TARGETS[area];
  const subTargetOptions = developmentSubTargets(target);
  const prompt = useMemo(
    () => buildAdminDevelopmentPrompt({
      requestType,
      area,
      target,
      subTarget,
      details,
      currentBehavior,
      expectedBehavior,
    }),
    [requestType, area, target, subTarget, details, currentBehavior, expectedBehavior],
  );

  const changeArea = (next: AdminDevelopmentArea) => {
    const nextTarget = DEVELOPMENT_TARGETS[next][0] ?? "その他";
    setArea(next);
    setTarget(nextTarget);
    setSubTarget(developmentSubTargets(nextTarget)[0] ?? "対象全体");
    setMessage("");
  };

  const changeTarget = (next: string) => {
    setTarget(next);
    setSubTarget(developmentSubTargets(next)[0] ?? "対象全体");
    setMessage("");
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setMessage("ChatGPTへ貼り付ける開発依頼プロンプトをコピーしました。");
    } catch {
      setMessage("自動コピーできませんでした。下のプロンプト欄を長押ししてコピーしてください。");
    }
  };

  const copyAndOpen = async () => {
    await copyPrompt();
    launchAiApp("chatgpt");
  };

  if (!isAdmin) {
    return (
      <main className="standalone-page">
        <section className="standalone-card">
          <p className="eyebrow">ADMIN ONLY</p>
          <h1>開発依頼プロンプト</h1>
          {state.kind === "loading" && <p className="route-notice">管理者権限を確認しています…</p>}
          {state.kind === "signed_out" && <p className="route-notice">先にログインしてください。</p>}
          {state.kind !== "loading" && state.kind !== "signed_out" && <p className="route-notice error">この機能はactive管理者のみ利用できます。</p>}
          <Link className="route-back" href="/">← ホーム</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-dev-prompt-page">
      <header className="admin-dev-prompt-head">
        <div>
          <p className="eyebrow">ADMIN DEVELOPMENT ASSISTANT</p>
          <h1>AAS開発依頼プロンプト作成</h1>
          <p>アップデート・修正・追加機能などを順番に選び、ChatGPTへそのまま渡せるAAS専用の開発依頼文を作成します。</p>
        </div>
        <div>
          <Link href="/admin">管理ダッシュボード</Link>
          <Link href="/tools">機能一覧</Link>
        </div>
      </header>

      <section className="admin-dev-prompt-panel">
        <div className="admin-dev-prompt-flow">
          <label>
            <span>1. 依頼種別</span>
            <select value={requestType} onChange={(event) => setRequestType(event.target.value as AdminDevelopmentRequestType)}>
              {DEVELOPMENT_REQUEST_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>

          <label>
            <span>2. 分野</span>
            <select value={area} onChange={(event) => changeArea(event.target.value as AdminDevelopmentArea)}>
              {DEVELOPMENT_AREAS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>

          <label>
            <span>3. 対象画面・機能</span>
            <select value={target} onChange={(event) => changeTarget(event.target.value)}>
              {targetOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>

          <label>
            <span>4. 詳細箇所</span>
            <select value={subTarget} onChange={(event) => setSubTarget(event.target.value)}>
              {subTargetOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>

        <label className="admin-dev-prompt-wide">
          <span>5. 依頼内容 *</span>
          <textarea value={details} maxLength={5000} onChange={(event) => setDetails(event.target.value)} placeholder="例：設定画面の共通プリセットで、note・Tips・Brainごとに複数アカウントを保存して切り替えられるようにしてください。" />
        </label>

        <div className="admin-dev-prompt-two">
          <label>
            <span>現在の状態・症状（任意）</span>
            <textarea value={currentBehavior} maxLength={3000} onChange={(event) => setCurrentBehavior(event.target.value)} placeholder="例：現在は掲載先ごとに1つの設計しか保持できません。" />
          </label>
          <label>
            <span>期待する状態（任意）</span>
            <textarea value={expectedBehavior} maxLength={3000} onChange={(event) => setExpectedBehavior(event.target.value)} placeholder="例：複数アカウントを登録し、既定アカウントを各機能へ自動反映できる。" />
          </label>
        </div>

        <div className="admin-dev-prompt-safety">
          <strong>AAS保護ルールを自動付与</strong>
          <span>GitHub/CIの現状確認、最小差分、エラー修正、RLS/認可保護、秘密情報禁止、PC/スマホ確認、Typecheck・Lint・Build・回帰テスト、Preview確認、本番境界保護を自動で依頼文へ含めます。</span>
        </div>

        <div className="admin-dev-prompt-actions">
          <button type="button" disabled={!details.trim()} onClick={() => void copyPrompt()}>プロンプトをコピー</button>
          <button className="primary" type="button" disabled={!details.trim()} onClick={() => void copyAndOpen()}>コピーしてChatGPTを開く</button>
        </div>

        {message && <p className="route-notice" role="status">{message}</p>}

        <details className="admin-dev-prompt-output" open>
          <summary>生成された依頼プロンプト</summary>
          <textarea readOnly value={prompt} />
        </details>
      </section>
    </main>
  );
}
