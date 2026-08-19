from __future__ import annotations

from dataclasses import asdict
from typing import Any

from .web_ai_publish import completion_steps
from .web_ai_repair import build_repair_issues
from .web_ai_state import WebAIWorkflowState
from .web_ai_workflow import WebAIWorkflow


class WebAIUIBridge:
    """Toolkit-agnostic UI bridge for Phase 3.5.

    Existing desktop UI code can bind buttons and widgets to this class without
    importing individual B1-B8 modules. This keeps UI integration thin and makes
    the workflow reusable from Tkinter, CustomTkinter, Qt, or CLI shells.
    """

    def __init__(self, workflow: WebAIWorkflow | None = None):
        self.workflow = workflow or WebAIWorkflow()

    def resume_card(self) -> dict[str, Any]:
        state = self.workflow.state_store.load()
        if not state or not state.can_resume:
            return {"visible": False, "label": "", "step": "00"}
        return {
            "visible": True,
            "label": state.resume_label,
            "step": state.current_step,
            "article_id": state.article_id,
        }

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
            request,
            provider=provider,
            quality=quality,
            model_label=model_label,
            state=state,
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
        result, issues, state = self.workflow.ingest_article(
            raw_text,
            expect_paid=expect_paid,
            state=state,
        )
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
        state = self.workflow.set_publish_text(
            publish_text,
            platform=platform,
            state=state,
        )
        readiness = self.workflow.publish_readiness(platform=platform, state=state)
        return {
            "step": state.current_step,
            "platform": readiness.platform,
            "can_publish": readiness.can_publish,
            "missing_requirements": list(readiness.missing_requirements or []),
            "actions": [asdict(action) for action in readiness.actions or []],
            "completion_steps": completion_steps(readiness),
        }

    def current_snapshot(self) -> dict[str, Any]:
        return self.workflow.snapshot()

    def mark_completed(self) -> dict[str, Any]:
        state = self.workflow.mark_completed()
        return {
            "step": state.current_step,
            "is_completed": state.is_completed,
            "resume_visible": state.can_resume,
        }
