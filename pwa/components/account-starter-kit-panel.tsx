"use client";

import { useEffect, useMemo, useState } from "react";

import { launchAiApp } from "@/lib/ai-app-links";
import { OPENAI_LINKS } from "@/lib/openai-links";
import {
  applyStarterKitToDesign,
  buildAccountStarterPrompt,
  extractAccountStarterKit,
  loadAccountStarterKits,
  saveAccountStarterKit,
  type AccountStarterKit,
} from "@/lib/platform-account-starter";
import type { PlatformAccountDesign } from "@/lib/platform-account-design";
import { getSupabaseClient } from "@/lib/supabase";
import { AI_PROVIDER_LABELS, type AiProvider } from "@/lib/user-personalization";

const PLATFORM_HOME: Record<PlatformAccountDesign["platform"], string> = {
  note: "https://note.com/",
  tips: "https://tips.jp/",
  brain: "https://brain-market.com/",
};

export function AccountStarterKitPanel({
  design,
  onApply,
}: {
  design: PlatformAccountDesign;
  onApply: (next: PlatformAccountDesign) => void;
}) {
  const [provider, setProvider] = useState<AiProvider>("chatgpt");
  const [kit, setKit] = useState<AccountStarterKit | null>(null);
  const [response, setResponse] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const prompt = useMemo(() => buildAccountStarterPrompt(design, provider), [design, provider]);

  useEffect(() => {
    let active = true;
    setKit(null);
    setMessage("");
    void loadAccountStarterKits(getSupabaseClient(), design.userId).then(
      (kits) => {
        if (active) setKit(kits[design.platform] ?? null);
      },
      () => {
        if (active) setMessage("保存済みのアカウント一括作成データを読み込めませんでした。基本設計はそのまま利用できます。");
      },
    );
    return () => { active = false; };
  }, [design.platform, design.userId]);

  const copyAndLaunch = async () => {
    setMessage("");
    try {
      await navigator.clipboard.writeText(prompt);
      setMessage(`${AI_PROVIDER_LABELS[provider]}用のアカウント一括作成プロンプトをコピーしました。AIで実行後、回答全文をコピーしてAASへ戻ってください。`);
      launchAiApp(provider);
    } catch {
      setMessage("クリップボードへコピーできませんでした。下のプロンプト欄から手動でコピーしてください。");
    }
  };

  const importResponse = async (raw: string) => {
    setBusy(true);
    setMessage("");
    try {
      const parsed = extractAccountStarterKit(raw, design.platform);
      const saved = await saveAccountStarterKit(getSupabaseClient(), design.userId, parsed);
      setKit(saved);
      onApply(applyStarterKitToDesign(design, saved));
      setResponse(raw);
      setMessage("AIが作成したアカウント一式を読み込みました。表示名・プロフィール・発信テーマも下の基本設計へ反映しています。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI回答を読み込めませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const importClipboard = async () => {
    try {
      if (!navigator.clipboard?.readText) throw new Error("このブラウザではクリップボード読込を利用できません。下の欄へAI回答を貼り付けてください。");
      const value = await navigator.clipboard.readText();
      if (!value.trim()) throw new Error("クリップボードにAI回答がありません。AIの回答全文をコピーしてからお試しください。");
      await importResponse(value);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "クリップボードから読み込めませんでした。");
    }
  };

  const chooseName = (name: string) => {
    if (!kit) return;
    onApply(applyStarterKitToDesign(design, kit, name));
    setMessage(`表示名を「${name}」へ反映しました。下の保存ボタンで確定できます。`);
  };

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label}をコピーしました。`);
    } catch {
      setMessage("自動コピーできません。表示内容から手動でコピーしてください。");
    }
  };

  return (
    <section className="account-starter-kit" aria-labelledby="account-starter-kit-title">
      <div className="account-starter-kit-head">
        <div>
          <p className="eyebrow">START FROM ZERO</p>
          <h2 id="account-starter-kit-title">AIにアカウントを最初から一括作成してもらう</h2>
          <p>表示名・ID候補・プロフィール・コンセプト・発信の柱・最初の記事案・開始手順・専用アイコンまでまとめて作ります。</p>
        </div>
        <a href={PLATFORM_HOME[design.platform]} target="_blank" rel="noreferrer">{design.platform === "note" ? "note" : design.platform === "tips" ? "Tips" : "Brain"}公式サイトを開く ↗</a>
      </div>

      <div className="account-starter-flow" aria-label="アカウント作成の流れ">
        <span><b>1</b>基本方針を選ぶ</span>
        <span><b>2</b>AIで一括作成</span>
        <span><b>3</b>AASへ回答を反映</span>
        <span><b>4</b>アイコン作成</span>
        <span><b>5</b>公式サイトで登録</span>
      </div>

      <div className="account-starter-ai">
        <label>
          <span>使うAI</span>
          <select value={provider} onChange={(event) => setProvider(event.target.value as AiProvider)}>
            {(Object.keys(AI_PROVIDER_LABELS) as AiProvider[]).map((key) => (
              <option key={key} value={key}>{AI_PROVIDER_LABELS[key]}</option>
            ))}
          </select>
        </label>
        <button className="primary-action" type="button" onClick={() => void copyAndLaunch()}>
          一括作成プロンプトをコピーしてAIを開く
        </button>
        <button className="secondary-action" type="button" disabled={busy} onClick={() => void importClipboard()}>
          {busy ? "読込中…" : "コピーしたAI回答を読み込んで一括反映"}
        </button>
      </div>

      <details className="account-starter-details">
        <summary>プロンプトを確認・手動コピー</summary>
        <textarea readOnly value={prompt} rows={18} onFocus={(event) => event.currentTarget.select()} />
      </details>

      <details className="account-starter-details">
        <summary>AI回答を手動で貼り付ける</summary>
        <textarea value={response} rows={12} onChange={(event) => setResponse(event.target.value)} placeholder="ChatGPT / Gemini / Claudeの回答全文をそのまま貼り付け" />
        <button className="secondary-action" type="button" disabled={busy || !response.trim()} onClick={() => void importResponse(response)}>
          貼り付けた回答を一括反映
        </button>
      </details>

      {message && <div className="route-notice account-starter-message" role="status">{message}</div>}

      {kit && (
        <div className="account-starter-result">
          <div className="account-starter-result-head">
            <div><span>AI STARTER KIT</span><h3>アカウント作成セット</h3><p>{kit.concept}</p></div>
            <a href={PLATFORM_HOME[design.platform]} target="_blank" rel="noreferrer">この内容で公式サイトへ進む ↗</a>
          </div>

          <section>
            <h4>表示名候補</h4>
            <div className="account-starter-chips">
              {kit.accountNameCandidates.map((name) => <button key={name} type="button" onClick={() => chooseName(name)}>{name}</button>)}
            </div>
          </section>

          <section>
            <h4>ID・ユーザー名候補</h4>
            <div className="account-starter-copy-list">
              {kit.handleCandidates.map((handle) => <button key={handle} type="button" onClick={() => void copy(handle, "ID候補")}>{handle}<small>コピー</small></button>)}
            </div>
            <small>候補の空き状況はAASでは確認・保証しません。登録画面で利用可能か確認してください。</small>
          </section>

          <div className="account-starter-result-grid">
            <section><h4>キャッチコピー</h4><p>{kit.tagline}</p></section>
            <section><h4>プロフィール</h4><p className="preserve-lines">{kit.profile}</p></section>
            <section><h4>発信の柱</h4><ol>{kit.contentPillars.map((item) => <li key={item}>{item}</li>)}</ol></section>
            <section><h4>最初の無料投稿案</h4><ol>{kit.freePostIdeas.map((item) => <li key={item}>{item}</li>)}</ol></section>
            {kit.paidPostIdeas.length > 0 && <section><h4>有料投稿案</h4><ol>{kit.paidPostIdeas.map((item) => <li key={item}>{item}</li>)}</ol></section>}
            <section><h4>登録〜初投稿チェックリスト</h4><ol>{kit.launchChecklist.map((item) => <li key={item}>{item}</li>)}</ol></section>
          </div>

          <section className="account-starter-icon">
            <div>
              <span>ACCOUNT ICON</span>
              <h4>このアカウント専用アイコン</h4>
              <p>{kit.icon.direction}</p>
              <small>{kit.icon.altText}</small>
            </div>
            <div className="account-starter-icon-actions">
              <button className="secondary-action" type="button" onClick={() => void copy(kit.icon.prompt, "アイコン生成プロンプト")}>アイコンプロンプトをコピー</button>
              <a className="openai-launch-action" href={OPENAI_LINKS.images} target="_blank" rel="noreferrer">ChatGPT Imagesでアイコンを作る ↗</a>
              <button className="secondary-action" type="button" onClick={() => void copy(kit.icon.suggestedFilename, "推奨ファイル名")}>{kit.icon.suggestedFilename}</button>
            </div>
            <textarea className="prompt-area" readOnly value={kit.icon.prompt} />
            <p className="account-starter-note">アイコン画像そのものは外部AIで生成し、端末へ保存します。AASはパスワードや外部サービスの認証情報を受け取らず、第三者ロゴ・著名キャラクターを使わないオリジナル画像プロンプトを作ります。</p>
          </section>

          {kit.warnings.length > 0 && <div className="account-starter-warnings">{kit.warnings.map((item) => <span key={item}>※ {item}</span>)}</div>}
        </div>
      )}
    </section>
  );
}
