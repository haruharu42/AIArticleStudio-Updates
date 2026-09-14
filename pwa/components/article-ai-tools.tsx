"use client";

import { useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { launchAiApp } from "@/lib/ai-app-links";
import {
  buildArticleAssistPrompt,
  buildArticleRewritePrompt,
  type ArticleAiToolInput,
} from "@/lib/article-ai-tools";
import {
  consumeFreeTrialUsage,
  trialUsageMessage,
  type TrialFeature,
} from "@/lib/free-trial";

const aiApps = [
  { key: "chatgpt", label: "ChatGPT" },
  { key: "claude", label: "Claude" },
  { key: "gemini", label: "Gemini" },
] as const;

type ToolKind = "rewrite" | "assist";

function copyPrompt(value: string, setMessage: (message: string) => void) {
  if (!navigator.clipboard) {
    setMessage("このブラウザーでは自動コピーできません。プロンプトを選択してコピーしてください。");
    return;
  }
  void navigator.clipboard.writeText(value).then(
    () => setMessage("プロンプトをクリップボードへコピーしました。"),
    () => setMessage("コピーできませんでした。プロンプトを選択してコピーしてください。"),
  );
}

export function ArticleAiTools({ client, input }: { client: SupabaseClient; input: ArticleAiToolInput }) {
  const [activeTool, setActiveTool] = useState<ToolKind | null>(null);
  const [prompt, setPrompt] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlightRef = useRef(false);

  const prepare = async (kind: ToolKind) => {
    if (inFlightRef.current || !input.body.trim()) return;
    inFlightRef.current = true;
    setBusy(true);
    setMessage("");
    try {
      const feature: TrialFeature = kind === "rewrite" ? "article_rewrite" : "ai_assist";
      const result = await consumeFreeTrialUsage(client, feature);
      if (!result.allowed) {
        setMessage(trialUsageMessage(result));
        return;
      }
      setActiveTool(kind);
      setPrompt(kind === "rewrite" ? buildArticleRewritePrompt(input) : buildArticleAssistPrompt(input));
      setMessage(
        result.bypassLimits
          ? kind === "rewrite" ? "リライト用プロンプトを作成しました。" : "AI改善チェック用プロンプトを作成しました。"
          : `${kind === "rewrite" ? "リライト" : "AI改善チェック"}を1回開始しました。${trialUsageMessage(result)}`,
      );
    } catch (error) {
      setPrompt("");
      setActiveTool(null);
      setMessage(error instanceof Error ? error.message : "AI機能の利用回数を確認できませんでした。");
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  };

  return (
    <section className="body-section article-ai-tools">
      <div className="article-ai-tools-head">
        <div>
          <h3>AI記事サポート</h3>
          <p>必要なときだけAI用プロンプトを作成します。無料トライアル中は、作成ボタンを押した時だけ1回として記録されます。</p>
        </div>
      </div>

      <div className="admin-actions article-ai-tool-actions">
        <button className="secondary-action" type="button" disabled={busy || !input.body.trim()} onClick={() => void prepare("rewrite")}>
          {busy ? "確認中…" : "AIリライト用プロンプトを作成"}
        </button>
        <button className="secondary-action" type="button" disabled={busy || !input.body.trim()} onClick={() => void prepare("assist")}>
          {busy ? "確認中…" : "AI改善チェックを開始"}
        </button>
      </div>

      {!input.body.trim() && <p className="route-notice">本文がある記事で利用できます。</p>}
      {message && <p className="route-notice" role="status">{message}</p>}

      {prompt && activeTool && (
        <div className="article-ai-prompt-result">
          <label className="route-field">
            <span>{activeTool === "rewrite" ? "リライト用プロンプト" : "改善チェック用プロンプト"}</span>
            <textarea className="prompt-area large" readOnly value={prompt} />
          </label>
          <div className="openai-prompt-actions">
            <button className="secondary-action" type="button" onClick={() => copyPrompt(prompt, setMessage)}>プロンプトをコピー</button>
            {aiApps.map((app) => (
              <button key={app.key} className="openai-launch-action" type="button" onClick={() => launchAiApp(app.key)}>
                {app.label}を開く ↗
              </button>
            ))}
          </div>
          <p className="beginner-help">コピーやAIアプリを開く操作では追加消費しません。別のプロンプトを作り直した時だけ次の1回として記録されます。</p>
        </div>
      )}
    </section>
  );
}
