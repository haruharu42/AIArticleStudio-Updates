from __future__ import annotations

from dataclasses import dataclass
import re

MARKER_RE = re.compile(
    r"^\[挿絵(?P<number>[1-9]\d*)｜(?P<position>[^｜\]\r\n]+)｜(?P<description>[^\]\r\n]+)\]$"
)


@dataclass(frozen=True)
class IllustrationMarker:
    number: int
    position: str
    description: str
    raw: str

    @property
    def label(self) -> str:
        return f"挿絵{self.number}"

    def to_dict(self) -> dict[str, object]:
        return {
            "number": self.number,
            "label": self.label,
            "position": self.position,
            "description": self.description,
            "raw": self.raw,
        }


def parse_marker(line: str) -> IllustrationMarker | None:
    text = line.strip()
    match = MARKER_RE.fullmatch(text)
    if not match:
        return None

    position = match.group("position").strip()
    description = match.group("description").strip()
    if not position or not description:
        return None

    return IllustrationMarker(
        number=int(match.group("number")),
        position=position,
        description=description,
        raw=text,
    )


def extract_markers(article_text: str) -> list[IllustrationMarker]:
    markers: list[IllustrationMarker] = []
    seen_numbers: set[int] = set()

    for line in article_text.splitlines():
        marker = parse_marker(line)
        if marker is None or marker.number in seen_numbers:
            continue
        seen_numbers.add(marker.number)
        markers.append(marker)

    return markers


def format_marker(number: int, position: str, description: str) -> str:
    if number < 1:
        raise ValueError("illustration number must be 1 or greater")
    safe_position = _clean_segment(position, "position")
    safe_description = _clean_segment(description, "description")
    return f"[挿絵{number}｜{safe_position}｜{safe_description}]"


def _clean_segment(value: str, field: str) -> str:
    text = " ".join(str(value).split()).strip()
    if not text:
        raise ValueError(f"{field} must not be empty")
    if any(ch in text for ch in "｜[]\r\n"):
        raise ValueError(f"{field} contains reserved marker characters")
    return text


def build_illustration_summary(markers: list[IllustrationMarker]) -> str:
    if not markers:
        return ""
    lines = ["【挿絵一覧】"]
    for marker in markers:
        lines.append(f"{marker.number}. {marker.position}：{marker.description}")
    return "\n".join(lines)
