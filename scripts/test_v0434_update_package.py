from __future__ import annotations

import json
import pathlib
import subprocess
import sys
import tempfile
import zipfile


ROOT = pathlib.Path(__file__).resolve().parents[1]
PACKAGE_NAME = "AIArticleStudio_Update_v0.4.3.4_GoogleOAuthFix.zip"
OLD_PACKAGE = ROOT / "updates" / "AIArticleStudio_Update_v0.4.3.3_AuthUIFoundation.zip"

sys.path.insert(0, str(ROOT / "scripts"))
import test_v0433_update_package as v0433  # noqa: E402


def run(*args: str) -> None:
    subprocess.run([sys.executable, *args], cwd=ROOT, check=True)


def build_v0433_fixture(root: pathlib.Path) -> pathlib.Path:
    install = v0433.build_fixture(root, "0.4.3.2")
    old = root / "v0433-package"
    with zipfile.ZipFile(OLD_PACKAGE) as archive:
        archive.extractall(old)
    run(str(old / "phase36_v0433_preflight.py"), "--app-root", str(install))
    run(str(old / "patch_v0433.py"), str(install), str(old))
    run(str(old / "set_version_v0433.py"), str(install))
    run(str(old / "validate_v0433.py"), str(install))
    auth_text = (install / "src" / "ai_article_studio" / "core" / "auth_service.py").read_text(encoding="utf-8")
    assert '"state": state' in auth_text
    return install


def test_patch(version: str, package: pathlib.Path) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = pathlib.Path(tmp)
        install = build_v0433_fixture(root) if version == "0.4.3.3" else v0433.build_fixture(root, version)
        preserved = {path: path.read_bytes() for path in (install / "data").rglob("*.json")}
        preserved.update({path: path.read_bytes() for path in (install / "config").rglob("settings.json")})
        preserved.update({path: path.read_bytes() for path in (install / "updater").rglob("*.json")})
        run(str(package / "phase36_v0434_preflight.py"), "--app-root", str(install))
        run(str(package / "patch_v0434.py"), str(install), str(package))
        run(str(package / "set_version_v0434.py"), str(install))
        run(str(package / "validate_v0434.py"), str(install))
        auth = install / "src" / "ai_article_studio" / "core" / "auth_service.py"
        fixed = auth.read_text(encoding="utf-8")
        assert '"state": state' not in fixed
        assert "expected_state=state" not in fixed
        assert '"code_challenge_method": "s256"' in fixed
        assert "token?grant_type=pkce" in fixed
        run(str(package / "patch_v0434.py"), str(install), str(package))
        assert auth.read_text(encoding="utf-8") == fixed
        for path, value in preserved.items():
            assert path.read_bytes() == value


def main() -> None:
    run(str(ROOT / "release" / "v0434" / "build_package.py"))
    manifest = json.loads((ROOT / "candidate-v0434.json").read_text(encoding="utf-8"))
    assert manifest["version"] == "0.4.3.4"
    run(str(ROOT / "scripts" / "validate_release.py"), str(ROOT / "candidate-v0434.json"))
    with tempfile.TemporaryDirectory() as tmp:
        package = pathlib.Path(tmp) / "package"
        with zipfile.ZipFile(ROOT / "updates" / PACKAGE_NAME) as archive:
            assert archive.testzip() is None
            archive.extractall(package)
        for version in ("0.4.2.9", "0.4.3.0", "0.4.3.1", "0.4.3.2", "0.4.3.3"):
            test_patch(version, package)
    print("V0.4.3.4 UPDATE PACKAGE TESTS OK")


if __name__ == "__main__":
    main()
