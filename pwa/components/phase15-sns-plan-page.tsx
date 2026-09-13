"use client";

import { useMemo, useState } from "react";

import {
  buildSnsLaunchPrompt,
  type SnsLaunchGoal,
  type SnsLaunchInput,
  type SnsLaunchPlatform,
} from "@/lib/phase15-sns-plan";

const initial: SnsLaunchInput = {
  platform: "x",
  goal: "article_sales",
  niche: "AI副業",
  audience: "30代・初心者",
  strength: "文章を分かりやすく整理する",
  faceReveal: "no",
  weeklyPosts: 5,
  tone: "親しみやすく、煽らず、具体的",
  offer: "note・Tips・Brain等の記事",
};

export function Phase15SnsPlanPage() {
  const [input, setInput] = useState<SnsLaunchInput>(initial);
  const [message, setMessage] = useState("");
  const prompt = useMemo(() => buildSnsLaunchPrompt(input), [input]);

  const patch = <K extends keyof SnsLaunchInput>(key: K, value: SnsLaunchInput[K]) => {
    setInput((current) => ({ ...current, [key]: value }));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setMessage("SNS立ち上げ設計プロンプトをコピーしました。");
    } catch {
      setMessage("自動コピーできません。テキスト欄からコピーしてください。");
    }
  };

  return (
    <main className="creator-page">
      <header className="creator-head">
        <div>
          <p className="eyebrow">SNS ACCOUNT DESIGN</p>
          <h1>SNSアカウント立ち上げ設計</h1>
          <p>副業テーマからプロフィール、投稿の柱、収益導線、改善方針までまとめて設計します。</p>
        </div>
        <a className="route-back" href="/tools">← 機能一覧</a>
      </header>

      <section className="creator-card">
        <div className="creator-form-grid">
          <label className="route-field">
            <span>SNS</span>
            <select value={input.platform} onChange={(event) => patch("platform", event.target.value as SnsLaunchPlatform)}>
              <option value="x">X</option>
              <option value="instagram">Instagram</option>
              <option value="threads">Threads</option>
            </select>
          </label>
          <label className="route-field">
            <span>収益化の方向</span>
            <select value={input.goal} onChange={(event) => patch("goal", event.target.value as SnsLaunchGoal)}>
              <option value="article_sales">note・Tips・Brain等の記事販売</option>
              <option value="affiliate">アフィリエイト</option>
              <option value="digital_product">デジタル商品</option>
              <option value="client_work">運用代行・制作受託</option>
              <option value="creator">YouTube・TikTok・配信</option>
            </select>
          </label>
          <label className="route-field"><span>ジャンル / テーマ</span><input value={input.niche} onChange={(event) => patch("niche", event.target.value)} /></label>
          <label className="route-field"><span>対象読者</span><input value={input.audience} onChange={(event) => patch("audience", event.target.value)} /></label>
          <label className="route-field"><span>活かしたい強み</span><input value={input.strength} onChange={(event) => patch("strength", event.target.value)} /></label>
          <label className="route-field"><span>顔出し</span><select value={input.faceReveal} onChange={(event) => patch("faceReveal", event.target.value as SnsLaunchInput["faceReveal"])}><option value="no">しない</option><option value="either">どちらでも</option><option value="yes">できる</option></select></label>
          <label className="route-field"><span>週の投稿目安</span><input type="number" min={1} max={21} value={input.weeklyPosts} onChange={(event) => patch("weeklyPosts", Math.max(1, Math.min(21, Number(event.target.value) || 1)))} /></label>
          <label className="route-field"><span>文章トーン</span><input value={input.tone} onChange={(event) => patch("tone", event.target.value)} /></label>
          <label className="route-field full"><span>販売・誘導したいもの</span><input value={input.offer} onChange={(event) => patch("offer", event.target.value)} placeholder="未定でも可" /></label>
        </div>

        <label className="route-field">
          <span>AI用SNS立ち上げ設計プロンプト</span>
          <textarea className="prompt-area large" readOnly value={prompt} />
        </label>
        <button className="primary-action" type="button" onClick={() => void copy()}>設計プロンプトをコピー</button>
        {message && <div className="route-notice">{message}</div>}
        <p className="panel-muted">アルゴリズムや収益額を決め打ちせず、実績を創作しない形で、アカウント設計→投稿→収益導線→改善の順に整理します。</p>
      </section>
    </main>
  );
}
