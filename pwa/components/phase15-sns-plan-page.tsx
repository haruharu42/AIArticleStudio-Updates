"use client";

import { useMemo, useState } from "react";

import { PresetSelect, type PresetOption } from "@/components/preset-select";
import {
  buildSnsLaunchPrompt,
  type SnsLaunchGoal,
  type SnsLaunchInput,
  type SnsLaunchPlatform,
} from "@/lib/phase15-sns-plan";
import { GENRE_OPTIONS } from "@/lib/phase18-content-options";
import { SOCIAL_PLATFORM_OPTIONS, socialLaunchHint, socialPlatformLabel, socialPlatformUrl } from "@/lib/social-links";
import { AUDIENCE_OPTIONS, OFFER_OPTIONS, STRENGTH_OPTIONS, TONE_OPTIONS, WEEKLY_POST_OPTIONS } from "@/lib/tool-options";

const NICHE_OPTIONS: readonly PresetOption[] = GENRE_OPTIONS
  .filter((value) => value !== "その他")
  .map((value) => ({ value, label: value }));

const GOAL_OPTIONS: readonly { value: SnsLaunchGoal; label: string }[] = [
  { value: "article_sales", label: "note・Tips・Brain等の記事販売" },
  { value: "affiliate", label: "アフィリエイト" },
  { value: "digital_product", label: "PDF・テンプレート等のデジタル商品" },
  { value: "client_work", label: "SNS運用代行・制作受託" },
  { value: "creator", label: "YouTube・TikTok・配信" },
  { value: "membership", label: "月額サービス・メンバーシップ" },
  { value: "app_service", label: "アプリ・Webサービスへの誘導" },
  { value: "lead_generation", label: "相談・問い合わせ獲得" },
];

const initial: SnsLaunchInput = {
  platform: "x",
  goal: "article_sales",
  niche: "AI副業",
  audience: "30代・初心者",
  strength: "文章を分かりやすく整理する",
  faceReveal: "no",
  weeklyPosts: 5,
  tone: "親しみやすく具体的",
  offer: "note・Tips・Brain等の記事",
};

export function Phase15SnsPlanPage() {
  const [input, setInput] = useState<SnsLaunchInput>(initial);
  const [weeklyPostsText, setWeeklyPostsText] = useState(String(initial.weeklyPosts));
  const [message, setMessage] = useState("");
  const prompt = useMemo(() => buildSnsLaunchPrompt(input), [input]);

  const patch = <K extends keyof SnsLaunchInput>(key: K, value: SnsLaunchInput[K]) => {
    setInput((current) => ({ ...current, [key]: value }));
  };

  const setWeeklyPosts = (value: string) => {
    if (!value.trim()) {
      setWeeklyPostsText("");
      patch("weeklyPosts", 1);
      return;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      setWeeklyPostsText("");
      patch("weeklyPosts", 1);
      return;
    }
    const normalized = Math.max(1, Math.min(21, Math.trunc(parsed)));
    setWeeklyPostsText(String(normalized));
    patch("weeklyPosts", normalized);
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
          <p>副業テーマからプロフィール、投稿の柱、収益導線、改善方針まで、選択肢を中心に設計します。</p>
        </div>
        <a className="route-back" href="/tools">← 機能一覧</a>
      </header>

      <section className="creator-card">
        <div className="creator-form-grid">
          <label className="route-field">
            <span>SNS</span>
            <select value={input.platform} onChange={(event) => patch("platform", event.target.value as SnsLaunchPlatform)}>
              {SOCIAL_PLATFORM_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="route-field">
            <span>収益化・誘導の方向</span>
            <select value={input.goal} onChange={(event) => patch("goal", event.target.value as SnsLaunchGoal)}>
              {GOAL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <PresetSelect label="ジャンル / テーマ" value={input.niche} onChange={(value) => patch("niche", value)} options={NICHE_OPTIONS} customPlaceholder="例: 60代向けスマホ活用" />
          <PresetSelect label="対象読者" value={input.audience} onChange={(value) => patch("audience", value)} options={AUDIENCE_OPTIONS} customPlaceholder="例: 子育て中の30代会社員" />
          <PresetSelect label="活かしたい強み" value={input.strength} onChange={(value) => patch("strength", value)} options={STRENGTH_OPTIONS} customPlaceholder="自分の強みを入力" />
          <label className="route-field"><span>顔出し</span><select value={input.faceReveal} onChange={(event) => patch("faceReveal", event.target.value as SnsLaunchInput["faceReveal"])}><option value="no">しない</option><option value="either">どちらでも</option><option value="yes">できる</option></select></label>
          <PresetSelect label="週の投稿目安" value={weeklyPostsText} onChange={setWeeklyPosts} options={WEEKLY_POST_OPTIONS} customPlaceholder="1〜21の数字を入力" customInputType="number" customMin={1} customMax={21} />
          <PresetSelect label="文章トーン" value={input.tone} onChange={(value) => patch("tone", value)} options={TONE_OPTIONS} customPlaceholder="希望する文章トーンを入力" />
          <PresetSelect label="販売・誘導したいもの" value={input.offer} onChange={(value) => patch("offer", value)} options={OFFER_OPTIONS} full customPlaceholder="販売・案内したいものを入力" />
        </div>

        <div className="route-notice">
          <strong>{socialPlatformLabel(input.platform)}を開く:</strong>{" "}
          <a href={socialPlatformUrl(input.platform)} target="_blank" rel="noreferrer">{socialPlatformLabel(input.platform)}を開く ↗</a>
          <div><small>{socialLaunchHint()}</small></div>
        </div>

        <label className="route-field">
          <span>AI用SNS立ち上げ設計プロンプト</span>
          <textarea className="prompt-area large" readOnly value={prompt} />
        </label>
        <button className="primary-action" type="button" onClick={() => void copy()}>設計プロンプトをコピー</button>
        {message && <div className="route-notice">{message}</div>}
        <p className="panel-muted">「その他（自由入力）」を選ぶと入力欄が表示されます。週の投稿目安は1〜21回の範囲に補正されます。アルゴリズムや収益額を決め打ちせず、実績を創作しない形で設計します。</p>
      </section>
    </main>
  );
}
