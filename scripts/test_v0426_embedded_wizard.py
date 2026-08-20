from __future__ import annotations

import pathlib
import runpy
import shutil
import subprocess
import sys
import tempfile


ROOT = pathlib.Path(__file__).resolve().parents[1]
RELEASE = ROOT / "release" / "v0426"


def run(*args: str) -> None:
    subprocess.run([sys.executable, *args], check=True)


def build_v0425_fixture(root: pathlib.Path) -> tuple[pathlib.Path, pathlib.Path]:
    prior = runpy.run_path(str(ROOT / "scripts" / "test_v0425_guided_wizard.py"))
    install = root / "AIArticleStudio"
    package22 = root / "package22"
    package24 = root / "package24"
    package25 = root / "package25"
    payload25 = package25 / "payload" / "core"
    payload25.mkdir(parents=True)
    prior["build_v0424_fixture"](install, package22, package24)
    for name in ("web_ai_state.py", "web_ai_ui_bridge.py"):
        shutil.copy2(ROOT / "src" / "ai_article_studio" / "core" / name, payload25 / name)
    run(str(ROOT / "release" / "v0425" / "patch_v0425.py"), str(install), str(package25))
    run(str(ROOT / "release" / "v0425" / "set_version_v0425.py"), str(install))
    return install, root / "package26"


def open_web_method(text: str) -> str:
    start = text.find("    def _open_web_ai_mode(self):\n")
    assert start >= 0
    end = text.find("\n    def ", start + 5)
    return text[start : (end if end >= 0 else len(text))]


def test_patch() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = pathlib.Path(tmp)
        install, package26 = build_v0425_fixture(root)
        package26.mkdir(parents=True)
        app = install / "src" / "ai_article_studio" / "ui" / "app.py"

        before = app.read_text(encoding="utf-8")
        assert "self._install_create_step_wizard(body)" in before
        assert "tk.Toplevel(self)" in open_web_method(before)

        run(str(RELEASE / "phase36_v0426_preflight.py"), "--app-root", str(install))
        run(str(RELEASE / "patch_v0426.py"), str(install), str(package26))
        run(str(RELEASE / "set_version_v0426.py"), str(install))
        run(str(RELEASE / "validate_v0426.py"), str(install))

        text = app.read_text(encoding="utf-8")
        compile(text, str(app), "exec")
        assert text.count("# v0.4.2.6 embedded single-item article wizard") == 1
        assert text.count("self._install_single_item_article_wizard(body)") == 1
        assert "self._install_create_step_wizard(body)" not in text
        assert "win = self._create_embedded_article_workspace()" in open_web_method(text)
        assert "tk.Toplevel(self)" not in open_web_method(text)
        assert text.find("ordered.append(image_card)") < text.find("ordered.append(web_card)")
        assert "生成方法を選択" in text
        assert "完成記事を作る前の画像計画" in text
        assert "← 設定に戻る" in text
        assert "最近の作業（最大10件）" in text

        applied = text
        run(str(RELEASE / "patch_v0426.py"), str(install), str(package26))
        assert app.read_text(encoding="utf-8") == applied


def main() -> None:
    test_patch()
    print("V0.4.2.6 EMBEDDED SINGLE-ITEM WIZARD TESTS OK")


if __name__ == "__main__":
    main()
