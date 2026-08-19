from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[2]
VERSION = "0.4.0"
PACKAGE_NAME = "AIArticleStudio_Update_v0.4.0_Phase35WebAIProduction.zip"
PACKAGE_PATH = ROOT / "updates" / PACKAGE_NAME
STAGE = ROOT / ".build_v040"
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
    for name in ["README.txt", "Update.ps1", "patch_v040.py", "validate_v040.py"]:
        shutil.copy2(ROOT / "release" / "v040" / name, STAGE / name)
    shutil.copy2(ROOT / "scripts" / "phase35_v040_preflight.py", STAGE / "phase35_v040_preflight.py")
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
        "channel": "stable",
        "notes": "Phase 3.5 Web AI production workflow: external model config, paid-value engine, ingest/repair, save/resume, and publish-ready UI integration.",
    }
    (ROOT / "candidate-v040.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (ROOT / "release" / "v040" / "SHA256.txt").write_text(digest + "  " + PACKAGE_NAME + "\n", encoding="ascii")

    with zipfile.ZipFile(PACKAGE_PATH) as z:
        bad = z.testzip()
        if bad:
            raise RuntimeError(f"ZIP CRC failure: {bad}")
        names = set(z.namelist())
        required = {"README.txt", "Update.ps1", "patch_v040.py", "validate_v040.py", "phase35_v040_preflight.py"}
        if not required.issubset(names):
            raise RuntimeError("ZIP missing required files")
    print(f"BUILT {PACKAGE_PATH.name}")
    print(f"SHA256 {digest}")


if __name__ == "__main__":
    main()
