# AI Article Studio v0.4.2 Preview
## Phase 3.6 file-level implementation guide

## 1. Purpose
This document converts the Phase 3.6 Preview handoff into file-level implementation tasks for the current v0.4.1 codebase. The target is a safe, API-free-first image workflow: image settings UI, Web image prompts, illustration markers, library metadata, and GPU diagnostics. Existing article generation must remain unchanged when image generation is OFF.

## 2. Repository reality / implementation note
The `AIArticleStudio-Updates` repository is the update/release repository. The live application source tree is installed on Windows under `%LOCALAPPDATA%\AIArticleStudio\src\ai_article_studio\...` and update packages patch/copy those application files. Do not assume a permanent top-level `src/` tree exists in this repository. Before building v0.4.2, obtain the exact v0.4.1 installed files or the canonical source snapshot used to build the current package, then create a versioned `release/v042/` patch/build flow.

## 3. Safety rules
1. Image feature defaults to OFF.
2. OFF means v0.4.1 behavior is preserved byte-for-byte where practical.
3. Missing API key, missing GPU, missing NVIDIA tools, malformed markers, or absent image metadata must never crash the app.
4. New article fields must be optional with safe defaults for old library records.
5. Web mode must not automate authenticated browser image extraction. Flow is prompt copy -> open provider -> user generates/downloads -> import later.
6. Do not put long image-generation prompts inside the article body. Body contains only stable markers.
7. Do not hard-code external provider model/pricing assumptions in core logic.
8. Do not silently download large local image models.

## 4. Target modules
The exact file names must be matched to the installed v0.4.1 tree before editing. Preferred architecture:

### Existing files to inspect/change
- `src/ai_article_studio/ui/app.py`
- `src/ai_article_studio/core/web_ai_prompt_builder.py`
- `src/ai_article_studio/core/web_ai_workflow.py`
- `src/ai_article_studio/core/web_ai_state.py`
- `src/ai_article_studio/core/web_ai_ui_bridge.py`
- actual article/library persistence module used by v0.4.1
- `src/ai_article_studio/__init__.py` only at release-version step

### New modules
- `src/ai_article_studio/core/image_settings.py`
- `src/ai_article_studio/core/image_marker_parser.py`
- `src/ai_article_studio/core/image_prompt_builder.py`
- `src/ai_article_studio/core/image_assets.py`
- `src/ai_article_studio/core/gpu_diagnostic.py`
- optional integration facade: `src/ai_article_studio/core/image_workflow.py`

Do not create duplicate persistence or state layers if an equivalent v0.4.1 module already exists. Extend the existing canonical layer.

## 5. `image_settings.py`
Create a small dependency-free settings model and normalization layer.

Recommended values:
```python
DEFAULT_IMAGE_SETTINGS = {
    "enabled": False,
    "target": "both",          # eyecatch | illustrations | both
    "mode": "web",             # web | api | local
    "style": "auto",           # auto | business | tech | soft | diagram
    "illustration_count": "auto",
    "insert_markers": True,
    "include_summary": True,
    "alt_text": True,
    "caption": False,
    "text_policy": "no_text",  # no_text | title_overlay | auto
    "size_preset": "auto",
}
```

Required functions:
```python
def default_image_settings() -> dict: ...
def normalize_image_settings(value: object) -> dict: ...
def validate_image_settings(value: dict) -> list[str]: ...
```

Rules:
- unknown keys may be ignored or preserved consistently, but must not crash old/new records.
- invalid enum values fall back to defaults.
- `illustration_count` accepts `auto` or small positive integer values.

## 6. `image_marker_parser.py`
Use one stable marker grammar.

Canonical marker:
```text
[挿絵1｜導入の後｜記事全体を理解しやすくするイメージ]
```

Recommended parsed model:
```python
{
    "index": 1,
    "label": "挿絵1",
    "position": "導入の後",
    "description": "記事全体を理解しやすくするイメージ",
    "raw": "[挿絵1｜導入の後｜記事全体を理解しやすくするイメージ]",
}
```

Required functions:
```python
def parse_marker(line: str) -> dict | None: ...
def extract_markers(article_text: str) -> list[dict]: ...
def build_illustration_summary(markers: list[dict]) -> str: ...
```

Parser requirements:
- tolerate surrounding whitespace.
- reject incomplete/broken markers without raising.
- preserve ordering.
- no catastrophic regex patterns.

## 7. `image_prompt_builder.py`
Pure prompt-construction module. No network calls.

### Eyecatch request
Inputs should include only necessary article context:
```python
{
    "title": str,
    "platform": str,
    "genre": str,
    "subgenre": str,
    "audience": str,
    "style": str,
    "text_policy": str,
    "size_preset": str,
}
```

### Illustration request
```python
{
    "article_title": str,
    "platform": str,
    "heading": str,
    "context_before": str,
    "context_after": str,
    "marker": dict,
    "style": str,
}
```

Required functions:
```python
def build_eyecatch_prompt(context: dict) -> str: ...
def build_illustration_prompt(context: dict) -> str: ...
def build_all_illustration_prompts(article_text: str, article_context: dict) -> list[dict]: ...
```

Prompt policy:
- default to image background / illustration with no embedded Japanese text.
- if title text is desired, prefer local overlay in a later phase rather than asking the image model to render Japanese text.
- no invented results, money, rankings, reviews, or misleading before/after claims.
- prompts should be concise enough for Web copy/paste.
- prompt should state intended role (eyecatch or inline illustration), composition, style, and content—not unnecessary article prose.

## 8. `image_assets.py`
Create forward-compatible metadata structures without requiring actual image files yet.

Recommended asset metadata:
```python
{
    "id": str,
    "role": "eyecatch" | "illustration",
    "section_id": str | None,
    "marker_index": int | None,
    "source_mode": "web" | "api" | "local",
    "provider": str | None,
    "model_label": str | None,
    "prompt": str,
    "style_profile_id": str | None,
    "original_file_path": str | None,
    "rendered_file_path": str | None,
    "alt_text": str,
    "caption": str,
    "width": int | None,
    "height": int | None,
    "created_at": str,
    "generation_status": str,
}
```

Required helpers:
```python
def empty_image_meta() -> dict: ...
def normalize_image_meta(value: object) -> dict: ...
```

Never depend solely on the user's original external file path after future import support; copied managed assets will be required in a later phase.

## 9. `gpu_diagnostic.py`
Diagnostic only in v0.4.2 Preview. No model inference.

Detection order should be cheap and non-fatal:
1. Windows/NVIDIA probe (`nvidia-smi`) if available.
2. Optional Python runtime capability check only if already installed.
3. Safe fallback: unavailable/unknown.

Recommended result:
```python
{
    "available": bool,
    "gpu_name": str | None,
    "vram_mb": int | None,
    "backend": str | None,
    "tier": "unknown" | "basic" | "standard" | "high",
    "recommended_mode": "web" | "local_standard" | "local_light",
    "message": str,
    "error": str | None,
}
```

Required function:
```python
def diagnose_gpu() -> dict: ...
```

Important:
- no hard-coded promise such as `RTX 5060 = fast/high quality`.
- classify from observed capability and available VRAM only.
- subprocess timeout required.
- errors are returned as diagnostic status, not raised into UI.

## 10. `web_ai_prompt_builder.py`
Extend Prompt Engine v2 only when image settings are enabled.

Pseudo integration:
```python
if image_settings["enabled"] and image_settings["target"] in {"illustrations", "both"}:
    sections.append(build_illustration_article_rules(image_settings))
```

The article-generation instruction must require the model to choose useful insertion points while planning the article—not evenly distribute images.

Output contract when enabled:
```text
[挿絵N｜推奨位置｜役割が分かる短い説明]
```

When disabled:
- do not mention illustrations at all.
- generated prompt should remain equivalent to current v0.4.1 behavior.

Add a very short format example, not a full article few-shot.

## 11. `web_ai_workflow.py`
Integrate image metadata after Web response ingestion/formatting, not before article completion.

Suggested flow:
```text
article response
 -> existing ingest / repair
 -> formatted article
 -> extract markers
 -> build eyecatch prompt (if enabled)
 -> build illustration prompts (if enabled)
 -> update state image fields
 -> preview / save
```

Do not block article completion if image planning fails. Store a warning and allow article publishing flow to continue.

## 12. `web_ai_state.py`
Extend state with optional fields only. Preserve current field names such as `formatted_output`.

Recommended additions:
```python
"image_settings": default_image_settings(),
"image_plan": {
    "eyecatch_prompt": "",
    "illustrations": [],
    "markers": [],
    "summary": "",
},
"gpu_diagnostic": None,
"image_warnings": [],
```

Migration rules:
- old state without these keys must load.
- no `KeyError` in UI/workflow.
- do not rename existing v0.4.1 fields while adding this feature.

## 13. `web_ai_ui_bridge.py`
Expose simple UI-safe functions instead of letting UI manipulate prompt builder internals.

Recommended facade:
```python
def image_settings_from_ui(values: dict) -> dict: ...
def build_image_output_view(state: dict) -> dict: ...
def copyable_eyecatch_prompt(state: dict) -> str: ...
def copyable_illustration_prompts(state: dict) -> str: ...
def safe_gpu_diagnostic() -> dict: ...
```

Any exception should be converted to a short user-facing error + optional debug detail.

## 14. `ui/app.py`
Do not change the 00-05 stepper until the existing UI is inspected. Add an image sub-panel in the current article creation flow rather than introducing a new top-level step blindly.

### Beginner default UI
Section title: `画像生成設定`

Default collapsed/off state:
- toggle: `画像を作る` OFF
- when OFF, hide advanced image controls.

When ON show:
- `作る画像`: アイキャッチ / 挿絵 / 両方
- `作り方`: Web版 / API版 / ローカルGPU
- `デザイン`: おまかせ / ビジネス / テック / やさしい / 図解風
- `挿絵枚数`: 自動 / 1 / 2 / 3
- `おすすめ位置を本文に表示`: ON
- advanced expander

### Web result panel
After article completion show only relevant actions:
- `アイキャッチ用プロンプトをコピー`
- `挿絵プロンプトをコピー`
- `挿絵一覧をコピー`
- `Web版AIを開く`

### API mode in v0.4.2
If live image API is not implemented, show `準備中` and do not expose a button that looks functional.

### Local mode in v0.4.2
Show diagnostics only. Text example:
- `GPUを確認しました`
- `ローカル画像生成の準備状況: 利用可能 / 未確認 / 利用不可`
- `生成本体は次の更新で対応予定`

## 15. Article/library persistence
First find the actual v0.4.1 canonical save/load functions. Extend those; do not create a parallel library database.

Persist:
```python
article["image_settings"] = normalized_settings
article["image_assets_meta"] = {
    "eyecatch_prompt": str,
    "inline_prompts": list,
    "inline_markers": list,
    "inline_summary": str,
    "generator_mode": str,
    "gpu_diagnostic_snapshot": dict | None,
}
```

Load with defaults if absent.

## 16. Tests to add
Prefer repository-style script tests if the update repo currently uses `scripts/test_*.py`; do not introduce a second test framework solely for this phase.

Suggested tests:
- `scripts/test_image_settings.py`
- `scripts/test_image_marker_parser.py`
- `scripts/test_image_prompt_builder.py`
- `scripts/test_gpu_diagnostic.py`
- `scripts/test_phase36_web_image_workflow.py`
- `scripts/test_phase36_library_compat.py`
- `scripts/test_v042_patch_compat.py`

Minimum cases:
1. image OFF -> no image instructions in article prompt.
2. image ON / illustrations -> canonical marker instructions appear.
3. malformed marker ignored safely.
4. marker order preserved.
5. eyecatch prompt contains article title/context but not fabricated claims.
6. old article JSON without image fields loads successfully.
7. GPU diagnostic works with `nvidia-smi` missing.
8. GPU diagnostic subprocess timeout is handled.
9. article workflow completes even if image prompt generation raises internally.
10. Windows PowerShell 5.1 package parse validation passes.

## 17. Release/package structure for v0.4.2 Preview
Create versioned files instead of modifying v0.4.1 release bytes.

Recommended:
```text
release/v042/
  README.txt
  phase36_v042_preflight.py
  patch_v042.py
  validate_v042_features.py
  SHA256.txt
updates/
  AIArticleStudio_Update_v0.4.2_Phase36ImagePreview.zip
candidate-v042.json
```

Do not promote `latest.json` until preview package passes CI and a Windows installation test from v0.4.1.

Preflight must:
- require compatible installed version (start with exact v0.4.1 unless explicitly supporting more).
- inspect only canonical live app paths, not `backup_auto_*` trees.
- verify required v0.4.1 files before modifying.
- abort before writes if preflight fails.

Patch must:
- make/update files atomically where practical.
- update version only after feature validation succeeds.
- be safe against updater backup folders.

## 18. CI changes
Extend the current release validation workflow with v0.4.2 candidate checks only after candidate files exist.

Require both:
- Linux Python validation
- Windows PowerShell 5.1 validation

Required v0.4.2 steps:
```text
validate candidate-v042.json
run Phase 3.6 core tests
run v0.4.2 patch compatibility test
parse v0.4.2 package with Windows PowerShell 5.1
```

## 19. Implementation order
Do not implement all layers in one unverified patch.

1. Snapshot exact installed v0.4.1 source files needed for patching.
2. Add image settings + tests.
3. Add marker parser + tests.
4. Add prompt builder + tests.
5. Integrate Prompt Engine v2 with image-OFF regression test.
6. Extend state/workflow + tests.
7. Add persistence compatibility + tests.
8. Add GPU diagnostics + tests.
9. Add UI controls and output panel.
10. Run full regression suite.
11. Build v0.4.2 Preview patch.
12. Test v0.4.1 -> v0.4.2 on a disposable Windows fixture/install copy.
13. Only then publish preview candidate.

## 20. Acceptance criteria
v0.4.2 Preview is acceptable when all are true:
- application starts normally after update.
- image feature is OFF by default.
- existing v0.4.1 Web article flow still works with image feature OFF.
- image ON can request eyecatch / illustrations / both.
- Web article prompt can request useful insertion markers.
- returned markers are parsed safely.
- eyecatch and per-illustration prompts can be copied separately.
- image metadata survives article save/reload.
- GPU diagnosis never prevents article creation.
- API/local unimplemented controls are clearly marked and do not simulate success.
- Linux CI passes.
- Windows PowerShell 5.1 CI passes.
- updater preflight and rollback behavior remain safe.

## 21. Next phase after v0.4.2 Preview
After this preview is stable:
1. image import into managed article folders.
2. non-destructive eyecatch title overlay.
3. API image-provider adapter with external pricing config and budget guard.
4. optional Local Image Pack with explicit download consent, storage estimate, license manifest, SHA256 validation, progress/cancel, and OOM fallback.
5. local generation jobs off the UI thread with cancellation/progress.
