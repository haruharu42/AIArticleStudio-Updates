"use client";

import { useEffect, useMemo, useState } from "react";

import { OPENAI_LINKS } from "@/lib/openai-links";
import { getSupabaseClient } from "@/lib/supabase";
import {
  buildArticlePrompt,
  buildTitlePrompt,
  createArticleFromWizard,
  suggestLocalTitles,
  type ArticleCreationDraft,
  type ArticleType,
  type PublicationTarget,
  type SaveStatus,
} from "@/lib/phase11-create";
import {
  AGE_GROUP_OPTIONS,
  GENDER_OPTIONS,
  GENRE_OPTIONS,
  TARGET_LENGTH_OPTIONS,
  subgenreOptionsFor,
} from "@/lib/phase18-content-options";

type Gate =
  | { kind: "loading" }
  | { kind: "signed_out" }
  | { kind: "denied"; message: string }
  | { kind: "ready"; ownerId: string; aasId: string }
  | { kind: "error"; message: string };

const initialDraft: ArticleCreationDraft = {
  generationMode: "prompt_export",
  theme: "",
  title: "",
  publicationTarget: "note",
  articleType: "free",
  genre: "AI副業",
  subgenre: "AIおまかせ",
  ageGroup: "30代",
  gender: "AIおまかせ",
  targetLength: 5000,
  price: null,
  affiliateEnabled: false,
  magazineEnabled: false,
  tags: [],
  coverEnabled: true,
  inlineEnabled: false,
  inlineCount: 2,
  body: "",
  saveStatus: "writing",
};

const steps = ["生成方法", "画像計画", "本文条件", "タイトル", "本文生成", "プレビュー", "保存"];

function copyText(value: string, setMessage: (value: string) => void) {
  if (!navigator.clipboard) {
    setMessage("このブラウザーでは自動コピーできません。テキストを選択してコピーしてください。");
    return;
  }
  void navigator.clipboard.writeText(value).then(
    () => setMessage("クリップボードへコピーしました。"),
    () => setMessage("コピーできませんでした。テキストを選択してコピーしてください。"),
  );
}

export function Phase11CreatePage() {
  const [gate, setGate] = useState<Gate>({ kind: "loading" });
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ArticleCreationDraft>(initialDraft);
  const [tagsText, setTagsText] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [createdId, setCreatedId] = useState("");

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        const client = getSupabaseClient();
        const { data: { user }, error } = await client.auth.getUser();
        if (!active) return;
        if (error || !user) { setGate({ kind: "signed_out" }); return; }
        const { data: profile, error: profileError } = await client
          .from("profiles")
          .select("id,aas_user_id,status")
          .eq("id", user.id)
          .single();
        if (profileError || !profile || profile.id !== user.id) throw new Error("プロフィールを確認できません。");
        if (profile.status !== "active") { setGate({ kind: "denied", message: "記事作成にはactiveアカウントが必要です。" }); return; }
        const { data: access, error: accessError } = await client.rpc("can_access_product", { p_product_code: "AAS-PWA-BETA" });
        if (accessError || access !== true) { setGate({ kind: "denied", message: "PWA利用権が必要です。" }); return; }
        setGate({ kind: "ready", ownerId: user.id, aasId: profile.aas_user_id });
      } catch (error) {
        if (active) setGate({ kind: "error", message: error instanceof Error ? error.message : "初期化に失敗しました。" });
      }
    };
    void boot();
    return () => { active = false; };
  }, []);

  const localTitles = useMemo(() => suggestLocalTitles(draft), [draft]);
  const titlePrompt = useMemo(() => buildTitlePrompt({ ...draft, tags: tagsText.split(/[,、\n]/).map((tag) => tag.trim()).filter(Boolean) }), [draft, tagsText]);
  const articlePrompt = useMemo(() => buildArticlePrompt({ ...draft, tags: tagsText.split(/[,、\n]/).map((tag) => tag.trim()).filter(Boolean) }), [draft, tagsText]);
  const subgenreOptions = useMemo(() => subgenreOptionsFor(draft.genre), [draft.genre]);

  const patch = <K extends keyof ArticleCreationDraft>(key: K, value: ArticleCreationDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const setGenre = (genre: string) => {
    const nextSubgenres = subgenreOptionsFor(genre);
    setDraft((current) => ({
      ...current,
      genre,
      subgenre: nextSubgenres.includes(current.subgenre) ? current.subgenre : nextSubgenres[0] ?? "AIおまかせ",
    }));
  };

  const setArticleType = (value: ArticleType) => {
    setDraft((current) => ({
      ...current,
      articleType: value,
      price: value === "free" ? null : current.price !== null && current.price > 0 ? current.price : 1,
    }));
  };

  const next = () => { setMessage(""); setStep((current) => Math.min(steps.length - 1, current + 1)); };
  const back = () => { setMessage(""); setStep((current) => Math.max(0, current - 1)); };

  const save = async () => {
    if (gate.kind !== "ready") return;
    setBusy(true); setMessage("");
    try {
      const result = await createArticleFromWizard(
        getSupabaseClient(),
        gate.ownerId,
        { ...draft, tags: tagsText.split(/[,、\n]/).map((tag) => tag.trim()).filter(Boolean) },
      );
      setCreatedId(result.id);
      setMessage(`「${result.title}」をクラウド記事ライブラリへ保存しました。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "記事保存に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  if (gate.kind !== "ready") {
    return (
      <main className="standalone-page"><section className="standalone-card">
        <p className="eyebrow">ARTICLE CREATOR</p><h1>記事を作る</h1>
        {gate.kind === "loading" && <p className="route-notice">アカウントと利用権を確認しています…</p>}
        {gate.kind === "signed_out" && <p className="route-notice error">先にホームからログインしてください。</p>}
        {gate.kind === "denied" && <p className="route-notice error">{gate.message}</p>}
        {gate.kind === "error" && <p className="route-notice error">{gate.message}</p>}
        <a className="route-back" href="/">← ホームへ戻る</a>
      </section></main>
    );
  }

  return (
    <main className="creator-page beginner-creator-page">
      <header className="creator-head">
        <div>
          <p className="eyebrow">ARTICLE CREATOR</p>
          <h1>記事を作る</h1>
          <p>上から順番に選ぶだけで、記事条件・画像計画・タイトル・本文をまとめて保存できます。</p>
        </div>
        <a className="route-back" href="/">← ホーム</a>
      </header>

      <ol className="wizard-steps">
        {steps.map((label, index) => <li key={label} className={index === step ? "active" : index < step ? "done" : ""}><span>{index + 1}</span>{label}</li>)}
      </ol>

      <section className="creator-card">
        {step === 0 && (
          <div className="wizard-pane">
            <p className="eyebrow">STEP 1</p><h2>どの方法で記事を作りますか？</h2>
            <label className="choice-card"><input type="radio" checked={draft.generationMode === "prompt_export"} onChange={() => patch("generationMode", "prompt_export")} /><span><strong>ChatGPTを使って作る</strong><small>タイトル・本文用のプロンプトを作成します。生成結果を貼り付けて保存できます。</small></span></label>
            <label className="choice-card"><input type="radio" checked={draft.generationMode === "manual"} onChange={() => patch("generationMode", "manual")} /><span><strong>自分で本文を書く</strong><small>タイトルと本文を直接入力して共通記事ライブラリへ保存します。</small></span></label>
            <label className="route-field"><span>記事テーマ</span><textarea value={draft.theme} onChange={(e) => patch("theme", e.target.value)} placeholder="例: 30代初心者向けのAI副業の始め方" /></label>
            <p className="beginner-help">迷った場合は「誰向けに・何を解決する記事か」を1文で入力してください。</p>
          </div>
        )}

        {step === 1 && (
          <div className="wizard-pane"><p className="eyebrow">STEP 2</p><h2>記事に画像を入れますか？</h2>
            <label className="choice-card"><input type="checkbox" checked={draft.coverEnabled} onChange={(e) => patch("coverEnabled", e.target.checked)} /><span><strong>アイキャッチ画像を作る</strong><small>記事の先頭に表示するメイン画像です。基本はONがおすすめです。</small></span></label>
            <label className="choice-card"><input type="checkbox" checked={draft.inlineEnabled} onChange={(e) => patch("inlineEnabled", e.target.checked)} /><span><strong>挿絵を作る</strong><small>本文の途中に入れる画像です。必要な場合だけONにしてください。</small></span></label>
            {draft.inlineEnabled && <label className="route-field"><span>挿絵枚数</span><select value={draft.inlineCount} onChange={(e) => patch("inlineCount", Number(e.target.value))}><option value={1}>1枚</option><option value={2}>2枚</option><option value={3}>3枚</option><option value={4}>4枚</option><option value={5}>5枚</option></select></label>}
          </div>
        )}

        {step === 2 && (
          <div className="wizard-pane"><p className="eyebrow">STEP 3</p><h2>記事の基本条件を選んでください</h2>
            <p className="beginner-help">初心者でも迷わないよう、主要項目はプルダウンから選べるようにしています。</p>
            <div className="creator-form-grid">
              <label className="route-field"><span>掲載先</span><select value={draft.publicationTarget} onChange={(e) => patch("publicationTarget", e.target.value as PublicationTarget)}><option value="note">note</option><option value="tips">Tips</option><option value="brain">Brain</option><option value="blog">ブログ</option></select></label>
              <label className="route-field"><span>記事タイプ</span><select value={draft.articleType} onChange={(e) => setArticleType(e.target.value as ArticleType)}><option value="free">無料記事</option><option value="paid">有料記事</option></select></label>
              <label className="route-field"><span>ジャンル</span><select value={draft.genre} onChange={(e) => setGenre(e.target.value)}>{GENRE_OPTIONS.map((genre) => <option key={genre} value={genre}>{genre}</option>)}</select></label>
              <label className="route-field"><span>サブジャンル</span><select value={draft.subgenre} onChange={(e) => patch("subgenre", e.target.value)}>{subgenreOptions.map((subgenre) => <option key={subgenre} value={subgenre}>{subgenre}</option>)}</select></label>
              <label className="route-field"><span>対象年齢</span><select value={draft.ageGroup} onChange={(e) => patch("ageGroup", e.target.value)}>{AGE_GROUP_OPTIONS.map((age) => <option key={age} value={age}>{age}</option>)}</select></label>
              <label className="route-field"><span>対象性別</span><select value={draft.gender} onChange={(e) => patch("gender", e.target.value)}>{GENDER_OPTIONS.map((gender) => <option key={gender} value={gender}>{gender}</option>)}</select></label>
              <label className="route-field"><span>文字数の目安</span><select value={draft.targetLength} onChange={(e) => patch("targetLength", Number(e.target.value))}>{TARGET_LENGTH_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              {draft.articleType === "paid" && <label className="route-field"><span>価格（円）</span><input type="number" min={1} value={draft.price ?? 1} onChange={(e) => patch("price", Math.max(1, Number(e.target.value) || 1))} /></label>}
              <label className="choice-card compact"><input type="checkbox" checked={draft.affiliateEnabled} onChange={(e) => patch("affiliateEnabled", e.target.checked)} /><span><strong>アフィリエイトを使う</strong><small>商品・サービス紹介を含む記事の場合にON</small></span></label>
              <label className="choice-card compact"><input type="checkbox" checked={draft.magazineEnabled} onChange={(e) => patch("magazineEnabled", e.target.checked)} /><span><strong>マガジンに入れる</strong><small>note等でシリーズ管理する場合にON</small></span></label>
              <label className="route-field full"><span>タグ（任意）</span><input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="AI副業, 初心者, ChatGPT" /></label>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="wizard-pane"><p className="eyebrow">STEP 4</p><h2>タイトルを選んでください</h2>
            <p className="panel-muted">候補をタップするだけで選択できます。必要なら自分で書き換えることもできます。</p>
            <div className="title-candidates">{localTitles.map((title) => <button type="button" key={title} onClick={() => patch("title", title)} className={draft.title === title ? "active" : ""}>{title}</button>)}</div>
            <label className="route-field"><span>選択タイトル</span><input value={draft.title} onChange={(e) => patch("title", e.target.value)} /></label>
            {draft.generationMode === "prompt_export" && <>
              <label className="route-field"><span>ChatGPT用タイトルプロンプト</span><textarea className="prompt-area" readOnly value={titlePrompt} /></label>
              <div className="openai-prompt-actions">
                <button className="secondary-action" type="button" onClick={() => copyText(titlePrompt, setMessage)}>タイトルプロンプトをコピー</button>
                <a className="openai-launch-action" href={OPENAI_LINKS.chatgpt} target="_blank" rel="noreferrer">ChatGPTを開く ↗</a>
              </div>
              <p className="beginner-help">「コピー」→「ChatGPTを開く」の順に進み、ChatGPTへ貼り付けてください。</p>
            </>}
          </div>
        )}

        {step === 4 && (
          <div className="wizard-pane"><p className="eyebrow">STEP 5</p><h2>本文を準備します</h2>
            {draft.generationMode === "prompt_export" && <>
              <label className="route-field"><span>ChatGPT用完成記事プロンプト</span><textarea className="prompt-area large" readOnly value={articlePrompt} /></label>
              <div className="openai-prompt-actions">
                <button className="secondary-action" type="button" onClick={() => copyText(articlePrompt, setMessage)}>完成記事プロンプトをコピー</button>
                <a className="openai-launch-action" href={OPENAI_LINKS.chatgpt} target="_blank" rel="noreferrer">ChatGPTを開く ↗</a>
              </div>
              <p className="beginner-help">生成された完成記事をコピーして、下の本文欄へ貼り付けます。</p>
            </>}
            <label className="route-field"><span>{draft.generationMode === "prompt_export" ? "生成した本文をここへ貼り付け" : "本文"}</span><textarea className="body-area" value={draft.body} onChange={(e) => patch("body", e.target.value)} placeholder="# 見出し\n本文…" /></label>
          </div>
        )}

        {step === 5 && (
          <div className="wizard-pane"><p className="eyebrow">STEP 6</p><h2>内容を確認しましょう</h2>
            <div className="preview-meta"><span>{draft.publicationTarget}</span><span>{draft.articleType === "paid" ? "有料" : "無料"}</span><span>{draft.genre || "ジャンル未指定"}</span><span>{draft.subgenre || "サブジャンル未指定"}</span><span>{draft.body.length.toLocaleString()}文字</span></div>
            <h3>{draft.title || "タイトル未入力"}</h3>
            <pre className="creator-preview">{draft.body || "本文がまだありません。"}</pre>
          </div>
        )}

        {step === 6 && (
          <div className="wizard-pane"><p className="eyebrow">STEP 7</p><h2>記事ライブラリへ保存</h2>
            <p className="panel-muted">記事・編集条件・画像計画を1つのWorkspaceとして保存します。Windows版から同じ記事を続けて編集できます。</p>
            <label className="route-field"><span>保存状態</span><select value={draft.saveStatus} onChange={(e) => patch("saveStatus", e.target.value as SaveStatus)}><option value="draft">下書き</option><option value="writing">執筆中</option><option value="ready">完成</option></select></label>
            <dl className="route-meta"><div><dt>タイトル</dt><dd>{draft.title || "未入力"}</dd></div><div><dt>掲載先</dt><dd>{draft.publicationTarget}</dd></div><div><dt>ジャンル</dt><dd>{draft.genre} / {draft.subgenre}</dd></div><div><dt>本文</dt><dd>{draft.body.length.toLocaleString()}文字</dd></div><div><dt>画像</dt><dd>cover {draft.coverEnabled ? "ON" : "OFF"} / inline {draft.inlineEnabled ? draft.inlineCount : 0}</dd></div></dl>
            {!createdId && <button className="primary-action" type="button" disabled={busy || !draft.title.trim()} onClick={() => void save()}>{busy ? "保存中…" : "記事ライブラリへ保存"}</button>}
            {createdId && <div className="route-notice"><strong>保存完了</strong><br />Article ID: {createdId}</div>}
          </div>
        )}

        {message && <div className="route-notice">{message}</div>}

        <footer className="wizard-actions">
          <button className="secondary-action" type="button" disabled={step === 0 || busy} onClick={back}>戻る</button>
          {step < steps.length - 1 && <button className="primary-action" type="button" disabled={busy} onClick={next}>次へ →</button>}
          {createdId && <a className="primary-action" href="/">ホームへ戻る</a>}
        </footer>
      </section>
    </main>
  );
}
