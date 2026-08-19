from __future__ import annotations

from dataclasses import asdict
from typing import Any

from .paid_value import build_paid_value_profile, paid_value_prompt_lines
from .web_ai_ingest import WebAIIngestResult, ingest_web_ai_output
from .web_ai_prompt_builder import WebAIContext, build_final_article_prompt, build_title_prompt
from .web_ai_publish import PublishReadyState, build_publish_ready_state
from .web_ai_repair import RepairIssue, build_repair_issues
from .web_ai_state import WebAIStateStore, WebAIWorkflowState, update_state


class WebAIWorkflow:
    """Integration facade for Phase 3.5 B1-B8.

    UI code should call this facade instead of stitching B4-B8 modules together
    independently. The raw Web-AI output is always preserved in state, while
    normalized/formatted publish text is stored separately.
    """

    def __init__(self, state_store: WebAIStateStore | None = None):
        self.state_store = state_store or WebAIStateStore()

    @staticmethod
    def _context(provider: str, quality: str, model_label: str) -> WebAIContext:
        return WebAIContext(provider=provider or "ChatGPT", quality=quality or "標準", model_label=model_label or "")

    def prepare_title_prompt(
        self,
        request: Any,
        *,
        provider: str,
        quality: str,
        model_label: str,
        state: WebAIWorkflowState | None = None,
    ) -> tuple[str, WebAIWorkflowState]:
        state = state or self.state_store.load() or WebAIWorkflowState()
        ctx = self._context(provider, quality, model_label)
        prompt = build_title_prompt(request, ctx)
        update_state(
            state,
            current_step="02",
            article_request=dict(request) if isinstance(request, dict) else dict(getattr(request, "__dict__", {})),
            provider=ctx.provider,
            quality=ctx.quality,
            model_label=ctx.model_label,
            title_prompt=prompt,
        )
        self.state_store.save(state)
        return prompt, state

    def select_title(
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
    ) -> tuple[str, WebAIWorkflowState]:
        state = state or self.state_store.load() or WebAIWorkflowState()
        ctx = self._context(provider, quality, model_label)
        paid = build_paid_value_profile(request)
        prompt = build_final_article_prompt(request, selected_title, ctx)
        extra = paid_value_prompt_lines(paid)
        if extra:
            prompt = prompt.rstrip() + "\n\n【有料価値設計】\n" + "\n".join(extra)
        update_state(
            state,
            current_step="03",
            title_candidates=list(title_candidates or []),
            selected_title=selected_title,
            title_response_raw=title_response_raw,
            final_prompt=prompt,
        )
        self.state_store.save(state)
        return prompt, state

    def ingest_article(
        self,
        raw_text: str,
        *,
        expect_paid: bool | None,
        state: WebAIWorkflowState | None = None,
    ) -> tuple[WebAIIngestResult, list[RepairIssue], WebAIWorkflowState]:
        state = state or self.state_store.load() or WebAIWorkflowState()
        result = ingest_web_ai_output(raw_text, expect_paid=expect_paid)
        issues = build_repair_issues(result)
        update_state(
            state,
            current_step="04",
            raw_web_output=result.raw_web_output,
            normalized_output=result.normalized_output,
            repair_warnings=[issue.code for issue in issues],
        )
        self.state_store.save(state)
        return result, issues, state

    def set_publish_text(
        self,
        publish_text: str,
        *,
        platform: str,
        state: WebAIWorkflowState | None = None,
    ) -> WebAIWorkflowState:
        state = state or self.state_store.load() or WebAIWorkflowState()
        update_state(state, formatted_output=publish_text, publish_platform=platform, current_step="04")
        self.state_store.save(state)
        return state

    def publish_readiness(
        self,
        *,
        platform: str,
        state: WebAIWorkflowState | None = None,
    ) -> PublishReadyState:
        state = state or self.state_store.load() or WebAIWorkflowState()
        text = state.formatted_output or state.normalized_output or state.raw_web_output
        return build_publish_ready_state(
            text,
            platform=platform,
            selected_title=state.selected_title,
            blocking_issues=[w for w in state.repair_warnings if w == "empty_output"],
        )

    def mark_completed(self, state: WebAIWorkflowState | None = None) -> WebAIWorkflowState:
        state = state or self.state_store.load() or WebAIWorkflowState()
        self.state_store.mark_completed(state)
        return state

    def snapshot(self, state: WebAIWorkflowState | None = None) -> dict[str, Any]:
        state = state or self.state_store.load() or WebAIWorkflowState()
        return asdict(state)
