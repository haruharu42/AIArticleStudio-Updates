from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .web_ai_ingest import WebAIIngestResult, recommended_repair_types
from .web_ai_prompt_builder import WebAIContext, build_repair_prompt


@dataclass(frozen=True)
class RepairAction:
    id: str
    label: str
    kind: str  # copy_prompt | retry | manual | inspect | continue
    primary: bool = False


@dataclass
class RepairIssue:
    code: str
    title: str
    message: str
    severity: str  # info | warning | blocking
    repair_type: str | None = None
    actions: list[RepairAction] = field(default_factory=list)


ISSUE_MESSAGES: dict[str, tuple[str, str, str]] = {
    "empty_output": (
        "AIの回答が見つかりません",
        "Web版AIの回答を貼り付けてから、もう一度取り込んでください。",
        "blocking",
    ),
    "missing_paid_boundary": (
        "有料部分の区切りが見つかりませんでした",
        "有料記事として使う場合は、無料部分と有料部分の境界を追加するのがおすすめです。",
        "warning",
    ),
    "unexpected_paid_boundary": (
        "無料記事に有料部分の区切りがあります",
        "無料記事として公開する場合は、有料境界を削除してください。",
        "warning",
    ),
    "missing_bonus": (
        "特典が見つかりませんでした",
        "有料記事の価値を補強する場合は、本文と重複しない実用的な特典を追加できます。",
        "warning",
    ),
    "missing_summary": (
        "まとめが見つかりませんでした",
        "記事の最後に要点を整理した短いまとめを追加すると、読み終わりが分かりやすくなります。",
        "warning",
    ),
    "missing_cta": (
        "最後の案内が見つかりませんでした",
        "読者が次に何をすればよいか分かる、自然な案内を最後に追加できます。",
        "info",
    ),
}


WARNING_TO_REPAIR = {
    "missing_paid_boundary": "missing_paid_boundary",
    "missing_bonus": "missing_bonus",
    "missing_summary": "incomplete_article",
    "missing_cta": "missing_cta",
}


def build_repair_issues(result: WebAIIngestResult) -> list[RepairIssue]:
    issues: list[RepairIssue] = []
    for warning in result.warnings:
        if warning not in ISSUE_MESSAGES:
            continue
        title, message, severity = ISSUE_MESSAGES[warning]
        repair_type = WARNING_TO_REPAIR.get(warning)

        if warning == "empty_output":
            actions = [
                RepairAction("retry_ingest", "回答を貼り付ける", "retry", primary=True),
                RepairAction("inspect", "入力欄を確認", "inspect"),
            ]
        elif warning == "unexpected_paid_boundary":
            actions = [
                RepairAction("manual_edit", "自分で削除する", "manual", primary=True),
                RepairAction("inspect", "回答をそのまま確認", "inspect"),
            ]
        else:
            actions = [
                RepairAction("copy_repair_prompt", "修正用プロンプトをコピー", "copy_prompt", primary=True),
                RepairAction("manual_edit", "自分で直す", "manual"),
                RepairAction("continue", "このまま進む", "continue"),
            ]

        issues.append(
            RepairIssue(
                code=warning,
                title=title,
                message=message,
                severity=severity,
                repair_type=repair_type,
                actions=actions,
            )
        )
    return issues


def build_issue_repair_prompt(
    issue: RepairIssue,
    result: WebAIIngestResult,
    request: Any,
    context: WebAIContext,
) -> str:
    if not issue.repair_type:
        raise ValueError(f"issue does not support AI repair: {issue.code}")
    source = result.normalized_output or result.raw_web_output
    return build_repair_prompt(source, issue.repair_type, request, context)


def repair_summary(result: WebAIIngestResult) -> dict[str, Any]:
    issues = build_repair_issues(result)
    return {
        "blocking": [i.code for i in issues if i.severity == "blocking"],
        "warnings": [i.code for i in issues if i.severity == "warning"],
        "info": [i.code for i in issues if i.severity == "info"],
        "repair_types": recommended_repair_types(result),
        "can_continue": not any(i.severity == "blocking" for i in issues),
    }
