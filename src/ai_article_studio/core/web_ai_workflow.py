from __future__ import annotations

from dataclasses import asdict
from typing import Any

from .gpu_diagnostic import diagnose_gpu
from .image_assets import ArticleImageStore
from .image_prompt_builder import build_image_prompt_bundle
from .image_settings import normalize_image_settings, style_label
from .paid_value import build_paid_value_profile, paid_value_prompt_lines
from .web_ai_ingest import WebAIIngestResult, ingest_web_ai_output
from .web_ai_prompt_builder import WebAIContext
from .web_prompt_engine_v2 import build_final_article_prompt_v2, build_title_prompt_v2
from .web_ai_publish import PublishReadyState, build_publish_ready_state
from .web_ai_repair import RepairIssue, build_repair_issues
from .web_ai_state import WebAIStateStore, WebAIWorkflowState, update_state


class WebAIWorkflow:
    """Integration facade for the Web AI production workflow."""

    def __init__(self, state_store: WebAIStateStore | None = None, image_store: ArticleImageStore | None = None):
        self.state_store = state_store or WebAIStateStore()
        self.image_store = image_store or ArticleImageStore()

    @staticmethod
    def _context(provider: str, quality: str, model_label: str) -> WebAIContext:
        return WebAIContext(provider=provider or "ChatGPT", quality=quality or "標準", model_label=model_label or "")

    @staticmethod
    def _request_dict(request: Any) -> dict[str, Any]:
        return dict(request) if isinstance(request, dict) else dict(getattr(request, "__dict__", {}))

    @staticmethod
    def _request_with_image_settings(request: Any, state: WebAIWorkflowState) -> dict[str, Any]:
        data = WebAIWorkflow._request_dict(request)
        cfg = normalize_image_settings(state.image_settings)
        if cfg.enabled:
            data["illustration_enabled"] = cfg.target in {"illustrations", "both"}
            data["illustration_count"] = "自動" if cfg.illustration_count == "auto" else cfg.illustration_count
            data["illustration_style"] = style_label(cfg.style)
            data["hide_illustration_list"] = not cfg.include_illustration_summary
        else:
            data["illustration_enabled"] = False
        return data

    @staticmethod
    def _article_text_and_source(state: WebAIWorkflowState, article_text: str | None = None) -> tuple[str, str]:
        if article_text is not None:
            return str(article_text or ""), "ui_current_text"
        if state.formatted_output.strip():
            return state.formatted_output, "formatted_output"
        if state.normalized_output.strip():
            return state.normalized_output, "normalized_output"
        if state.raw_web_output.strip():
            return state.raw_web_output, "raw_web_output"
        return "", "none"

    def set_image_settings(
        self,
        settings: dict[str, Any] | None,
        *,
        state: WebAIWorkflowState | None = None,
    ) -> WebAIWorkflowState:
        state = state or self.state_store.load() or WebAIWorkflowState()
        cfg = normalize_image_settings(settings)
        update_state(state, image_settings=cfg.to_dict())
        self.state_store.save(state)
        return state

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
        request_data = self._request_with_image_settings(request, state)
        prompt = build_title_prompt_v2(request_data, ctx)
        update_state(
            state,
            current_step="02",
            article_request=request_data,
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
        request_data = self._request_with_image_settings(request, state)
        paid = build_paid_value_profile(request_data)
        prompt = build_final_article_prompt_v2(request_data, selected_title, ctx)
        extra = paid_value_prompt_lines(paid)
        if extra:
            prompt = prompt.rstrip() + "\n\n【有料価値設計】\n" + "\n".join(extra) + "\n"
        update_state(
            state,
            current_step="03",
            article_request=request_data,
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

    def validate_image_prompt_requirements(
        self,
        *,
        article_text: str | None = None,
        state: WebAIWorkflowState | None = None,
    ) -> list[str]:
        state = state or self.state_store.load() or WebAIWorkflowState()
        cfg = normalize_image_settings(state.image_settings)
        text, _source = self._article_text_and_source(state, article_text)
        errors: list[str] = []
        if not cfg.enabled:
            errors.append("「画像を作る」をONにしてください。")
        if not state.selected_title.strip():
            errors.append("記事タイトルがまだ選択されていません。")
        if not text.strip():
            errors.append("記事本文がまだありません。Web版AIの完成記事を貼り付けて『掲載用に整える』まで進めてください。")
        return errors

    def build_image_prompts(
        self,
        *,
        article_text: str | None = None,
        state: WebAIWorkflowState | None = None,
    ) -> dict[str, Any]:
        state = state or self.state_store.load() or WebAIWorkflowState()
        cfg = normalize_image_settings(state.image_settings)
        text, source = self._article_text_and_source(state, article_text)
        errors = self.validate_image_prompt_requirements(article_text=article_text, state=state)
        bundle = build_image_prompt_bundle(
            state.article_request,
            state.selected_title,
            text,
            cfg,
        ) if not errors else build_image_prompt_bundle({}, "", "", {"enabled": False})
        payload = bundle.to_dict()
        payload.update(
            {
                "generator_mode": cfg.mode,
                "image_settings": cfg.to_dict(),
                "style_label": style_label(cfg.style),
                "article_source": source,
                "selected_title": state.selected_title,
                "errors": errors,
                "ready": not errors,
            }
        )
        update_state(state, image_assets_meta=payload)
        self.state_store.save(state)
        if state.article_id:
            try:
                self.image_store.save_payload(state.article_id, {"image_settings": cfg.to_dict(), **payload})
            except OSError:
                pass
        return payload

    def run_gpu_diagnostic(self, *, state: WebAIWorkflowState | None = None) -> dict[str, Any]:
        state = state or self.state_store.load() or WebAIWorkflowState()
        snapshot = diagnose_gpu().to_dict()
        update_state(state, gpu_diagnostic=snapshot)
        self.state_store.save(state)
        return snapshot

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
