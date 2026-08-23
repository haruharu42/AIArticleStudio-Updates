from __future__ import annotations

import shutil
import sys
from pathlib import Path


VERSION = "0.4.3.3"
MARKER = "# v0.4.3.3 Auth/UI Foundation"
V0432_MARKER = "# v0.4.3.2 embedded six-step creation flow"
V0432_ANCHOR = f"    {V0432_MARKER}\n"
V0429_ANCHOR = "    # v0.4.2.9 live show_create activation hook\n"
HOOK_OLDS = (
    "from .guided_wizard_v0429 import activate_live_article_wizard",
    "from .guided_wizard_v0431 import activate_live_article_wizard",
)
HOOK_V0432 = "from .guided_wizard_v0432 import activate_live_article_wizard"
CUMULATIVE_UI_MODULES = ("guided_wizard_v0427.py", "guided_wizard_v0432.py", "auth_ui.py")
CUMULATIVE_CORE_MODULES = (
    "article_publish_text.py",
    "web_ai_workflow.py",
    "web_ai_ui_bridge.py",
    "image_prompt_builder.py",
    "auth_service.py",
)
AUTH_HOOK = r'''    # v0.4.3.3 Auth/UI Foundation
    _v0433_original_init = __init__

    def __init__(self, *args, **kwargs):
        self._v0433_original_init(*args, **kwargs)
        from .auth_ui import install_auth_foundation
        install_auth_foundation(self)

'''


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: patch_v0433.py <install-root> <package-root>")
    install = Path(sys.argv[1])
    package = Path(sys.argv[2])
    app = install / "src" / "ai_article_studio" / "ui" / "app.py"
    payload_ui = package / "payload" / "ui"
    payload_core = package / "payload" / "core"
    auth_ui = payload_ui / "auth_ui.py"
    auth_core = payload_core / "auth_service.py"
    migration = package / "payload" / "supabase" / "migrations" / "202608230001_phase_auth_ui_foundation.sql"
    docs = package / "payload" / "docs" / "AUTH_UI_FOUNDATION.md"
    config_example = package / "payload" / "config" / "auth.example.json"
    python_payload = (
        *(payload_ui / name for name in CUMULATIVE_UI_MODULES),
        *(payload_core / name for name in CUMULATIVE_CORE_MODULES),
    )
    required = (*python_payload, migration, docs, config_example)
    if not app.is_file():
        raise RuntimeError(f"required application file not found: {app}")
    for source in python_payload:
        if not source.is_file():
            raise RuntimeError(f"v0.4.3.3 payload is missing: {source.name}")
        compile(source.read_text(encoding="utf-8"), str(source), "exec")
    for source in (migration, docs, config_example):
        if not source.is_file():
            raise RuntimeError(f"v0.4.3.3 payload is missing: {source.name}")

    core_text = auth_core.read_text(encoding="utf-8")
    ui_text = auth_ui.read_text(encoding="utf-8")
    sql_text = migration.read_text(encoding="utf-8")
    required_tokens = (
        (core_text, "WindowsDPAPIProtector"),
        (core_text, "sign_in_with_google"),
        (core_text, "token?grant_type=pkce"),
        (ui_text, "AI_NOTICE"),
        (ui_text, "USER_MENU"),
        (ui_text, "ADMIN_MENU"),
        (sql_text, "alter table public.profiles enable row level security"),
        (sql_text, "private.is_active_admin"),
    )
    if not all(token in text for text, token in required_tokens):
        raise RuntimeError("v0.4.3.3 Auth/UI payload is incomplete")

    text = app.read_text(encoding="utf-8")
    if V0432_MARKER not in text:
        if text.count(V0429_ANCHOR) != 1:
            raise RuntimeError("canonical v0.4.2.9 activation anchor is missing")
        hooks = [hook for hook in HOOK_OLDS if hook in text]
        if len(hooks) != 1 or text.count(hooks[0]) != 1:
            raise RuntimeError("canonical pre-v0.4.3.2 activation import is missing")
        text = text.replace(hooks[0], HOOK_V0432, 1)
        text = text.replace(V0429_ANCHOR, V0432_ANCHOR + V0429_ANCHOR, 1)
    elif text.count(V0432_MARKER) != 1 or HOOK_V0432 not in text:
        raise RuntimeError("v0.4.3.2 marker exists without its canonical activation import")

    if MARKER not in text:
        if text.count(V0432_ANCHOR) != 1:
            raise RuntimeError("canonical v0.4.3.2 app anchor is missing")
        if "    def __init__(" not in text:
            raise RuntimeError("canonical App.__init__ is missing")
        text = text.replace(V0432_ANCHOR, AUTH_HOOK + V0432_ANCHOR, 1)
    elif text.count(MARKER) != 1 or "from .auth_ui import install_auth_foundation" not in text:
        raise RuntimeError("v0.4.3.3 marker exists without the canonical auth hook")
    compile(text, str(app), "exec")

    app.parent.mkdir(parents=True, exist_ok=True)
    core_target = app.parent.parent / "core"
    core_target.mkdir(parents=True, exist_ok=True)
    for name in CUMULATIVE_UI_MODULES:
        shutil.copy2(payload_ui / name, app.parent / name)
    for name in CUMULATIVE_CORE_MODULES:
        shutil.copy2(payload_core / name, core_target / name)
    migration_target = install / "supabase" / "migrations"
    docs_target = install / "docs"
    config_target = install / "config"
    migration_target.mkdir(parents=True, exist_ok=True)
    docs_target.mkdir(parents=True, exist_ok=True)
    config_target.mkdir(parents=True, exist_ok=True)
    shutil.copy2(migration, migration_target / migration.name)
    shutil.copy2(docs, docs_target / docs.name)
    shutil.copy2(config_example, config_target / config_example.name)
    app.write_text(text, encoding="utf-8", newline="\n")
    print(f"v{VERSION} Auth/UI Foundation applied")


if __name__ == "__main__":
    main()
