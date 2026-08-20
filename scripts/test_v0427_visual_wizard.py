from __future__ import annotations

import pathlib
import runpy
import shutil
import subprocess
import sys
import tempfile
import zipfile


ROOT = pathlib.Path(__file__).resolve().parents[1]
RELEASE = ROOT / "release" / "v0427"


def run(*args: str) -> None:
    subprocess.run([sys.executable, *args], check=True)


def build_v0426_fixture(root: pathlib.Path) -> tuple[pathlib.Path, pathlib.Path]:
    prior = runpy.run_path(str(ROOT / "scripts" / "test_v0426_embedded_wizard.py"))
    install, package26 = prior["build_v0425_fixture"](root)
    package26.mkdir(parents=True, exist_ok=True)
    run(str(ROOT / "release" / "v0426" / "patch_v0426.py"), str(install), str(package26))
    run(str(ROOT / "release" / "v0426" / "set_version_v0426.py"), str(install))
    return install, root / "package27"


def test_patch() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = pathlib.Path(tmp)
        install, package27 = build_v0426_fixture(root)
        payload = package27 / "payload" / "ui"
        payload.mkdir(parents=True)
        shutil.copy2(ROOT / "src" / "ai_article_studio" / "ui" / "guided_wizard_v0427.py", payload / "guided_wizard_v0427.py")
        run(str(RELEASE / "phase36_v0427_preflight.py"), "--app-root", str(install))
        run(str(RELEASE / "patch_v0427.py"), str(install), str(package27))
        run(str(RELEASE / "set_version_v0427.py"), str(install))
        run(str(RELEASE / "validate_v0427.py"), str(install))
        app = install / "src" / "ai_article_studio" / "ui" / "app.py"
        module = app.parent / "guided_wizard_v0427.py"
        text = app.read_text(encoding="utf-8")
        ui = module.read_text(encoding="utf-8")
        assert text.count("# v0.4.2.7 visual six-step article wizard") == 1
        assert "return install_article_wizard(self, body)" in text
        assert "return install_web_ai_wizard(self, win, req, pages, fields)" in text
        assert "STEP_LABELS" in ui
        assert "生成方法を選択" in ui
        assert "完成記事を作る前の画像計画" in ui
        assert "記事の基本設定" in ui
        assert "記事の内容を設計" in ui
        assert "貼り付け欄をクリア" in ui
        assert "_decorate_preview" in ui
        assert "_refresh_image_result_panel" in ui
        applied = text
        run(str(RELEASE / "patch_v0427.py"), str(install), str(package27))
        assert app.read_text(encoding="utf-8") == applied


def test_package() -> None:
    run(str(RELEASE / "build_package.py"))
    package = ROOT / "updates" / "AIArticleStudio_Update_v0.4.2.7_VisualSixStepWizard.zip"
    assert package.is_file()
    with zipfile.ZipFile(package) as archive:
        assert archive.testzip() is None
        assert "payload/ui/guided_wizard_v0427.py" in archive.namelist()


def main() -> None:
    test_patch()
    test_package()
    print("V0.4.2.7 VISUAL SIX-STEP WIZARD TESTS OK")


if __name__ == "__main__":
    main()
