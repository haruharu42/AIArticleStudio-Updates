from __future__ import annotations

import sys
from pathlib import Path


VERSION = "0.4.3.4"


def read_version(path: Path) -> str:
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("__version__") and "=" in line:
            return line.split("=", 1)[1].strip().strip("'\"")
    return ""


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: validate_v0434.py <install-root>")
    root = Path(sys.argv[1])
    init_file = root / "src" / "ai_article_studio" / "__init__.py"
    app = root / "src" / "ai_article_studio" / "ui" / "app.py"
    auth_ui = app.parent / "auth_ui.py"
    auth_core = app.parent.parent / "core" / "auth_service.py"
    required = (init_file, app, auth_ui, auth_core, app.parent / "guided_wizard_v0432.py")
    if not all(path.is_file() for path in required):
        raise RuntimeError("canonical v0.4.3.4 files are missing")
    if read_version(init_file) != VERSION:
        raise RuntimeError(f"installed version is not {VERSION}")
    app_text = app.read_text(encoding="utf-8")
    if app_text.count("# v0.4.3.3 Auth/UI Foundation") != 1:
        raise RuntimeError("Auth/UI hook is missing or duplicated")
    core_text = auth_core.read_text(encoding="utf-8")
    for token in ("sign_in_with_password", "WindowsDPAPIProtector", "code_verifier", "code_challenge", '"code_challenge_method": "s256"', "token?grant_type=pkce"):
        if token not in core_text:
            raise RuntimeError(f"auth core token is missing: {token}")
    for token in ('"state": state', "expected_state=state"):
        if token in core_text:
            raise RuntimeError(f"obsolete OAuth state dependency remains: {token}")
    for path in required[1:]:
        compile(path.read_text(encoding="utf-8"), str(path), "exec")
    print("v0.4.3.4 validation OK")


if __name__ == "__main__":
    main()
