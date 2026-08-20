from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[2]
VERSION = "0.4.2"
PACKAGE_NAME = "AIArticleStudio_Update_v0.4.2_Phase36ImageWorkflow.zip"
PACKAGE_PATH = ROOT / "updates" / PACKAGE_NAME
STAGE = ROOT / ".build_v042"
ZIP_TIMESTAMP = (2020, 1, 1, 0, 0, 0)
CORE_FILES = [
    "image_settings.py",
    "image_marker_parser.py",
    "image_prompt_builder.py",
    "image_assets.py",
    "gpu_diagnostic.py",
    "web_ai_state.py",
    "web_ai_workflow.py",
    "web_ai_ui_bridge.py",
]
RELEASE_FILES = [
    "README.txt",
    "Update.ps1",
    "phase36_v042_preflight.py",
    "patch_v042.py",
    "set_version_v042.py",
    "validate_v042.py",
]


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest().upper()


def write_reproducible_zip(source_root: Path, output: Path) -> None:
    """Build byte-for-byte reproducible archives across CI reruns.

    Git checkouts assign fresh filesystem mtimes, and ZipFile.write preserves
    those timestamps. That made the package SHA change on every rebuild even
    when the source was identical. Fixed metadata keeps stable manifests safe.
    """

    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for path in sorted(p for p in source_root.rglob("*") if p.is_file()):
            arcname = path.relative_to(source_root).as_posix()
            info = zipfile.ZipInfo(arcname, date_time=ZIP_TIMESTAMP)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.flag_bits |= 0x800  # UTF-8 filenames
            zf.writestr(info, path.read_bytes())


def main() -> None:
    if STAGE.exists():
        shutil.rmtree(STAGE)
    (STAGE / "payload" / "core").mkdir(parents=True)
    for name in RELEASE_FILES:
        shutil.copy2(ROOT / "release" / "v042" / name, STAGE / name)
    for name in CORE_FILES:
        shutil.copy2(ROOT / "src" / "ai_article_studio" / "core" / name, STAGE / "payload" / "core" / name)

    PACKAGE_PATH.parent.mkdir(parents=True, exist_ok=True)
    PACKAGE_PATH.unlink(missing_ok=True)
    write_reproducible_zip(STAGE, PACKAGE_PATH)

    digest = sha256(PACKAGE_PATH)
    manifest = {
        "version": VERSION,
        "package_url": f"https://raw.githubusercontent.com/haruharu42/AIArticleStudio-Updates/main/updates/{PACKAGE_NAME}",
        "sha256": digest,
        "channel": "preview",
        "notes": "Phase 3.6 image workflow: beginner image settings, Web eyecatch/illustration prompts, illustration positions, metadata storage, and safe GPU diagnostics.",
    }
    (ROOT / "candidate-v042.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (ROOT / "release" / "v042" / "SHA256.txt").write_text(digest + "  " + PACKAGE_NAME + "\n", encoding="ascii")

    with zipfile.ZipFile(PACKAGE_PATH) as zf:
        bad = zf.testzip()
        if bad:
            raise RuntimeError(f"ZIP CRC failure: {bad}")
        names = set(zf.namelist())
        required = {"Update.ps1", "patch_v042.py", "phase36_v042_preflight.py", "validate_v042.py"}
        required |= {f"payload/core/{name}" for name in CORE_FILES}
        missing = required - names
        if missing:
            raise RuntimeError(f"ZIP missing required files: {sorted(missing)}")
    print(f"BUILT {PACKAGE_PATH.name}")
    print(f"SHA256 {digest}")


if __name__ == "__main__":
    main()
