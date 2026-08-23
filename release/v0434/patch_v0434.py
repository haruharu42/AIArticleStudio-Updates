from __future__ import annotations

import sys
from pathlib import Path

try:
    import patch_v0433
except ModuleNotFoundError:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "v0433"))
    import patch_v0433


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: patch_v0434.py <install-root> <package-root>")
    install = Path(sys.argv[1])
    package = Path(sys.argv[2])
    original_argv = sys.argv
    try:
        sys.argv = [str(package / "patch_v0433.py"), str(install), str(package)]
        patch_v0433.main()
    finally:
        sys.argv = original_argv
    auth_core = install / "src" / "ai_article_studio" / "core" / "auth_service.py"
    text = auth_core.read_text(encoding="utf-8")
    forbidden = ('"state": state', "expected_state=state")
    required = ("code_verifier", "code_challenge", '"code_challenge_method": "s256"', "token?grant_type=pkce")
    if any(token in text for token in forbidden) or not all(token in text for token in required):
        raise RuntimeError("v0.4.3.4 Google OAuth payload is invalid")
    print("v0.4.3.4 Google OAuth PKCE hotfix applied")


if __name__ == "__main__":
    main()
