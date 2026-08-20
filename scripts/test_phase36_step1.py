from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from ai_article_studio.core.image_marker_parser import (  # noqa: E402
    build_illustration_summary,
    extract_markers,
    format_marker,
    parse_marker,
)
from ai_article_studio.core.image_settings import (  # noqa: E402
    image_feature_active,
    merge_image_settings,
    normalize_image_settings,
)


def main() -> None:
    defaults = normalize_image_settings(None)
    assert defaults.enabled is False
    assert defaults.mode == "web"
    assert defaults.target == "both"
    assert defaults.illustration_count == "auto"
    assert defaults.insert_markers is True

    invalid = normalize_image_settings(
        {
            "enabled": "yes",
            "mode": "unknown",
            "target": "bad",
            "style": "invalid",
            "inline_count": 99,
            "show_alt_text": "off",
            "show_caption": "on",
        }
    )
    assert invalid.enabled is True
    assert invalid.mode == "web"
    assert invalid.target == "both"
    assert invalid.style == "auto"
    assert invalid.illustration_count == "auto"
    assert invalid.generate_alt_text is False
    assert invalid.generate_caption is True

    changed = merge_image_settings(defaults.to_dict(), enabled=True, mode="local", illustration_count="2")
    assert changed.enabled is True
    assert changed.mode == "local"
    assert changed.illustration_count == "2"
    assert image_feature_active(changed.to_dict()) is True

    marker_text = format_marker(1, "導入の後", "記事全体を理解しやすくするイメージ")
    assert marker_text == "[挿絵1｜導入の後｜記事全体を理解しやすくするイメージ]"
    parsed = parse_marker(marker_text)
    assert parsed is not None
    assert parsed.number == 1
    assert parsed.position == "導入の後"
    assert parsed.description == "記事全体を理解しやすくするイメージ"

    article = "\n".join(
        [
            "# テスト記事",
            marker_text,
            "本文です。",
            "[挿絵2｜STEP1の前｜作業手順を図解するイメージ]",
            "[挿絵2｜重複｜これは無視される]",
            "[挿絵X｜不正｜無視]",
        ]
    )
    markers = extract_markers(article)
    assert [m.number for m in markers] == [1, 2]
    summary = build_illustration_summary(markers)
    assert "【挿絵一覧】" in summary
    assert "1. 導入の後：記事全体を理解しやすくするイメージ" in summary
    assert "2. STEP1の前：作業手順を図解するイメージ" in summary

    assert parse_marker("本文 [挿絵1｜導入の後｜説明]") is None
    assert parse_marker("[挿絵0｜導入の後｜説明]") is None

    try:
        format_marker(1, "導入｜後", "説明")
    except ValueError:
        pass
    else:
        raise AssertionError("reserved marker characters must be rejected")

    print("PHASE 3.6 STEP 1 TESTS OK")


if __name__ == "__main__":
    main()
