import { AI_APP_LINKS, type AiAppKey } from "@/lib/ai-app-links";
import { resolveSideHustleFieldValue } from "@/features/side-hustles/prompt-builder";
import type {
  SideHustleDefinition,
  SideHustleDraft,
  SideHustlePromptBuildResult,
} from "@/features/side-hustles/types";

export function SideHustlePromptStep({
  definition,
  draft,
  built,
  onCopyPrompt,
}: {
  definition: SideHustleDefinition;
  draft: SideHustleDraft;
  built: SideHustlePromptBuildResult;
  onCopyPrompt: (openAi?: AiAppKey) => Promise<void>;
}) {
  return (
    <section className="side-hustle-wizard-card">
      <div className="side-hustle-step-copy">
        <p className="eyebrow">STEP 4</p>
        <h2>専用プロンプト完成</h2>
        <p>選択内容・専用設計・最新ナレッジ・選択AI向け最適化を1本のプロンプトに統合しました。</p>
      </div>

      <section className="side-hustle-selection-summary" aria-label="選択内容の確認">
        <div>
          <strong>選択内容</strong>
          <small>AIへ渡す前に、各条件が意図どおりか確認できます。</small>
        </div>
        <dl>
          {definition.fields.map((field) => (
            <div key={field.key}>
              <dt>{field.label}</dt>
              <dd>{resolveSideHustleFieldValue(definition, field.key, draft.values[field.key])}</dd>
            </div>
          ))}
          <div>
            <dt>使用AI</dt>
            <dd>{AI_APP_LINKS[draft.selectedAi].name}</dd>
          </div>
          <div>
            <dt>利用プラン</dt>
            <dd>{draft.selectedPlan === "free" ? "Free" : "Paid / Plus / Pro 等"}</dd>
          </div>
        </dl>
      </section>

      <div className="side-hustle-applied-knowledge">
        <strong>適用ナレッジ</strong>
        <div>
          {built.appliedKnowledge.map((label) => <span key={label}>{label}</span>)}
        </div>
        {built.warnings.map((warning) => <small key={warning}>{warning}</small>)}
      </div>

      <label className="side-hustle-prompt-output">
        <span>完成プロンプト</span>
        <textarea readOnly value={built.prompt} rows={24} />
      </label>

      <div className="side-hustle-prompt-actions">
        <button className="primary-action" type="button" onClick={() => void onCopyPrompt(draft.selectedAi)}>
          コピーして{AI_APP_LINKS[draft.selectedAi].name}を開く
        </button>
        <button className="secondary-action" type="button" onClick={() => void onCopyPrompt()}>
          プロンプトだけコピー
        </button>
      </div>
    </section>
  );
}
