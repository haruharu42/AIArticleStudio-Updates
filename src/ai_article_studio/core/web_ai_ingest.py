from __future__ import annotations

from dataclasses import dataclass, field
import re
from typing import Iterable


PAID_BOUNDARY_PATTERNS = [
    r"ここから有料",
    r"有料(?:部分|エリア|ゾーン)",
    r"購入者限定",
]
BONUS_PATTERNS = [r"^#{1,6}\s*.*(?:特典|ボーナス)", r"^.*(?:🎁|特典)\s*.*$"]
SUMMARY_PATTERNS = [r"^#{1,6}\s*(?:まとめ|おわりに|最後に|結論)", r"^(?:まとめ|おわりに|最後に|結論)\s*$"]
CTA_PATTERNS = [
    r"(?:購入|フォロー|スキ|コメント|登録|申し込|チェック|試して|実践して|始めて).{0,20}(?:ください|みてください|してみてください)",
    r"(?:次の一歩|次にやること|行動).{0,20}",
]
OUTPUT_PATTERNS = {
    "checklist": [r"チェックリスト", r"\[\s*[ xX]\s*\]"],
    "template": [r"テンプレート", r"雛形"],
    "worksheet": [r"ワークシート", r"記入シート"],
    "comparison": [r"比較表", r"\|.+\|.+\|"],
    "copy_paste_prompt": [r"コピペ用プロンプト", r"そのまま使えるプロンプト"],
    "roadmap": [r"ロードマップ", r"(?:7日|30日|週間|日間).{0,15}(?:計画|プラン)"],
    "decision_framework": [r"判断フレーム", r"判断基準"],
    "practical_steps": [r"^#{1,6}\s*(?:STEP|ステップ|手順)", r"^\s*STEP\s*\d+"],
}

WRAPPER_PREFIXES = (
    "以下が記事です。",
    "以下の記事をご確認ください。",
    "ご指定の条件に沿って作成しました。",
    "承知しました。",
    "もちろんです。",
)


@dataclass
class WebAIIngestResult:
    raw_web_output: str
    normalized_output: str
    paid_boundary_detected: bool = False
    bonus_headings: list[str] = field(default_factory=list)
    actionable_outputs_detected: list[str] = field(default_factory=list)
    summary_detected: bool = False
    cta_detected: bool = False
    title_detected: str = ""
    removed_wrappers: list[str] = field(default_factory=list)
    code_fence_removed: bool = False
    warnings: list[str] = field(default_factory=list)

    @property
    def is_empty(self) -> bool:
        return not self.normalized_output.strip()


def _strip_outer_code_fence(text: str) -> tuple[str, bool]:
    stripped = text.strip()
    m = re.fullmatch(r"```(?:markdown|md|text)?\s*\n?(.*?)\n?```", stripped, flags=re.IGNORECASE | re.DOTALL)
    if not m:
        return text, False
    return m.group(1).strip(), True


def _remove_preamble_wrappers(text: str) -> tuple[str, list[str]]:
    lines = text.splitlines()
    removed: list[str] = []
    while lines and not lines[0].strip():
        lines.pop(0)
    changed = True
    while lines and changed:
        changed = False
        first = lines[0].strip()
        for prefix in WRAPPER_PREFIXES:
            if first == prefix or first.startswith(prefix + " "):
                removed.append(lines.pop(0).strip())
                while lines and not lines[0].strip():
                    lines.pop(0)
                changed = True
                break
    return "\n".join(lines).strip(), removed


def _normalize_newlines(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{4,}", "\n\n\n", text)
    return text.strip()


def _match_any(text: str, patterns: Iterable[str], flags: int = re.IGNORECASE | re.MULTILINE) -> bool:
    return any(re.search(p, text, flags=flags) for p in patterns)


def _extract_headings(text: str, patterns: Iterable[str]) -> list[str]:
    out: list[str] = []
    for line in text.splitlines():
        if any(re.search(p, line, flags=re.IGNORECASE) for p in patterns):
            value = line.strip()
            if value and value not in out:
                out.append(value)
    return out


def _detect_title(text: str) -> str:
    for line in text.splitlines():
        m = re.match(r"^#\s+(.+)$", line.strip())
        if m:
            return m.group(1).strip()
    for line in text.splitlines()[:5]:
        value = line.strip()
        if value and len(value) <= 100 and not value.startswith(("-", "*", "|", ">")):
            return value.lstrip("# ").strip()
    return ""


def ingest_web_ai_output(raw_text: str, *, expect_paid: bool | None = None) -> WebAIIngestResult:
    raw = raw_text if isinstance(raw_text, str) else str(raw_text or "")
    normalized, fence_removed = _strip_outer_code_fence(raw)
    normalized, removed = _remove_preamble_wrappers(normalized)
    normalized = _normalize_newlines(normalized)

    paid = _match_any(normalized, PAID_BOUNDARY_PATTERNS)
    bonus_headings = _extract_headings(normalized, BONUS_PATTERNS)
    summary = _match_any(normalized, SUMMARY_PATTERNS)
    cta = _match_any(normalized, CTA_PATTERNS)

    detected_outputs: list[str] = []
    for output_type, patterns in OUTPUT_PATTERNS.items():
        if _match_any(normalized, patterns):
            detected_outputs.append(output_type)

    warnings: list[str] = []
    if not normalized:
        warnings.append("empty_output")
    if expect_paid is True and not paid:
        warnings.append("missing_paid_boundary")
    if expect_paid is False and paid:
        warnings.append("unexpected_paid_boundary")
    if expect_paid is True and not bonus_headings:
        warnings.append("missing_bonus")
    if not summary:
        warnings.append("missing_summary")
    if not cta:
        warnings.append("missing_cta")

    return WebAIIngestResult(
        raw_web_output=raw,
        normalized_output=normalized,
        paid_boundary_detected=paid,
        bonus_headings=bonus_headings,
        actionable_outputs_detected=detected_outputs,
        summary_detected=summary,
        cta_detected=cta,
        title_detected=_detect_title(normalized),
        removed_wrappers=removed,
        code_fence_removed=fence_removed,
        warnings=warnings,
    )


def recommended_repair_types(result: WebAIIngestResult) -> list[str]:
    mapping = {
        "missing_paid_boundary": "missing_paid_boundary",
        "missing_bonus": "missing_bonus",
        "missing_summary": "incomplete_article",
        "missing_cta": "missing_cta",
    }
    out: list[str] = []
    for warning in result.warnings:
        repair = mapping.get(warning)
        if repair and repair not in out:
            out.append(repair)
    return out
