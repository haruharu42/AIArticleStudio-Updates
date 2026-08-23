from __future__ import annotations

from dataclasses import asdict
from typing import Any

from .article_publish_text import build_article_text_variants
from .web_ai_publish import completion_steps
from .web_ai_state import WebAIWorkflowState
from .web_ai_workflow import WebAIWorkflow


class WebAIUIBridge:
    """Toolkit-agnostic UI bridge for the Web AI + image workflow."""

    def __init__(self, workflow: WebAIWorkflow | None = None):
        self.workflow = workflow or WebAIWorkflow()

    def resume_card(self) -> dict[str, Any]:
        state = self.workflow.state_store.load()
        if not state or not state.can_resume:
            return {"visible": False, "label": "", "step": "00"}
        return {"visible": True, "label": state.resume_label, "step": state.current_step, "article_id": state.article_id}

    def set_image_settings(self, settings: dict[str, Any]) -> dict[str, Any]:
        state = self.workflow.set_image_settings(settings)
        return dict(state.image_settings)

    def image_settings_snapshot(self) -> dict[str, Any]:
        return dict(self.workflow.snapshot().get("image_settings") or {})

    def image_prompt_status(self, article_text: str | None = None) -> dict[str, Any]:
        errors = self.workflow.validate_image_prompt_requirements(article_text=article_text)
        snap = self.workflow.snapshot()
        return {
            "ready": not errors,
            "errors": errors,
            "selected_title": snap.get("selected_title", ""),
            "has_article": bool((article_text or snap.get("formatted_output") or snap.get("normalized_output") or snap.get("raw_web_output") or "").strip()),
        }

    def build_image_prompts(self, article_text: str | None = None) -> dict[str, Any]:
        return self.workflow.build_image_prompts(article_text=article_text)

    def gpu_diagnostic(self) -> dict[str, Any]:
        return self.workflow.run_gpu_diagnostic()

    def build_title_step(
        self,
        request: Any,
        *,
        provider: str,
        quality: str,
        model_label: str,
        state: WebAIWorkflowState | None = None,
    ) -> dict[str, Any]:
        prompt, state = self.workflow.prepare_title_prompt(
            request, provider=provider, quality=quality, model_label=model_label, state=state
        )
        return {
            "step": state.current_step,
            "prompt": prompt,
            "copy_label": "タイトル用プロンプトをコピー",
            "open_ai_label": f"{provider}を開く",
            "paste_label": "AIの回答を貼り付ける",
        }

    def build_article_step(
        self,
        request: Any,
        selected_title: str,
        *,
        provider: str,
        quality: str,
        model_label: str,
        title_candidates: list[str] | None = None,
        title_response_raw: str = "",
        state: WebAIWorkflowState | None = None,
    ) -> dict[str, Any]:
        prompt, state = self.workflow.select_title(
            request,
            selected_title,
            provider=provider,
            quality=quality,
            model_label=model_label,
            title_candidates=title_candidates,
            title_response_raw=title_response_raw,
            state=state,
        )
        return {
            "step": state.current_step,
            "selected_title": state.selected_title,
            "prompt": prompt,
            "copy_label": "記事作成プロンプトをコピー",
            "paste_label": "完成記事を貼り付ける",
        }

    def ingest_step(
        self,
        raw_text: str,
        *,
        expect_paid: bool | None,
        state: WebAIWorkflowState | None = None,
    ) -> dict[str, Any]:
        result, issues, state = self.workflow.ingest_article(raw_text, expect_paid=expect_paid, state=state)
        return {
            "step": state.current_step,
            "raw_web_output": result.raw_web_output,
            "normalized_output": result.normalized_output,
            "title_detected": result.title_detected,
            "issues": [asdict(issue) for issue in issues],
            "can_continue": not any(issue.severity == "blocking" for issue in issues),
        }

    def publish_step(
        self,
        publish_text: str,
        *,
        platform: str,
        state: WebAIWorkflowState | None = None,
    ) -> dict[str, Any]:
        variants = build_article_text_variants(publish_text)
        state = self.workflow.set_publish_text(variants.source_text, platform=platform, state=state)
        readiness = self.workflow.publish_readiness(platform=platform, state=state)
        return {
            "step": state.current_step,
            "platform": readiness.platform,
            "can_publish": readiness.can_publish,
            "missing_requirements": list(readiness.missing_requirements or []),
            "actions": [asdict(action) for action in readiness.actions or []],
            "completion_steps": completion_steps(readiness),
            **variants.to_dict(),
        }

    def current_snapshot(self) -> dict[str, Any]:
        return self.workflow.snapshot()

    def history_items(self, limit: int = 10) -> list[dict[str, Any]]:
        return self.workflow.state_store.recent_summaries(limit)

    def load_history(self, article_id: str) -> dict[str, Any]:
        state = self.workflow.state_store.load_history(article_id)
        return asdict(state) if state else {}

    def delete_history(self, article_id: str) -> bool:
        return self.workflow.state_store.delete_history(article_id)

    def new_article(self) -> dict[str, Any]:
        state = self.workflow.state_store.start_new(generation_method="web")
        return asdict(state)

    def clear_article_content(self) -> dict[str, Any]:
        state = self.workflow.state_store.clear_article_content()
        return asdict(state)

    def save_editor_draft(self, raw_text: str | None = None, formatted_text: str | None = None) -> dict[str, Any]:
        state = self.workflow.state_store.load() or WebAIWorkflowState()
        if raw_text is not None:
            state.raw_web_output = str(raw_text)
        if formatted_text is not None:
            state.formatted_output = str(formatted_text)
        self.workflow.state_store.save(state)
        return asdict(state)

    def mark_completed(self) -> dict[str, Any]:
        state = self.workflow.mark_completed()
        return {"step": state.current_step, "is_completed": state.is_completed, "resume_visible": state.can_resume}
