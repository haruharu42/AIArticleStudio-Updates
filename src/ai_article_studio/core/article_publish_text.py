from __future__ import annotations

from dataclasses import dataclass
import re


ILLUSTRATION_MARKER_RE = re.compile(r"^\s*\[挿絵(?P<number>[1-9]\d*)｜[^\]\r\n]+｜[^\]\r\n]+\]\s*$")
ILLUSTRATION_SUMMARY_RE = re.compile(r"^(?P<marks>#{1,6})\s*【?挿絵一覧】?\s*$")
HEADING_RE = re.compile(r"^(?P<marks>#{1,6})\s+")


@dataclass(frozen=True)
class ArticleTextVariants:
    source_text: str
    insertion_text: str
    publish_text: str

    def to_dict(self) -> dict[str, str]:
        return {
            "source_text": self.source_text,
            "insertion_text": self.insertion_text,
            "publish_text": self.publish_text,
        }


def _newlines_only(text: str) -> str:
    """Normalize line endings without reflowing Markdown or rebuilding tables."""
    return str(text or "").replace("\r\n", "\n").replace("\r", "\n").strip()


def strip_illustration_summary(text: str) -> str:
    lines = _newlines_only(text).split("\n")
    output: list[str] = []
    skipping = False
    summary_level = 0
    for line in lines:
        summary = ILLUSTRATION_SUMMARY_RE.match(line.strip())
        if summary:
            skipping = True
            summary_level = len(summary.group("marks"))
            continue
        if skipping:
            heading = HEADING_RE.match(line.strip())
            if not heading or len(heading.group("marks")) > summary_level:
                continue
            skipping = False
        output.append(line)
    return "\n".join(output).rstrip()


def strip_illustration_markers(text: str) -> str:
    lines = [line for line in _newlines_only(text).split("\n") if not ILLUSTRATION_MARKER_RE.match(line)]
    return "\n".join(lines).rstrip()


def build_article_text_variants(text: str) -> ArticleTextVariants:
    source = _newlines_only(text)
    insertion = strip_illustration_summary(source)
    publish = strip_illustration_markers(insertion)
    return ArticleTextVariants(source_text=source, insertion_text=insertion, publish_text=publish)
