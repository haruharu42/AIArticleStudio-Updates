from __future__ import annotations

import argparse
import json
from pathlib import Path


SUPPORTED = {"0.4.2.9", "0.4.3.0", "0.4.3.1", "0.4.3.2", "0.4.3.3", "0.4.3.4"}
AUTH_MARKER = "# v0.4.3.3 Auth/UI Foundation"
V0432_MARKER = "# v0.4.3.2 embedded six-step creation flow"


def read_version(path: Path) -> str:
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("__version__") and "=" in line:
            return line.split("=", 1)[1].strip().strip("'\"")
    return ""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--app-root", required=True)
    root = Path(parser.parse_args().app_root)
    app = root / "src" / "ai_article_studio" / "ui" / "app.py"
    init_file = root / "src" / "ai_article_studio" / "__init__.py"
    ui_dir = app.parent
    core_dir = ui_dir.parent / "core"
    version = read_version(init_file) if init_file.is_file() else ""
    text = app.read_text(encoding="utf-8") if app.is_file() else ""
    activation = ""
    for name in ("v0432", "v0431", "v0429"):
        if f"from .guided_wizard_{name} import activate_live_article_wizard" in text:
            activation = name
            break
    version_and_hook = (
        (version in {"0.4.2.9", "0.4.3.0"} and activation == "v0429" and AUTH_MARKER not in text)
        or (version == "0.4.3.1" and activation == "v0431" and AUTH_MARKER not in text)
        or (version == "0.4.3.2" and activation == "v0432" and text.count(V0432_MARKER) == 1 and AUTH_MARKER not in text)
        or (version in {"0.4.3.3", "0.4.3.4"} and activation == "v0432" and text.count(V0432_MARKER) == 1 and text.count(AUTH_MARKER) == 1)
    )
    required_ui = all((ui_dir / f"guided_wizard_v042{number}.py").is_file() for number in (7, 8, 9))
    required_core = all((core_dir / name).is_file() for name in ("web_ai_workflow.py", "web_ai_ui_bridge.py", "image_prompt_builder.py"))
    safe = bool(
        app.is_file()
        and version in SUPPORTED
        and version_and_hook
        and required_ui
        and required_core
        and text.count("# v0.4.2.9 live show_create activation hook") == 1
        and "    def __init__(" in text
    )
    result = {
        "app_root": str(root),
        "installed_version": version,
        "activation_import": activation,
        "safe_to_update": safe,
        "reason": f"canonical_v{version.replace('.', '')}_verified" if safe else "canonical_v0429_to_v0434_required",
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if not safe:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
