"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { loadAccessState, type AccessState } from "@/lib/phase6-access";
import { readMobileNavAlways, writeMobileNavAlways } from "@/lib/mobile-nav-preference";
import { getSupabaseClient } from "@/lib/supabase";
import {
  AI_PLAN_LABELS,
  AI_PROVIDER_LABELS,
  createDefaultWritingProfile,
  loadWritingProfile,
  resetWritingProfile,
  saveWritingProfile,
  summarizeWritingProfile,
  type AiPlan,
  type AiProvider,
  type CtaStyle,
  type HeadingStyle,
  type ListPreference,
  type PreferredPlatform,
  type UserWritingProfile,
  type WritingTone,
} from "@/lib/user-personalization";

type SettingsState = AccessState | { kind: "loading" } | { kind: "unavailable" };

export function PwaSettingsPage() {
  const router = useRouter();
  const [state, setState] = useState<SettingsState>({ kind: "loading" });
  const [alwaysShowNav, setAlwaysShowNav] = useState(true);
  const [writingProfile, setWritingProfile] = useState<UserWritingProfile | null>(null);
  const [writingBusy, setWritingBusy] = useState(false);
  const [writingLoading, setWritingLoading] = useState(false);
  const [writingMessage, setWritingMessage] = useState("");
  const profile = state.kind === "ready" ? state.profile : null;

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setAlwaysShowNav(readMobileNavAlways());
    });

    let client: ReturnType<typeof getSupabaseClient>;
    try {
      client = getSupabaseClient();
    } catch {
      queueMicrotask(() => {
        if (active) setState({ kind: "unavailable" });
      });
      return () => {
        active = false;
      };
    }

    void loadAccessState(client).then(
      (next) => {
        if (active) setState(next);
      },
      () => {
        if (active) setState({ kind: "unavailable" });
      },
    );

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!profile) {
      setWritingProfile(null);
      return;
    }
    let active = true;
    setWritingLoading(true);
    setWritingMessage("");
    void loadWritingProfile(getSupabaseClient(), profile.id).then(
      (next) => {
        if (active) setWritingProfile(next);
      },
      (error) => {
        if (active) {
          setWritingProfile(createDefaultWritingProfile(profile.id));
          setWritingMessage(error instanceof Error ? error.message : "あなた向け最適化の設定を取得できませんでした。");
        }
      },
    ).finally(() => {
      if (active) setWritingLoading(false);
    });
    return () => {
      active = false;
    };
  }, [profile?.id]);

  const toggleAlwaysShowNav = () => {
    const next = !alwaysShowNav;
    setAlwaysShowNav(next);
    writeMobileNavAlways(next);
  };

  const patchWritingProfile = <K extends keyof UserWritingProfile>(key: K, value: UserWritingProfile[K]) => {
    setWritingProfile((current) => current ? { ...current, [key]: value } : current);
  };

  const savePersonalization = async () => {
    if (!writingProfile) return;
    setWritingBusy(true);
    setWritingMessage("");
    try {
      const saved = await saveWritingProfile(getSupabaseClient(), writingProfile);
      setWritingProfile(saved);
      setWritingMessage("あなた向け最適化の設定をクラウドへ保存しました。");
    } catch (error) {
      setWritingMessage(error instanceof Error ? error.message : "あなた向け最適化の設定を保存できませんでした。");
    } finally {
      setWritingBusy(false);
    }
  };

  const resetPersonalization = async () => {
    if (!writingProfile || !window.confirm("AI設定・文章の好み・集計された利用傾向をリセットしますか？")) return;
    setWritingBusy(true);
    setWritingMessage("");
    try {
      const reset = await resetWritingProfile(getSupabaseClient(), writingProfile.userId);
      setWritingProfile(reset);
      setWritingMessage("あなた向け最適化を初期状態へリセットしました。");
    } catch (error) {
      setWritingMessage(error instanceof Error ? error.message : "あなた向け最適化をリセットできませんでした。");
    } finally {
      setWritingBusy(false);
    }
  };

  const logout = async () => {
    try {
      const client = getSupabaseClient();
      await client.auth.signOut({ scope: "local" });
    } finally {
      router.push("/");
      router.refresh();
    }
  };

  return (
    <div className="beginner-shell persistent-settings-shell">
      <header className="beginner-topbar">
        <Link className="beginner-brand" href="/" aria-label="AI Article Studio ホーム"><span aria-hidden="true">✦</span><strong>AI ARTICLE <em>STUDIO</em></strong></Link>
        {profile && <div className="beginner-account"><span>{profile.display_name || "ユーザー"}</span><small>{profile.aas_user_id}</small></div>}
      </header>

      <main className="beginner-main">
        <section className="beginner-settings-page persistent-settings-page">
          <p className="eyebrow">SETTINGS</p>
          <h1>設定</h1>
          <p>表示・AI・あなた向け最適化・アカウントに関する設定を確認できます。</p>

          <section className="persistent-settings-section" aria-labelledby="navigation-settings-title">
            <div>
              <strong id="navigation-settings-title">下部ナビを常に表示</strong>
              <small>ONにすると、記事作成・SNS・画像・各機能画面へ移動しても下部ナビを表示します。OFFではホームと設定画面だけに表示します。</small>
            </div>
            <button className={`persistent-toggle ${alwaysShowNav ? "on" : ""}`} type="button" role="switch" aria-checked={alwaysShowNav} onClick={toggleAlwaysShowNav}>
              <span aria-hidden="true" />
              <b>{alwaysShowNav ? "ON" : "OFF"}</b>
            </button>
          </section>

          {profile && (
            <section className="personalization-settings" aria-labelledby="personalization-settings-title">
              <div className="personalization-settings-head">
                <div>
                  <p className="eyebrow">PERSONALIZATION</p>
                  <h2 id="personalization-settings-title">あなた向け最適化</h2>
                  <p>使用するAIと文章の好みをクラウドへ保存し、記事プロンプトへ反映します。</p>
                </div>
                {writingProfile && (
                  <button
                    className={`persistent-toggle ${writingProfile.personalizationEnabled ? "on" : ""}`}
                    type="button"
                    role="switch"
                    aria-checked={writingProfile.personalizationEnabled}
                    onClick={() => patchWritingProfile("personalizationEnabled", !writingProfile.personalizationEnabled)}
                  >
                    <span aria-hidden="true" />
                    <b>{writingProfile.personalizationEnabled ? "ON" : "OFF"}</b>
                  </button>
                )}
              </div>

              {writingLoading && <p className="persistent-settings-status">個人設定を読み込んでいます…</p>}

              {writingProfile && !writingLoading && (
                <>
                  <div className="personalization-grid">
                    <label><span>普段使うAI</span><select value={writingProfile.preferredAi} onChange={(event) => patchWritingProfile("preferredAi", event.target.value as AiProvider)}>{(Object.keys(AI_PROVIDER_LABELS) as AiProvider[]).map((key) => <option key={key} value={key}>{AI_PROVIDER_LABELS[key]}</option>)}</select></label>
                    <label><span>利用プラン</span><select value={writingProfile.preferredPlan} onChange={(event) => patchWritingProfile("preferredPlan", event.target.value as AiPlan)}>{(Object.keys(AI_PLAN_LABELS) as AiPlan[]).map((key) => <option key={key} value={key}>{AI_PLAN_LABELS[key]}</option>)}</select></label>
                    <label><span>文章の雰囲気</span><select value={writingProfile.tone} onChange={(event) => patchWritingProfile("tone", event.target.value as WritingTone)}><option value="balanced">バランス</option><option value="friendly">やさしく親しみやすい</option><option value="professional">落ち着いた専門的</option><option value="casual">自然な会話調</option></select></label>
                    <label><span>見出し</span><select value={writingProfile.headingStyle} onChange={(event) => patchWritingProfile("headingStyle", event.target.value as HeadingStyle)}><option value="balanced">バランス</option><option value="short">短め</option><option value="descriptive">具体的・説明型</option></select></label>
                    <label><span>箇条書き</span><select value={writingProfile.listPreference} onChange={(event) => patchWritingProfile("listPreference", event.target.value as ListPreference)}><option value="balanced">必要に応じて</option><option value="low">少なめ</option><option value="high">多め</option></select></label>
                    <label><span>CTA</span><select value={writingProfile.ctaStyle} onChange={(event) => patchWritingProfile("ctaStyle", event.target.value as CtaStyle)}><option value="balanced">バランス</option><option value="soft">柔らかめ</option><option value="direct">行動を明確に</option></select></label>
                    <label><span>普段の掲載先</span><select value={writingProfile.preferredPlatform ?? ""} onChange={(event) => patchWritingProfile("preferredPlatform", (event.target.value || null) as PreferredPlatform | null)}><option value="">指定なし</option><option value="note">note</option><option value="tips">Tips</option><option value="brain">Brain</option><option value="blog">ブログ</option></select></label>
                    <label><span>普段のジャンル</span><input maxLength={100} value={writingProfile.preferredGenre} onChange={(event) => patchWritingProfile("preferredGenre", event.target.value)} placeholder="例: AI副業" /></label>
                  </div>

                  <label className="personalization-check"><input type="checkbox" checked={writingProfile.avoidHype} onChange={(event) => patchWritingProfile("avoidHype", event.target.checked)} /><span><strong>煽り表現を特に避ける</strong><small>成果保証・過度な期待・強すぎる販売表現を避ける方向へ寄せます。</small></span></label>

                  <div className="personalization-learned">
                    <strong>AASが保持している小さな利用傾向</strong>
                    <div>{summarizeWritingProfile(writingProfile).map((line) => <span key={line}>{line}</span>)}</div>
                    <small>個人最適化がONのとき、記事を保存すると掲載先・ジャンルなどの集計だけを更新します。</small>
                  </div>

                  <div className="personalization-privacy">
                    <strong>保存しないもの</strong>
                    <p>記事本文・AI回答全文・プロンプト全文を、個人最適化プロフィールとして複製保存しません。個人設定は本人だけが読み書きできるRLSで分離します。</p>
                  </div>

                  {writingMessage && <p className="personalization-message" role="status">{writingMessage}</p>}
                  <div className="personalization-actions">
                    <button type="button" disabled={writingBusy} onClick={() => void savePersonalization()}>{writingBusy ? "保存中…" : "最適化設定を保存"}</button>
                    <button type="button" className="danger" disabled={writingBusy} onClick={() => void resetPersonalization()}>学習内容をリセット</button>
                  </div>
                </>
              )}
            </section>
          )}

          {profile ? (
            <div className="beginner-settings-card">
              <div><strong>{profile.display_name || "ユーザー"}</strong><span>{profile.aas_user_id}</span><small>{profile.role} / {profile.status}</small></div>
              <span className="beginner-access-badge">● PWA利用可能</span>
            </div>
          ) : (
            <div className="persistent-settings-status" role="status">
              {state.kind === "loading" ? "アカウント情報を確認しています…" : state.kind === "signed_out" ? "ログイン状態を確認できませんでした。" : "アカウント情報を取得できませんでした。"}
            </div>
          )}

          <div className="beginner-settings-links">
            <Link href="/tools">機能一覧 <span>›</span></Link>
            <Link href="/terms">利用規約 <span>›</span></Link>
            <Link href="/privacy">プライバシーポリシー <span>›</span></Link>
            <Link href="/ai-terms">AI利用条件 <span>›</span></Link>
          </div>

          <div className="beginner-settings-actions">
            <Link className="persistent-settings-home" href="/">ホームへ戻る</Link>
            {profile && <button className="danger" type="button" onClick={() => void logout()}>ログアウト</button>}
          </div>
        </section>
      </main>
    </div>
  );
}
