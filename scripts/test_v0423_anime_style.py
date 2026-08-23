from __future__ import annotations

import pathlib
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
RELEASE = ROOT / "release" / "v0423"

from ai_article_studio.core.image_prompt_builder import build_image_prompt_bundle  # noqa: E402
from ai_article_studio.core.image_settings import normalize_image_settings  # noqa: E402


def request() -> dict:
    return {
        "platform": "note",
        "article_type": "無料",
        "genre": "AI副業",
        "subgenre": "AIおまかせ",
        "reader_level": "初心者",
        "target_age": "30代",
        "reader_problem": "自分に合う仕事を知りたい",
    }


def run(*args: str) -> None:
    subprocess.run([sys.executable, *args], check=True)


def test_prompts() -> None:
    article = "# AI副業入門\n\n## 仕事を選ぶ\nライティング、画像制作、動画制作を比較します。\n"
    anime = normalize_image_settings({"enabled": True, "target": "both", "style": "anime", "illustration_count": "1"})
    bundle = build_image_prompt_bundle(request(), "AI副業入門", article, anime)
    text = bundle.eyecatch_prompt + "\n" + bundle.illustration_prompts[0]["prompt"]
    for token in ("2Dアニメ", "セル塗り", "線画", "フォトリアル", "企業広告イラスト", "2Dアニメ素材", "光沢の強いアプリアイコン", "発光するバブルUI"):
        assert token in text, token

    manga = normalize_image_settings({"enabled": True, "target": "eyecatch", "style": "manga"})
    manga_text = build_image_prompt_bundle(request(), "AI副業入門", article, manga).eyecatch_prompt
    for token in ("漫画調", "線画", "コマ割り", "フォトリアル"):
        assert token in manga_text, token

    gentle = normalize_image_settings({"enabled": True, "target": "eyecatch", "style": "gentle"})
    gentle_text = build_image_prompt_bundle(request(), "AI副業入門", article, gentle).eyecatch_prompt
    assert "やさしい商用イラスト風" in gentle_text
    assert "アニメ風とは分け" in gentle_text


def test_patch() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        install = pathlib.Path(tmp) / "AIArticleStudio"
        package = pathlib.Path(tmp) / "package"
        core = install / "src" / "ai_article_studio" / "core"
        ui = install / "src" / "ai_article_studio" / "ui"
        payload = package / "payload" / "core"
        core.mkdir(parents=True)
        ui.mkdir(parents=True)
        payload.mkdir(parents=True)
        (install / "src" / "ai_article_studio" / "__init__.py").write_text('__version__ = "0.4.2.2"\n', encoding="utf-8")
        (ui / "app.py").write_text('# v0.4.0 Phase 3.5 integrated Web AI\n# v0.4.2 Phase 3.6 image workflow\n# v0.4.2.2 linked image controls\n', encoding="utf-8")
        old = core / "image_prompt_builder.py"
        old.write_text('STYLE_HINTS = {"anime": "old"}\n', encoding="utf-8")
        shutil.copy2(ROOT / "src" / "ai_article_studio" / "core" / "image_prompt_builder.py", payload / "image_prompt_builder.py")

        run(str(RELEASE / "phase36_v0423_preflight.py"), "--app-root", str(install))
        run(str(RELEASE / "patch_v0423.py"), str(install), str(package))
        run(str(RELEASE / "set_version_v0423.py"), str(install))
        run(str(RELEASE / "validate_v0423.py"), str(install))
        assert "STYLE_RULES" in old.read_text(encoding="utf-8")


def main() -> None:
    test_prompts()
    test_patch()
    print("V0.4.2.3 ANIME STYLE TESTS OK")


if __name__ == "__main__":
    main()
