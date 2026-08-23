from __future__ import annotations

import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import zipfile


ROOT = pathlib.Path(__file__).resolve().parents[1]
RELEASE = ROOT / "release" / "v0433"
PACKAGE_NAME = "AIArticleStudio_Update_v0.4.3.3_AuthUIFoundation.zip"
CUMULATIVE_UI = ("guided_wizard_v0427.py", "guided_wizard_v0432.py", "auth_ui.py")
CUMULATIVE_CORE = (
    "article_publish_text.py",
    "web_ai_workflow.py",
    "web_ai_ui_bridge.py",
    "image_prompt_builder.py",
    "auth_service.py",
)


def run(*args: str) -> None:
    subprocess.run([sys.executable, *args], cwd=ROOT, check=True)


def build_fixture(root: pathlib.Path, version: str) -> pathlib.Path:
    install = root / "AIArticleStudio"
    ui = install / "src" / "ai_article_studio" / "ui"
    core = ui.parent / "core"
    ui.mkdir(parents=True)
    core.mkdir(parents=True)
    (install / "src" / "ai_article_studio" / "__init__.py").write_text(f'__version__ = "{version}"\n', encoding="utf-8")
    hook = "v0432" if version == "0.4.3.2" else ("v0431" if version == "0.4.3.1" else "v0429")
    marker32 = "    # v0.4.3.2 embedded six-step creation flow\n" if version == "0.4.3.2" else ""
    marker31 = "    # v0.4.3.1 embedded six-step creation flow\n" if version == "0.4.3.1" else ""
    (ui / "app.py").write_text(
        "class App:\n"
        "    def __init__(self, *args, **kwargs):\n"
        "        self.vars = {}\n"
        f"{marker32}"
        f"{marker31}"
        "    # v0.4.2.9 live show_create activation hook\n"
        "    def _v0429_activate_after_show_create(self):\n"
        f"        from .guided_wizard_{hook} import activate_live_article_wizard\n"
        "        return activate_live_article_wizard(self)\n",
        encoding="utf-8",
    )
    for number in (7, 8, 9):
        shutil.copy2(ROOT / "src" / "ai_article_studio" / "ui" / f"guided_wizard_v042{number}.py", ui)
    if version == "0.4.3.1":
        shutil.copy2(ROOT / "src" / "ai_article_studio" / "ui" / "guided_wizard_v0431.py", ui)
    if version == "0.4.3.2":
        shutil.copy2(ROOT / "src" / "ai_article_studio" / "ui" / "guided_wizard_v0432.py", ui)
    for name in CUMULATIVE_CORE[1:-1]:
        shutil.copy2(ROOT / "src" / "ai_article_studio" / "core" / name, core / name)
    preserved = {
        install / "data" / "articles.json": "article-data",
        install / "data" / "history.json": "history-data",
        install / "config" / "settings.json": "settings-data",
        install / "data" / "web_ai_state.json": "web-ai-data",
        install / "data" / "image_plans.json": "image-plan-data",
        install / "updater" / "state.json": "updater-data",
    }
    for path, value in preserved.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value, encoding="utf-8")
    return install


def build_payload(package: pathlib.Path) -> None:
    files = {
        ROOT / "supabase" / "migrations" / "202608230001_phase_auth_ui_foundation.sql": package / "payload" / "supabase" / "migrations" / "202608230001_phase_auth_ui_foundation.sql",
        ROOT / "docs" / "AUTH_UI_FOUNDATION.md": package / "payload" / "docs" / "AUTH_UI_FOUNDATION.md",
        ROOT / "config" / "auth.example.json": package / "payload" / "config" / "auth.example.json",
    }
    for name in CUMULATIVE_UI:
        files[ROOT / "src" / "ai_article_studio" / "ui" / name] = package / "payload" / "ui" / name
    for name in CUMULATIVE_CORE:
        files[ROOT / "src" / "ai_article_studio" / "core" / name] = package / "payload" / "core" / name
    for source, destination in files.items():
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)


def test_patch(version: str) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = pathlib.Path(tmp)
        install = build_fixture(root, version)
        package = root / "package"
        build_payload(package)
        preserved = {path: path.read_bytes() for path in (install / "data").rglob("*.json")}
        preserved.update({path: path.read_bytes() for path in (install / "config").rglob("settings.json")})
        preserved.update({path: path.read_bytes() for path in (install / "updater").rglob("*.json")})
        run(str(RELEASE / "phase36_v0433_preflight.py"), "--app-root", str(install))
        run(str(RELEASE / "patch_v0433.py"), str(install), str(package))
        run(str(RELEASE / "set_version_v0433.py"), str(install))
        run(str(RELEASE / "validate_v0433.py"), str(install))
        app = install / "src" / "ai_article_studio" / "ui" / "app.py"
        applied = app.read_text(encoding="utf-8")
        assert applied.count("# v0.4.3.3 Auth/UI Foundation") == 1
        assert applied.count("# v0.4.3.2 embedded six-step creation flow") == 1
        assert applied.count("from .guided_wizard_v0432 import activate_live_article_wizard") == 1
        assert applied.find("# v0.4.3.3 Auth/UI Foundation") < applied.find("# v0.4.3.2 embedded six-step creation flow")
        run(str(RELEASE / "patch_v0433.py"), str(install), str(package))
        assert app.read_text(encoding="utf-8") == applied
        for path, value in preserved.items():
            assert path.read_bytes() == value


def test_package() -> None:
    run(str(RELEASE / "build_package.py"))
    manifest = json.loads((ROOT / "candidate-v0433.json").read_text(encoding="utf-8"))
    assert manifest["version"] == "0.4.3.3"
    run(str(ROOT / "scripts" / "validate_release.py"), str(ROOT / "candidate-v0433.json"))
    with zipfile.ZipFile(ROOT / "updates" / PACKAGE_NAME) as archive:
        assert archive.testzip() is None
        required = {
            "payload/ui/guided_wizard_v0427.py",
            "payload/ui/guided_wizard_v0432.py",
            "payload/ui/auth_ui.py",
            "payload/core/article_publish_text.py",
            "payload/core/web_ai_workflow.py",
            "payload/core/web_ai_ui_bridge.py",
            "payload/core/image_prompt_builder.py",
            "payload/core/auth_service.py",
            "payload/supabase/migrations/202608230001_phase_auth_ui_foundation.sql",
            "payload/docs/AUTH_UI_FOUNDATION.md",
            "payload/config/auth.example.json",
        }
        assert required <= set(archive.namelist())


def main() -> None:
    for version in ("0.4.2.9", "0.4.3.0", "0.4.3.1", "0.4.3.2"):
        test_patch(version)
    test_package()
    print("V0.4.3.3 UPDATE PACKAGE TESTS OK")


if __name__ == "__main__":
    main()
