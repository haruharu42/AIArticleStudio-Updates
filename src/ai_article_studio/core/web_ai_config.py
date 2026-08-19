from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

MODEL_CONFIG_URL = "https://raw.githubusercontent.com/haruharu42/AIArticleStudio-Updates/main/config/web_ai_models.json"
CACHE_TTL_SECONDS = 24 * 60 * 60

QUALITY_UI_TO_ID = {"速さ優先": "fast", "標準": "standard", "高品質": "high"}
QUALITY_ID_TO_UI = {v: k for k, v in QUALITY_UI_TO_ID.items()}

FALLBACK_CONFIG: dict[str, Any] = {
    "schema_version": 1,
    "config_version": "fallback-1",
    "providers": {
        "ChatGPT": {
            "launch_url": "https://chatgpt.com/",
            "models": [
                {"id": "gpt-5.5-instant", "label": "GPT-5.5 Instant", "quality": "fast", "enabled": True},
                {"id": "gpt-5.6-sol-medium", "label": "GPT-5.6 Sol（Medium）", "quality": "standard", "enabled": True},
                {"id": "gpt-5.6-sol-high", "label": "GPT-5.6 Sol（High）", "quality": "high", "enabled": True},
            ],
            "default_by_quality": {
                "fast": "gpt-5.5-instant",
                "standard": "gpt-5.6-sol-medium",
                "high": "gpt-5.6-sol-high",
            },
        },
        "Claude": {
            "launch_url": "https://claude.ai/",
            "models": [
                {"id": "claude-haiku-4.5", "label": "Claude Haiku 4.5", "quality": "fast", "enabled": True},
                {"id": "claude-sonnet-5", "label": "Claude Sonnet 5", "quality": "standard", "enabled": True},
                {"id": "claude-opus-4.8", "label": "Claude Opus 4.8", "quality": "high", "enabled": True},
            ],
            "default_by_quality": {
                "fast": "claude-haiku-4.5",
                "standard": "claude-sonnet-5",
                "high": "claude-opus-4.8",
            },
        },
        "Gemini": {
            "launch_url": "https://gemini.google.com/",
            "models": [
                {"id": "gemini-3.5-flash-lite", "label": "Gemini 3.5 Flash-Lite", "quality": "fast", "enabled": True},
                {"id": "gemini-3.6-flash", "label": "Gemini 3.6 Flash", "quality": "standard", "enabled": True},
                {"id": "gemini-3.1-pro-preview", "label": "Gemini 3.1 Pro Preview", "quality": "high", "enabled": True},
            ],
            "default_by_quality": {
                "fast": "gemini-3.5-flash-lite",
                "standard": "gemini-3.6-flash",
                "high": "gemini-3.1-pro-preview",
            },
        },
        "その他": {"launch_url": "", "models": [], "default_by_quality": {}},
    },
}


@dataclass
class WebAIModelConfig:
    payload: dict[str, Any]
    source: str
    config_version: str

    def provider(self, name: str) -> dict[str, Any]:
        return self.payload.get("providers", {}).get(name, {})

    def enabled_models(self, provider: str) -> list[dict[str, Any]]:
        return [m for m in self.provider(provider).get("models", []) if m.get("enabled", True)]

    def labels(self, provider: str) -> list[str]:
        return [str(m.get("label", "")).strip() for m in self.enabled_models(provider) if str(m.get("label", "")).strip()]

    def default_label(self, provider: str, quality_ui: str) -> str:
        qid = QUALITY_UI_TO_ID.get(quality_ui, "standard")
        p = self.provider(provider)
        wanted_id = p.get("default_by_quality", {}).get(qid)
        enabled = self.enabled_models(provider)
        for model in enabled:
            if model.get("id") == wanted_id:
                return str(model.get("label", ""))
        for model in enabled:
            if model.get("quality") == qid:
                return str(model.get("label", ""))
        return str(enabled[0].get("label", "")) if enabled else ""

    def quality_for_label(self, provider: str, label: str) -> str | None:
        for model in self.enabled_models(provider):
            if str(model.get("label", "")) == label:
                return QUALITY_ID_TO_UI.get(str(model.get("quality", "")))
        return None

    def launch_url(self, provider: str) -> str:
        return str(self.provider(provider).get("launch_url", "")).strip()


def _validate(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("model config must be an object")
    if int(payload.get("schema_version", 0)) != 1:
        raise ValueError("unsupported schema_version")
    providers = payload.get("providers")
    if not isinstance(providers, dict):
        raise ValueError("providers must be an object")
    for name, provider in providers.items():
        if not isinstance(provider, dict):
            raise ValueError(f"provider {name} must be an object")
        models = provider.get("models", [])
        if not isinstance(models, list):
            raise ValueError(f"provider {name} models must be a list")
        seen: set[str] = set()
        for model in models:
            if not isinstance(model, dict):
                raise ValueError(f"provider {name} contains invalid model")
            model_id = str(model.get("id", "")).strip()
            label = str(model.get("label", "")).strip()
            quality = str(model.get("quality", "")).strip()
            if not model_id or not label or quality not in {"fast", "standard", "high"}:
                raise ValueError(f"provider {name} contains incomplete model")
            if model_id in seen:
                raise ValueError(f"provider {name} has duplicate model id")
            seen.add(model_id)
    return payload


def _read_cache(cache_file: Path) -> tuple[dict[str, Any] | None, float]:
    if not cache_file.is_file():
        return None, 0.0
    try:
        wrapper = json.loads(cache_file.read_text(encoding="utf-8"))
        payload = _validate(wrapper.get("payload"))
        downloaded_at = float(wrapper.get("downloaded_at", 0))
        return payload, downloaded_at
    except Exception:
        return None, 0.0


def _write_cache(cache_file: Path, payload: dict[str, Any]) -> None:
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    wrapper = {
        "downloaded_at": time.time(),
        "source_url": MODEL_CONFIG_URL,
        "config_version": payload.get("config_version", ""),
        "payload": payload,
    }
    temp = cache_file.with_suffix(cache_file.suffix + ".tmp")
    temp.write_text(json.dumps(wrapper, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(cache_file)


def load_web_ai_model_config(data_dir: Path, force_refresh: bool = False, timeout: float = 4.0) -> WebAIModelConfig:
    cache_file = data_dir / "web_ai_models_cache.json"
    cached, downloaded_at = _read_cache(cache_file)
    if cached is not None and not force_refresh and time.time() - downloaded_at < CACHE_TTL_SECONDS:
        return WebAIModelConfig(cached, "cache", str(cached.get("config_version", "")))

    try:
        request = Request(MODEL_CONFIG_URL, headers={"User-Agent": "AIArticleStudio/Phase3.5"})
        with urlopen(request, timeout=timeout) as response:
            if getattr(response, "status", 200) != 200:
                raise RuntimeError(f"HTTP {getattr(response, 'status', 'error')}")
            raw = response.read(512 * 1024 + 1)
        if len(raw) > 512 * 1024:
            raise ValueError("model config is too large")
        payload = _validate(json.loads(raw.decode("utf-8-sig")))
        _write_cache(cache_file, payload)
        return WebAIModelConfig(payload, "remote", str(payload.get("config_version", "")))
    except Exception:
        if cached is not None:
            return WebAIModelConfig(cached, "stale-cache", str(cached.get("config_version", "")))
        fallback = _validate(FALLBACK_CONFIG)
        return WebAIModelConfig(fallback, "fallback", str(fallback.get("config_version", "")))
