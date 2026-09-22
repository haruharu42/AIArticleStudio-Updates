import { useState } from "react";
import { launchAiApp } from "@/lib/ai-app-links";
import { MagazinePlannerPanel } from "@/components/article-create/magazine-planner";
import type { MagazinePlanDraft } from "@/lib/magazine-planner";
import {
  parseTitleCandidates,
  publicationBodyForCopy,
  publicationEditorLink,
  stripLeadingArticleTitle,
  type ArticleCreationDraft,
  type ArticleType,
  type PublicationTarget,
  type SaveStatus,
} from "@/lib/phase11-create";
import { copyNoteRichText } from "@/lib/note-rich-text";
import type { ImagePromptItem } from "@/lib/phase13-image-prompts";
import {
  AGE_GROUP_OPTIONS,
  GENDER_OPTIONS,
  GENRE_OPTIONS,
  IMAGE_STYLE_OPTIONS,
  PAID_ARTICLE_PRICE_OPTIONS,
  TARGET_LENGTH_OPTIONS,
  genreSelectionValue,
  paidArticlePriceSelectionValue,
  subgenreOptionsFor,
  subgenreSelectionValue,
} from "@/lib/phase18-content-options";

export type ArticleDraftPatch = <K extends keyof ArticleCreationDraft>(
  key: K,
  value: ArticleCreationDraft[K],
) => void;

type MessageSetter = (value: string) => void;

const AI_LAUNCH_OPTIONS = [
  { key: "chatgpt", label: "ChatGPT" },
  { key: "claude", label: "Claude" },
  { key: "gemini", label: "Gemini" },
] as const;

async function copyText(value: string, setMessage: MessageSetter): Promise<boolean> {
  if (!navigator.clipboard?.writeText) {
    setMessage("このブラウザーでは自動コピーできません。テキストを選択してコピーしてください。");
    return false;
  }
  try {
    await navigator.clipboard.writeText(value);
    setMessage("クリップボードへコピーしました。");
    return true;
  } catch {
    setMessage("コピーできませんでした。テキストを選択してコピーしてください。");
    return false;
  }
}

async function readClipboardText(setMessage: MessageSetter): Promise<string | null> {
  if (!navigator.clipboard?.readText) {
    setMessage("このブラウザーでは貼り付けボタンを利用できません。入力欄を長押しして貼り付けてください。");
    return null;
  }
  try {
    const value = await navigator.clipboard.readText();
    if (!value) {
      setMessage("クリップボードに貼り付けられる文章がありません。");
      return null;
    }
    setMessage("クリップボードから貼り付けました。");
    return value;
  } catch {
    setMessage("クリップボードを読み取れませんでした。ブラウザーの許可を確認するか、入力欄を長押しして貼り付けてください。");
    return null;
  }
}

function CopyButton({
  value,
  label,
  setMessage,
  className = "secondary-action",
}: {
  value: string;
  label: string;
  setMessage: MessageSetter;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyText(value, setMessage);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  };

  return (
    <button className={className} type="button" disabled={!value} onClick={() => void handleCopy()}>
      {copied ? "コピーしました ✓" : label}
    </button>
  );
}

export function GenerationMethodStep({
  draft,
  patch,
  magazinePlan,
  onMagazinePlanChange,
  setGenre,
  setSubgenre,
}: {
  draft: ArticleCreationDraft;
  patch: ArticleDraftPatch;
  magazinePlan: MagazinePlanDraft;
  onMagazinePlanChange: (value: MagazinePlanDraft) => void;
  setGenre: (value: string) => void;
  setSubgenre: (value: string) => void;
}) {
  const chooseSingle = () => patch("magazineEnabled", false);
  const chooseMagazine = () => {
    patch("magazineEnabled", true);
    if (draft.publicationTarget !== "note") patch("publicationTarget", "note");
  };

  return (
    <div className="wizard-pane">
      <p className="eyebrow">STEP 1 · 種類の選択</p>
      <h2>何を作成しますか？</h2>

      <div className="article-kind-grid">
        <label className={`article-kind-card ${!draft.magazineEnabled ? "selected" : ""}`}>
          <input type="radio" checked={!draft.magazineEnabled} onChange={chooseSingle} />
          <span className="article-kind-icon" aria-hidden="true">▧</span>
          <span>
            <strong>通常記事を作成</strong>
            <small>1つの記事をこれまでと同じ作成フローで仕上げます。</small>
          </span>
        </label>
        <label className={`article-kind-card ${draft.magazineEnabled ? "selected" : ""}`}>
          <input type="radio" checked={draft.magazineEnabled} onChange={chooseMagazine} />
          <span className="article-kind-icon" aria-hidden="true">▤</span>
          <span>
            <strong>マガジンモード</strong>
            <small>マガジン全体の構成を先に設計してから、各記事を順番に作成します。</small>
          </span>
        </label>
      </div>

      <div className="generation-select-row">
        <label className="reference-field">
          <span>本文の作り方</span>
          <select
            value={draft.generationMode}
            onChange={(event) => patch("generationMode", event.target.value as ArticleCreationDraft["generationMode"])}
          >
            <option value="prompt_export">AI用プロンプトを作る</option>
            <option value="manual">自分で本文を書く</option>
          </select>
        </label>
      </div>

      {draft.magazineEnabled ? (
        <MagazinePlannerPanel
          draft={draft}
          plan={magazinePlan}
          patch={patch}
          setGenre={setGenre}
          setSubgenre={setSubgenre}
          onPlanChange={onMagazinePlanChange}
        />
      ) : (
        <p className="beginner-help">記事テーマの別入力は不要です。ジャンル・サブジャンル等を決めたあと、STEP 4で記事タイトルを作成します。</p>
      )}
    </div>
  );
}

export function ImagePlanStep({
  draft,
  patch,
}: {
  draft: ArticleCreationDraft;
  patch: ArticleDraftPatch;
}) {
  return (
    <div className="wizard-pane">
      <p className="eyebrow">STEP 2</p><h2>記事に画像を入れますか？</h2>
      <label className="choice-card"><input type="checkbox" checked={draft.coverEnabled} onChange={(event) => patch("coverEnabled", event.target.checked)} /><span><strong>アイキャッチ画像を作る</strong><small>記事の先頭に表示するメイン画像です。基本はONがおすすめです。</small></span></label>
      <label className="choice-card"><input type="checkbox" checked={draft.inlineEnabled} onChange={(event) => patch("inlineEnabled", event.target.checked)} /><span><strong>挿絵を作る</strong><small>本文の途中に入れる画像です。必要な場合だけONにしてください。</small></span></label>
      {draft.inlineEnabled && <label className="route-field"><span>挿絵枚数</span><select value={draft.inlineCount} onChange={(event) => patch("inlineCount", Number(event.target.value))}><option value={1}>1枚</option><option value={2}>2枚</option><option value={3}>3枚</option><option value={4}>4枚</option><option value={5}>5枚</option></select></label>}
    </div>
  );
}

export function ArticleConditionsStep({
  draft,
  patch,
  setGenre,
  setCustomGenre,
  setSubgenre,
  setArticleType,
}: {
  draft: ArticleCreationDraft;
  patch: ArticleDraftPatch;
  setGenre: (value: string) => void;
  setCustomGenre: (value: string) => void;
  setSubgenre: (value: string) => void;
  setArticleType: (value: ArticleType) => void;
}) {
  const genreSelectValue = genreSelectionValue(draft.genre);
  const subgenreSelectValue = subgenreSelectionValue(draft.genre, draft.subgenre);
  const subgenreOptions = subgenreOptionsFor(draft.genre);
  const priceSelectionValue = paidArticlePriceSelectionValue(draft.price);

  return (
    <div className="wizard-pane">
      <p className="eyebrow">STEP 3</p><h2>記事の基本条件を選んでください</h2>
      <p className="beginner-help">年齢・ジャンル・サブジャンルなどの選択条件をAAS Knowledge Compilerが組み合わせ、タイトル・本文・画像・SNS向けの指示へ反映します。</p>
      <div className="creator-form-grid">
        <label className="route-field"><span>掲載先</span><select value={draft.publicationTarget} disabled={draft.magazineEnabled} onChange={(event) => patch("publicationTarget", event.target.value as PublicationTarget)}>{draft.magazineEnabled ? <option value="note">note（マガジン）</option> : <><option value="note">note</option><option value="tips">Tips</option><option value="brain">Brain</option><option value="blog">ブログ</option></>}</select></label>
        <label className="route-field"><span>記事タイプ</span><select value={draft.articleType} onChange={(event) => setArticleType(event.target.value as ArticleType)}><option value="free">無料記事</option><option value="paid">有料記事</option></select></label>
        <label className="route-field"><span>ジャンル</span><select value={genreSelectValue} onChange={(event) => setGenre(event.target.value)}>{GENRE_OPTIONS.map((genre) => <option key={genre} value={genre}>{genre}</option>)}</select>{genreSelectValue === "その他" && <input className="taxonomy-custom-input" value={draft.genre === "その他" ? "" : draft.genre} onChange={(event) => setCustomGenre(event.target.value)} placeholder="例: 観葉植物、ペット防災、AI英会話" maxLength={120} />}</label>
        <label className="route-field"><span>サブジャンル</span><select value={subgenreSelectValue} onChange={(event) => setSubgenre(event.target.value)}>{subgenreOptions.map((subgenre) => <option key={subgenre} value={subgenre}>{subgenre}</option>)}</select>{subgenreSelectValue === "その他" && <input className="taxonomy-custom-input" value={draft.subgenre === "その他" ? "" : draft.subgenre} onChange={(event) => patch("subgenre", event.target.value.slice(0, 120))} placeholder="サブジャンルを具体的に入力" maxLength={120} />}</label>
        <label className="route-field"><span>対象年齢</span><select value={draft.ageGroup} onChange={(event) => patch("ageGroup", event.target.value)}>{AGE_GROUP_OPTIONS.map((age) => <option key={age} value={age}>{age}</option>)}</select></label>
        <label className="route-field"><span>対象性別</span><select value={draft.gender} onChange={(event) => patch("gender", event.target.value)}>{GENDER_OPTIONS.map((gender) => <option key={gender} value={gender}>{gender}</option>)}</select></label>
        <label className="route-field"><span>文字数の目安</span><select value={draft.targetLength} onChange={(event) => patch("targetLength", Number(event.target.value))}>{TARGET_LENGTH_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        {draft.articleType === "paid" && (
          <div className="paid-price-settings">
            <label className="route-field">
              <span>価格（円）</span>
              <select
                value={priceSelectionValue}
                onChange={(event) => {
                  if (event.target.value === "custom") {
                    if (priceSelectionValue !== "custom") patch("price", draft.price ?? 980);
                    return;
                  }
                  patch("price", Number(event.target.value));
                }}
              >
                {PAID_ARTICLE_PRICE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                <option value="custom">自由入力</option>
              </select>
            </label>
            {priceSelectionValue === "custom" && (
              <label className="route-field">
                <span>自由価格（円）</span>
                <input type="number" min={1} step={1} value={draft.price ?? 980} onChange={(event) => patch("price", Math.max(1, Math.trunc(Number(event.target.value) || 1)))} />
              </label>
            )}
            {draft.publicationTarget === "note" && (
              <p className="beginner-help paid-price-note">note公式では通常会員100〜50,000円、プレミアム/note proは上限100,000円です。読み物系の売上上位記事平均983円、実用ノウハウ系1,842円を参考に、980円・1,980円付近を選びやすくしています。</p>
            )}
          </div>
        )}
        <label className="choice-card compact"><input type="checkbox" checked={draft.affiliateEnabled} onChange={(event) => patch("affiliateEnabled", event.target.checked)} /><span><strong>アフィリエイトを使う</strong><small>商品・サービス紹介を含む記事の場合にON</small></span></label>
        {draft.magazineEnabled && <div className="magazine-inline-status"><strong>▤ マガジン作成モード</strong><small>STEP 1で選んだマガジン設計を保存時に引き継ぎます。</small></div>}
      </div>
      {(genreSelectValue === "その他" || subgenreSelectValue === "その他") && <p className="knowledge-learning-note">自由入力したジャンル・サブジャンルは、記事本文とは分離して候補名と利用回数だけを集計します。管理者は個人を特定せず集計候補を確認し、必要なものだけ正式ナレッジへ承認できます。</p>}
    </div>
  );
}

export function TitleStep({
  draft,
  patch,
  titlePrompt,
  titleCandidatesText,
  setTitleCandidatesText,
  onBeforeExternalLaunch,
  setMessage,
}: {
  draft: ArticleCreationDraft;
  patch: ArticleDraftPatch;
  titlePrompt: string;
  titleCandidatesText: string;
  setTitleCandidatesText: (value: string) => void;
  onBeforeExternalLaunch: () => void;
  setMessage: MessageSetter;
}) {
  const titleCandidates = parseTitleCandidates(titleCandidatesText);

  return (
    <div className="wizard-pane">
      <p className="eyebrow">STEP 4</p><h2>タイトルを5候補から選んでください</h2>
      {draft.generationMode === "prompt_export" && <>
        <p className="panel-muted">下のプロンプトをChatGPT・Claude・Geminiへ渡すと、タイトル候補を5個作成します。AIの回答5候補をまとめてAASへ貼り付けると、候補ボタンから選択できます。</p>
        <label className="route-field"><span>AI用タイトルプロンプト</span><textarea className="prompt-area" readOnly value={titlePrompt} /></label>
        <div className="openai-prompt-actions">
          <button className="secondary-action" type="button" onClick={() => copyText(titlePrompt, setMessage)}>タイトルプロンプトをコピー</button>
          {AI_LAUNCH_OPTIONS.map((app) => <button key={app.key} className="openai-launch-action" type="button" onClick={() => { onBeforeExternalLaunch(); launchAiApp(app.key); }}>{app.label}を開く ↗</button>)}
        </div>
        <label className="route-field title-candidate-paste">
          <span>AIが生成した5候補をまとめて貼り付け</span>
          <textarea
            value={titleCandidatesText}
            onChange={(event) => setTitleCandidatesText(event.target.value.slice(0, 10000))}
            placeholder={"1. タイトル候補A\n2. タイトル候補B\n3. タイトル候補C\n4. タイトル候補D\n5. タイトル候補E"}
          />
        </label>
        {titleCandidates.length > 0 && (
          <div className="title-candidates" aria-label="貼り付けたタイトル候補">
            {titleCandidates.map((title, index) => (
              <button
                type="button"
                key={`${index}-${title}`}
                onClick={() => patch("title", title)}
                className={draft.title === title ? "active" : ""}
              >
                <span>{index + 1}</span>{title}
              </button>
            ))}
          </div>
        )}
        {titleCandidatesText.trim() && titleCandidates.length < 5 && (
          <p className="beginner-help">現在 {titleCandidates.length}候補を認識しています。番号付きで1行に1候補ずつ貼り付けると最大5候補まで選択できます。</p>
        )}
        <p className="beginner-help">外部AIを開く直前と候補貼り付け後の内容は途中保存されます。AASへ戻ってもこの工程から続けられます。</p>
      </>}
      <label className="route-field">
        <span>{draft.generationMode === "prompt_export" ? "AIで生成したタイトルをここへ貼り付け（候補選択で自動入力）" : "タイトル"}</span>
        <input value={draft.title} onChange={(event) => patch("title", event.target.value)} placeholder={draft.generationMode === "prompt_export" ? "候補を選ぶか、タイトルを直接入力" : "記事タイトルを入力"} />
      </label>
    </div>
  );
}

export function BodyStep({
  draft,
  patch,
  articleBusy,
  articlePromptReady,
  articlePrompt,
  onGenerate,
  onBeforeExternalLaunch,
  setMessage,
}: {
  draft: ArticleCreationDraft;
  patch: ArticleDraftPatch;
  articleBusy: boolean;
  articlePromptReady: boolean;
  articlePrompt: string;
  onGenerate: () => Promise<void>;
  onBeforeExternalLaunch: () => void;
  setMessage: MessageSetter;
}) {
  return (
    <div className="wizard-pane">
      <p className="eyebrow">STEP 5</p><h2>本文を準備します</h2>
      {draft.generationMode === "prompt_export" && <>
        <p className="panel-muted">この画面を開くだけでは回数を消費しません。「完成記事プロンプトを作成」を押した時だけ記事生成1回として記録されます。</p>
        <button className="secondary-action" type="button" disabled={articleBusy} onClick={() => void onGenerate()}>{articleBusy ? "利用回数を確認中…" : articlePromptReady ? "完成記事プロンプトを作り直す" : "完成記事プロンプトを作成"}</button>
        {articlePromptReady && <>
          <label className="route-field"><span>AI用完成記事プロンプト</span><textarea className="prompt-area large" readOnly value={articlePrompt} /></label>
          <div className="openai-prompt-actions">
            <button className="secondary-action" type="button" onClick={() => copyText(articlePrompt, setMessage)}>完成記事プロンプトをコピー</button>
            {AI_LAUNCH_OPTIONS.map((app) => <button key={app.key} className="openai-launch-action" type="button" onClick={() => { onBeforeExternalLaunch(); launchAiApp(app.key); }}>{app.label}を開く ↗</button>)}
          </div>
          <p className="beginner-help">生成後のコピーやAIアプリ起動では追加消費しません。条件を変えて作り直した時だけ次の1回として記録されます。</p>
        </>}
      </>}
      <label className="route-field">
        <span>{draft.generationMode === "prompt_export" ? "生成した本文だけをここへ貼り付け" : "本文"}</span>
        <textarea
          className="body-area"
          value={draft.body}
          onPaste={(event) => {
            if (draft.body.trim()) return;
            const pasted = event.clipboardData.getData("text/plain");
            if (!pasted) return;
            event.preventDefault();
            const cleaned = stripLeadingArticleTitle(pasted, draft.title);
            patch("body", cleaned);
            setMessage(cleaned !== pasted.trimStart() ? "先頭に含まれていた記事タイトルを除外し、本文だけを貼り付けました。" : "本文を貼り付けました。");
          }}
          onChange={(event) => patch("body", event.target.value)}
          placeholder="## 見出し\n本文…"
        />
      </label>
      <p className="beginner-help">タイトルはSTEP 4で管理するため、この欄には本文だけを入れます。AIが先頭に同じタイトルを付けた場合は、空欄への貼り付け時にAASが自動で除外します。</p>
    </div>
  );
}

export function PreviewStep({
  draft,
  imagePrompts,
  combinedImagePrompt,
  onBeforeExternalLaunch,
  setMessage,
}: {
  draft: ArticleCreationDraft;
  imagePrompts: ImagePromptItem[];
  combinedImagePrompt: string;
  onBeforeExternalLaunch: () => void;
  setMessage: MessageSetter;
}) {
  return (
    <div className="wizard-pane">
      <p className="eyebrow">STEP 6</p><h2>内容を確認しましょう</h2>
      <div className="preview-meta"><span>{draft.publicationTarget}</span><span>{draft.articleType === "paid" ? "有料" : "無料"}</span><span>{draft.genre || "ジャンル未指定"}</span><span>{draft.subgenre || "サブジャンル未指定"}</span><span>{draft.body.length.toLocaleString()}文字</span></div>
      <h3>{draft.title || "タイトル未入力"}</h3>
      <pre className="creator-preview">{draft.body || "本文がまだありません。"}</pre>

      {imagePrompts.length > 0 && combinedImagePrompt && (
        <section className="creator-image-prompts" aria-label="記事画像生成プロンプト">
          <div className="creator-image-prompts-head">
            <h3>アイキャッチ・挿絵をまとめて作成</h3>
            <p className="panel-muted">STEP 2の画像設定と完成本文をもとに、アイキャッチと全挿絵を1つの依頼文へまとめています。1回コピーして画像生成AIへ貼り付けてください。</p>
          </div>
          <article className="creator-image-prompt-card">
            <div className="creator-image-prompt-title">
              <strong>まとめて画像作成プロンプト</strong>
              <span>{imagePrompts.length}枚分</span>
            </div>
            <textarea className="prompt-area large" readOnly value={combinedImagePrompt} />
            <div className="openai-prompt-actions">
              <button className="secondary-action" type="button" onClick={() => copyText(combinedImagePrompt, setMessage)}>まとめて画像プロンプトをコピー</button>
              {AI_LAUNCH_OPTIONS.map((app) => (
                <button key={app.key} className="openai-launch-action" type="button" onClick={() => { onBeforeExternalLaunch(); launchAiApp(app.key); }}>
                  {app.label}を開く ↗
                </button>
              ))}
            </div>
            <div className="creator-image-prompt-meta">
              {imagePrompts.map((item) => (
                <small key={item.kind + "-" + item.order}>
                  {item.kind === "cover" ? "アイキャッチ" : "挿絵 " + item.order}
                  {item.insertionMarker ? " / <!-- " + item.insertionMarker + " -->" : ""}
                  {" / " + item.suggestedFilename}
                </small>
              ))}
            </div>
          </article>
          <p className="beginner-help">1枚のコラージュではなく、アイキャッチ→挿絵1→挿絵2…を別画像として順番に作るようプロンプト内で指定しています。挿絵は本文の差し込み位置と周辺内容を参照します。</p>
        </section>
      )}
    </div>
  );
}

export function SaveStep({
  draft,
  patch,
  tagsText,
  setTagsText,
  busy,
  createdId,
  onSave,
  setMessage,
}: {
  draft: ArticleCreationDraft;
  patch: ArticleDraftPatch;
  tagsText: string;
  setTagsText: (value: string) => void;
  busy: boolean;
  createdId: string;
  onSave: () => Promise<void>;
  setMessage: MessageSetter;
}) {
  const publicationBody = publicationBodyForCopy(draft.body, draft.title);
  const editorLink = publicationEditorLink(draft.publicationTarget);
  const publicationLabel = draft.publicationTarget === "note"
    ? "note"
    : draft.publicationTarget === "tips"
      ? "Tips"
      : draft.publicationTarget === "brain"
        ? "Brain"
        : "ブログ";

  const copyPublicationBody = async () => {
    if (!publicationBody) return;
    try {
      await copyNoteRichText(publicationBody);
      setMessage(publicationLabel + "へ貼り付ける装飾付き本文をコピーしました。タイトルは含めていません。");
    } catch {
      copyText(publicationBody, setMessage);
    }
  };
  return (
    <div className="wizard-pane">
      <p className="eyebrow">STEP 7</p><h2>タグを設定して記事ライブラリへ保存</h2>
      <p className="panel-muted">タグは記事内容が完成してから決めます。ジャンル・サブジャンルに合わせて投稿前の最終設定として入力してください。</p>
      <section className="creator-publish-copy" aria-label="掲載用コピー">
        <h3>完成記事を掲載先へコピー</h3>
        <p className="panel-muted">タイトルと本文を分けてコピーします。本文は記事タイトルと画像差し込みマーカーを除き、見出し・太字・引用・リスト等の装飾を保てる形式でコピーします。</p>
        <div className="openai-prompt-actions">
          <button className="secondary-action" type="button" disabled={!draft.title.trim()} onClick={() => copyText(draft.title, setMessage)}>タイトルをコピー</button>
          <button className="primary-action" type="button" disabled={!publicationBody} onClick={() => void copyPublicationBody()}>完成本文を装飾付きコピー</button>
        </div>
        {editorLink
          ? <a className="openai-launch-action creator-publication-link" href={editorLink} target="_blank" rel="noreferrer">{publicationLabel}の投稿先を開く ↗</a>
          : <p className="beginner-help">「ブログ」は特定サービスを指さないため外部URLを固定していません。利用中のブログ管理画面を開いて貼り付けてください。</p>}
      </section>
      <label className="route-field"><span>タグ（任意・投稿前に設定）</span><input value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="例：恋愛, 人間関係, 職場" /></label>
      <label className="route-field"><span>保存状態</span><select value={draft.saveStatus} onChange={(event) => patch("saveStatus", event.target.value as SaveStatus)}><option value="draft">下書き</option><option value="writing">執筆中</option><option value="ready">完成</option></select></label>
      <dl className="route-meta"><div><dt>タイトル</dt><dd>{draft.title || "未入力"}</dd></div><div><dt>掲載先</dt><dd>{draft.publicationTarget}</dd></div><div><dt>ジャンル</dt><dd>{draft.genre} / {draft.subgenre}</dd></div><div><dt>本文</dt><dd>{draft.body.length.toLocaleString()}文字</dd></div><div><dt>画像</dt><dd>cover {draft.coverEnabled ? "ON" : "OFF"} / inline {draft.inlineEnabled ? draft.inlineCount : 0}</dd></div></dl>
      {!createdId && <button className="primary-action" type="button" disabled={busy || !draft.title.trim()} onClick={() => void onSave()}>{busy ? "保存中…" : "記事ライブラリへ保存"}</button>}
      {createdId && <div className="route-notice"><strong>保存完了</strong><br />Article ID: {createdId}</div>}
    </div>
  );
}
