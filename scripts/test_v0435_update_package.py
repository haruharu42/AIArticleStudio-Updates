from __future__ import annotations

import json
import pathlib
import subprocess
import sys
import tempfile
import zipfile


ROOT = pathlib.Path(__file__).resolve().parents[1]
PACKAGE_NAME = "AIArticleStudio_Update_v0.4.3.5_AdminUserManagement.zip"
V0434_PACKAGE = ROOT / "updates" / "AIArticleStudio_Update_v0.4.3.4_GoogleOAuthFix.zip"

sys.path.insert(0, str(ROOT / "scripts"))
import test_v0433_update_package as v0433  # noqa: E402
import test_v0434_update_package as v0434  # noqa: E402


def run(*args: str) -> None:
    subprocess.run([sys.executable, *args], cwd=ROOT, check=True)


def build_v0434_fixture(root: pathlib.Path) -> pathlib.Path:
    install = v0434.build_v0433_fixture(root)
    package = root / "v0434-package"
    with zipfile.ZipFile(V0434_PACKAGE) as archive:
        archive.extractall(package)
    run(str(package / "phase36_v0434_preflight.py"), "--app-root", str(install))
    run(str(package / "patch_v0434.py"), str(install), str(package))
    run(str(package / "set_version_v0434.py"), str(install))
    run(str(package / "validate_v0434.py"), str(install))
    return install


def test_patch(version: str, package: pathlib.Path) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = pathlib.Path(tmp)
        if version == "0.4.3.4":
            install = build_v0434_fixture(root)
        elif version == "0.4.3.3":
            install = v0434.build_v0433_fixture(root)
        else:
            install = v0433.build_fixture(root, version)

        preserved = {path: path.read_bytes() for path in (install / "data").rglob("*.json")}
        preserved.update({path: path.read_bytes() for path in (install / "config").rglob("settings.json")})
        preserved.update({path: path.read_bytes() for path in (install / "updater").rglob("*.json")})

        run(str(package / "phase36_v0435_preflight.py"), "--app-root", str(install))
        run(str(package / "patch_v0435.py"), str(install), str(package))
        run(str(package / "set_version_v0435.py"), str(install))
        run(str(package / "validate_v0435.py"), str(install))

        core = install / "src" / "ai_article_studio" / "core" / "auth_service.py"
        ui = install / "src" / "ai_article_studio" / "ui" / "auth_ui.py"
        migration = install / "supabase" / "migrations" / "202608240001_admin_user_management.sql"
        expected = {path: path.read_bytes() for path in (core, ui, migration)}
        assert "admin_set_user_status" in core.read_text(encoding="utf-8")
        assert "USER MANAGEMENT" in ui.read_text(encoding="utf-8")
        assert "public.admin_user_actions" in migration.read_text(encoding="utf-8")

        run(str(package / "patch_v0435.py"), str(install), str(package))
        assert all(path.read_bytes() == value for path, value in expected.items())
        assert all(path.read_bytes() == value for path, value in preserved.items())


def main() -> None:
    run(str(ROOT / "release" / "v0435" / "build_package.py"))
    manifest = json.loads((ROOT / "candidate-v0435.json").read_text(encoding="utf-8"))
    assert manifest["version"] == "0.4.3.5"
    run(str(ROOT / "scripts" / "validate_release.py"), str(ROOT / "candidate-v0435.json"))

    with tempfile.TemporaryDirectory() as tmp:
        package = pathlib.Path(tmp) / "package"
        with zipfile.ZipFile(ROOT / "updates" / PACKAGE_NAME) as archive:
            assert archive.testzip() is None
            archive.extractall(package)
        for version in ("0.4.2.9", "0.4.3.0", "0.4.3.1", "0.4.3.2", "0.4.3.3", "0.4.3.4"):
            test_patch(version, package)
    print("V0.4.3.5 UPDATE PACKAGE TESTS OK")


if __name__ == "__main__":
    main()
