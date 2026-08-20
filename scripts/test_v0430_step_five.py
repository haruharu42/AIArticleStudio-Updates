from __future__ import annotations

import pathlib
import runpy
import shutil
import subprocess
import sys
import tempfile
import zipfile


ROOT = pathlib.Path(__file__).resolve().parents[1]
RELEASE = ROOT / "release" / "v0430"


def run(*args: str) -> None:
    subprocess.run([sys.executable, *args], check=True)


def build_v0429_fixture(root: pathlib.Path) -> tuple[pathlib.Path, pathlib.Path]:
    prior = runpy.run_path(str(ROOT / "scripts" / "test_v0428_direct_visual_wizard.py"))
    install, package28 = prior["build_v0427_fixture"](root)
    payload28 = package28 / "payload" / "ui"
    payload28.mkdir(parents=True)
    for name in ("guided_wizard_v0427.py", "guided_wizard_v0428.py"):
        shutil.copy2(ROOT / "src" / "ai_article_studio" / "ui" / name, payload28 / name)
    run(str(ROOT / "release" / "v0428" / "patch_v0428.py"), str(install), str(package28))
    run(str(ROOT / "release" / "v0428" / "set_version_v0428.py"), str(install))

    package29 = root / "package29"
    with zipfile.ZipFile(ROOT / "updates" / "AIArticleStudio_Update_v0.4.2.9_LiveArticleCreatorHook.zip") as archive:
        archive.extractall(package29)
    run(str(package29 / "phase36_v0429_preflight.py"), "--app-root", str(install))
    run(str(package29 / "patch_v0429.py"), str(install), str(package29))
    run(str(package29 / "set_version_v0429.py"), str(install))
    return install, root / "package30"


def test_patch_and_cleanup() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = pathlib.Path(tmp)
        install, package30 = build_v0429_fixture(root)
        payload = package30 / "payload" / "ui"
        payload.mkdir(parents=True)
        for name in ("guided_wizard_v0427.py", "guided_wizard_v0428.py", "guided_wizard_v0429.py"):
            shutil.copy2(ROOT / "src" / "ai_article_studio" / "ui" / name, payload / name)
        cache = install / "src" / "ai_article_studio" / "ui" / "__pycache__"
        cache.mkdir()
        (cache / "stale.pyc").write_bytes(b"stale")
        article = install / "data" / "articles" / "keep.md"
        article.parent.mkdir(parents=True)
        article.write_text("keep", encoding="utf-8")

        run(str(RELEASE / "phase36_v0430_preflight.py"), "--app-root", str(install))
        run(str(RELEASE / "patch_v0430.py"), str(install), str(package30))
        run(str(RELEASE / "cleanup_v0430.py"), str(install))
        run(str(RELEASE / "set_version_v0430.py"), str(install))
        run(str(RELEASE / "validate_v0430.py"), str(install))
        assert not cache.exists()
        assert article.read_text(encoding="utf-8") == "keep"


def test_package() -> None:
    run(str(RELEASE / "build_package.py"))
    package = ROOT / "updates" / "AIArticleStudio_Update_v0.4.3.0_StepFiveAIAuto.zip"
    assert package.is_file()
    with zipfile.ZipFile(package) as archive:
        assert archive.testzip() is None
        assert "cleanup_v0430.py" in archive.namelist()
        assert "payload/ui/guided_wizard_v0427.py" in archive.namelist()


def main() -> None:
    test_patch_and_cleanup()
    test_package()
    print("V0.4.3.0 STEP FIVE / AI AUTO PATCH TESTS OK")


if __name__ == "__main__":
    main()
