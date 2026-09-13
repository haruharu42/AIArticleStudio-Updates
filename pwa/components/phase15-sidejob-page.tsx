"use client";

import { useMemo, useState } from "react";

import {
  buildSideJobStrategyPrompt,
  rankSideJobs,
  type SideJobInput,
} from "@/lib/phase15-sidejob";

const initial: SideJobInput = {
  weeklyHours: 5,
  faceReveal: "no",
  budget: "low",
  writing: 3,
  image: 2,
  video: 2,
  sales: 1,
  experience: "beginner",
  goal: "first_income",
};

export function Phase15SideJobPage() {
  const [input, setInput] = useState<SideJobInput>(initial);
  const [message, setMessage] = useState("");
  const suggestions = useMemo(() => rankSideJobs(input), [input]);
  const prompt = useMemo(
    () => buildSideJobStrategyPrompt(input, suggestions),
    [input, suggestions],
  );

  const patch = <K extends keyof SideJobInput>(key: K, value: SideJobInput[K]) => {
    setInput((current) => ({ ...current, [key]: value }));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setMessage("30日プラン生成プロンプトをコピーしました。");
    } catch {
      setMessage("自動コピーできません。テキスト欄からコピーしてください。");
    }
  };

  return (
    <main className="creator-page">
      <header className="creator-head">
        <div>
          <p className="eyebrow">AI SIDE JOB</p>
          <h1>AI副業プランナー</h1>
          <p>使える時間・得意分野・顔出し・予算から、取り組みやすいAI副業候補を整理します。</p>
        </div>
        <a className="route-back" href="/tools">← 機能一覧</a>
      </header>

      <section className="creator-card">
        <div className="creator-form-grid">
          <label className="route-field">
            <span>週の作業時間</span>
            <input type="number" min={1} max={100} value={input.weeklyHours} onChange={(event) => patch("weeklyHours", Math.max(1, Math.min(100, Number(event.target.value) || 1)))} />
          </label>
          <label className="route-field">
            <span>顔出し</span>
            <select value={input.faceReveal} onChange={(event) => patch("faceReveal", event.target.value as SideJobInput["faceReveal"])}><option value="no">しない</option><option value="either">どちらでも</option><option value="yes">できる</option></select>
          </label>
          <label className="route-field">
            <span>初期予算</span>
            <select value={input.budget} onChange={(event) => patch("budget", event.target.value as SideJobInput["budget"])}><option value="low">なるべく抑える</option><option value="medium">必要なら使える</option><option value="flexible">柔軟</option></select>
          </label>
          <label className="route-field">
            <span>経験</span>
            <select value={input.experience} onChange={(event) => patch("experience", event.target.value as SideJobInput["experience"])}><option value="beginner">初心者</option><option value="some">少し経験あり</option></select>
          </label>
          <label className="route-field">
            <span>文章の得意度 0〜5</span>
            <input type="range" min={0} max={5} value={input.writing} onChange={(event) => patch("writing", Number(event.target.value))} /><small>{input.writing}/5</small>
          </label>
          <label className="route-field">
            <span>画像の得意度 0〜5</span>
            <input type="range" min={0} max={5} value={input.image} onChange={(event) => patch("image", Number(event.target.value))} /><small>{input.image}/5</small>
          </label>
          <label className="route-field">
            <span>動画の得意度 0〜5</span>
            <input type="range" min={0} max={5} value={input.video} onChange={(event) => patch("video", Number(event.target.value))} /><small>{input.video}/5</small>
          </label>
          <label className="route-field">
            <span>営業・提案の得意度 0〜5</span>
            <input type="range" min={0} max={5} value={input.sales} onChange={(event) => patch("sales", Number(event.target.value))} /><small>{input.sales}/5</small>
          </label>
          <label className="route-field full">
            <span>優先したいこと</span>
            <select value={input.goal} onChange={(event) => patch("goal", event.target.value as SideJobInput["goal"])}><option value="first_income">まず小さく収益化を試す</option><option value="stable">継続しやすさを重視</option><option value="skill">将来使えるスキルを重視</option></select>
          </label>
        </div>

        <div className="sidejob-results">
          {suggestions.map((item, index) => (
            <article key={item.id} className="sidejob-card">
              <span>#{index + 1}</span>
              <h2>{item.title}</h2>
              <strong>適合スコア {item.score}</strong>
              <ul>{item.reason.map((reason) => <li key={reason}>{reason}</li>)}</ul>
              <h3>最初の3ステップ</h3>
              <ol>{item.firstSteps.map((step) => <li key={step}>{step}</li>)}</ol>
            </article>
          ))}
        </div>

        <label className="route-field">
          <span>AI用30日プラン生成プロンプト</span>
          <textarea className="prompt-area large" readOnly value={prompt} />
        </label>
        <button className="primary-action" type="button" onClick={() => void copy()}>プラン生成プロンプトをコピー</button>
        {message && <div className="route-notice">{message}</div>}
        <p className="panel-muted">適合スコアはAAS内の比較用です。収益・成功確率・市場順位を保証するものではありません。</p>
      </section>
    </main>
  );
}
