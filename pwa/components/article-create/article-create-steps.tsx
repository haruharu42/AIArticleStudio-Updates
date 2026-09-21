import { launchAiApp } from "@/lib/ai-app-links";
import { MagazinePlannerPanel } from "@/components/article-create/magazine-planner";
import type { MagazinePlanDraft } from "@/lib/magazine-planner";
import type {
  ArticleCreationDraft,
  ArticleType,
  PublicationTarget,
  SaveStatus,
} from "@/lib/phase11-create";
import {
  AGE_GROUP_OPTIONS,
  GENDER_OPTIONS,
  GENRE_OPTIONS,
  TARGET_LENGTH_OPTIONS,
  genreSelectionValue,
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

function copyText(value: string, setMessage: MessageSetter) {
  if (!navigator.clipboard) {
    setMessage("このブラウザーでは自動コピーできません。テキストを選択してコピーしてください。");
    return;
  }
  void navigator.clipboard.writeText(value).then(
    () => setMessage("クリップボードへコピーしました。"),
    () => setMessage("コピーできませんでした。テキストを選択してコピーしてください。"),
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
        {!draft.magazineEnabled && (
          <label className="reference-field">
            <span>記事テーマ</span>
            <input value={draft.theme} onChange={(event) => patch("theme", event.target.value)} placeholder="例：30代初心者向けのAI副業の始め方" />
          </label>
        )}
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
        <p className="beginner-help">迷った場合は「誰向けに・何を解決する記事か」を1文で入力してください。</p>
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
  tagsText,
  setTagsText,
  setGenre,
  setCustomGenre,
  setSubgenre,
  setArticleType,
}: {
  draft: ArticleCreationDraft;
  patch: ArticleDraftPatch;
  tagsText: string;
  setTagsText: (value: string) => void;
  setGenre: (value: string) => void;
  setCustomGenre: (value: string) => void;
  setSubgenre: (value: string) => void;
  setArticleType: (value: ArticleType) => void;
}) {
  const genreSelectValue = genreSelectionValue(draft.genre);
  const subgenreSelectValue = subgenreSelectionValue(draft.genre, draft.subgenre);
  const subgenreOptions = subgenreOptionsFor(draft.genre);

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
        {draft.articleType === "paid" && <label className="route-field"><span>価格（円）</span><input type="number" min={1} value={draft.price ?? 1} onChange={(event) => patch("price", Math.max(1, Number(event.target.value) || 1))} /></label>}
        <label className="choice-card compact"><input type="checkbox" checked={draft.affiliateEnabled} onChange={(event) => patch("affiliateEnabled", event.target.checked)} /><span><strong>アフィリエイトを使う</strong><small>商品・サービス紹介を含む記事の場合にON</small></span></label>
        {draft.magazineEnabled && <div className="magazine-inline-status"><strong>▤ マガジン作成モード</strong><small>STEP 1で選んだマガジン設計を保存時に引き継ぎます。</small></div>}
        <label className="route-field full"><span>タグ（任意）</span><input value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="AI副業, 初心者, ChatGPT" /></label>
      </div>
      {(genreSelectValue === "その他" || subgenreSelectValue === "その他") && <p className="knowledge-learning-note">自由入力したジャンル・サブジャンルは、記事本文とは分離して候補名と利用回数だけを集計します。管理者は個人を特定せず集計候補を確認し、必要なものだけ正式ナレッジへ承認できます。</p>}
    </div>
  );
}

export function TitleStep({
  draft,
  patch,
  titlePrompt,
  onBeforeExternalLaunch,
  setMessage,
}: {
  draft: ArticleCreationDraft;
  patch: ArticleDraftPatch;
  titlePrompt: string;
  onBeforeExternalLaunch: () => void;
  setMessage: MessageSetter;
}) {
  return (
    <div className="wizard-pane">
      <p className="eyebrow">STEP 4</p><h2>タイトルを作成して貼り付けてください</h2>
      {draft.generationMode === "prompt_export" && <>
        <p className="panel-muted">AAS内ではタイトル候補を生成しません。下のプロンプトをChatGPT・Claude・Geminiへ渡し、生成されたタイトルをAASへ貼り付けてください。</p>
        <label className="route-field"><span>AI用タイトルプロンプト</span><textarea className="prompt-area" readOnly value={titlePrompt} /></label>
        <div className="openai-prompt-actions">
          <button className="secondary-action" type="button" onClick={() => copyText(titlePrompt, setMessage)}>タイトルプロンプトをコピー</button>
          {AI_LAUNCH_OPTIONS.map((app) => <button key={app.key} className="openai-launch-action" type="button" onClick={() => { onBeforeExternalLaunch(); launchAiApp(app.key); }}>{app.label}を開く ↗</button>)}
        </div>
        <p className="beginner-help">外部AIを開く直前に現在の作成状況を保存します。AASへ戻ったら、このタイトル工程と入力内容を復元します。</p>
      </>}
      <label className="route-field">
        <span>{draft.generationMode === "prompt_export" ? "AIで生成したタイトルをここへ貼り付け" : "タイトル"}</span>
        <input value={draft.title} onChange={(event) => patch("title", event.target.value)} placeholder={draft.generationMode === "prompt_export" ? "ChatGPTなどで生成したタイトルを貼り付け" : "記事タイトルを入力"} />
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
      <label className="route-field"><span>{draft.generationMode === "prompt_export" ? "生成した本文をここへ貼り付け" : "本文"}</span><textarea className="body-area" value={draft.body} onChange={(event) => patch("body", event.target.value)} placeholder="# 見出し\n本文…" /></label>
    </div>
  );
}

export function PreviewStep({ draft }: { draft: ArticleCreationDraft }) {
  return (
    <div className="wizard-pane">
      <p className="eyebrow">STEP 6</p><h2>内容を確認しましょう</h2>
      <div className="preview-meta"><span>{draft.publicationTarget}</span><span>{draft.articleType === "paid" ? "有料" : "無料"}</span><span>{draft.genre || "ジャンル未指定"}</span><span>{draft.subgenre || "サブジャンル未指定"}</span><span>{draft.body.length.toLocaleString()}文字</span></div>
      <h3>{draft.title || "タイトル未入力"}</h3>
      <pre className="creator-preview">{draft.body || "本文がまだありません。"}</pre>
    </div>
  );
}

export function SaveStep({
  draft,
  patch,
  busy,
  createdId,
  onSave,
}: {
  draft: ArticleCreationDraft;
  patch: ArticleDraftPatch;
  busy: boolean;
  createdId: string;
  onSave: () => Promise<void>;
}) {
  return (
    <div className="wizard-pane">
      <p className="eyebrow">STEP 7</p><h2>記事ライブラリへ保存</h2>
      <p className="panel-muted">記事・編集条件・画像計画を1つのWorkspaceとして保存します。保存後はPWAの記事ライブラリからいつでも続けて編集できます。</p>
      <label className="route-field"><span>保存状態</span><select value={draft.saveStatus} onChange={(event) => patch("saveStatus", event.target.value as SaveStatus)}><option value="draft">下書き</option><option value="writing">執筆中</option><option value="ready">完成</option></select></label>
      <dl className="route-meta"><div><dt>タイトル</dt><dd>{draft.title || "未入力"}</dd></div><div><dt>掲載先</dt><dd>{draft.publicationTarget}</dd></div><div><dt>ジャンル</dt><dd>{draft.genre} / {draft.subgenre}</dd></div><div><dt>本文</dt><dd>{draft.body.length.toLocaleString()}文字</dd></div><div><dt>画像</dt><dd>cover {draft.coverEnabled ? "ON" : "OFF"} / inline {draft.inlineEnabled ? draft.inlineCount : 0}</dd></div></dl>
      {!createdId && <button className="primary-action" type="button" disabled={busy || !draft.title.trim()} onClick={() => void onSave()}>{busy ? "保存中…" : "記事ライブラリへ保存"}</button>}
      {createdId && <div className="route-notice"><strong>保存完了</strong><br />Article ID: {createdId}</div>}
    </div>
  );
}
