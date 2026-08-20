from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[2]
VERSION = "0.4.0.1"
PACKAGE_NAME = "AIArticleStudio_Update_v0.4.0.1_Phase35BridgeFix.zip"
PACKAGE_PATH = ROOT / "updates" / PACKAGE_NAME
STAGE = ROOT / ".build_v0401"
CORE_FILES = [
    "paid_value.py",
    "web_ai_config.py",
    "web_ai_ingest.py",
    "web_ai_prompt_builder.py",
    "web_ai_publish.py",
    "web_ai_repair.py",
    "web_ai_state.py",
    "web_ai_ui_bridge.py",
    "web_ai_workflow.py",
    "platform_content_strategy.py",
    "web_prompt_engine_v2.py",
]


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest().upper()


def main() -> None:
    if STAGE.exists():
        shutil.rmtree(STAGE)
    (STAGE / "payload" / "core").mkdir(parents=True)

    for name in [
        "README.txt",
        "Update.ps1",
        "phase35_v0401_preflight.py",
        "set_version_v0401.py",
        "validate_v0401.py",
    ]:
        shutil.copy2(ROOT / "release" / "v0401" / name, STAGE / name)
    shutil.copy2(ROOT / "release" / "v040" / "patch_v040.py", STAGE / "patch_v040.py")

    for name in CORE_FILES:
        shutil.copy2(ROOT / "src" / "ai_article_studio" / "core" / name, STAGE / "payload" / "core" / name)

    PACKAGE_PATH.parent.mkdir(parents=True, exist_ok=True)
    if PACKAGE_PATH.exists():
        PACKAGE_PATH.unlink()
    with zipfile.ZipFile(PACKAGE_PATH, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for path in sorted(p for p in STAGE.rglob("*") if p.is_file()):
            z.write(path, path.relative_to(STAGE).as_posix())

    digest = sha256(PACKAGE_PATH)
    manifest = {
        "version": VERSION,
        "package_url": f"https://raw.githubusercontent.com/haruharu42/AIArticleStudio-Updates/main/updates/{PACKAGE_NAME}",
        "sha256": digest,
        "channel": "bridge",
        "notes": "Compatibility bridge for v0.3.9: fixes Phase 3.5 preflight backup detection, installs integrated Web AI core/UI, and prepares the app for v0.4.1.",
    }
    (ROOT / "latest-v0401.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (ROOT / "release" / "v0401" / "SHA256.txt").write_text(digest + "  " + PACKAGE_NAME + "\n", encoding="ascii")

    with zipfile.ZipFile(PACKAGE_PATH) as z:
        bad = z.testzip()
        if bad:
            raise RuntimeError(f"ZIP CRC failure: {bad}")
        names = set(z.namelist())
        required = {
            "README.txt",
            "Update.ps1",
            "patch_v040.py",
            "phase35_v0401_preflight.py",
            "set_version_v0401.py",
            "validate_v0401.py",
            "payload/core/web_ai_workflow.py",
            "payload/core/web_prompt_engine_v2.py",
        }
        missing = required - names
        if missing:
            raise RuntimeError(f"ZIP missing required files: {sorted(missing)}")
    print(f"BUILT {PACKAGE_PATH.name}")
    print(f"SHA256 {digest}")


if __name__ == "__main__":
    main()
