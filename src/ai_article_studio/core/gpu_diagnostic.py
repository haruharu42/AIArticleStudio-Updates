from __future__ import annotations

from dataclasses import asdict, dataclass
import shutil
import subprocess
from typing import Any


@dataclass(frozen=True)
class GPUDiagnostic:
    available: bool = False
    gpu_name: str = ""
    vram_mb: int | None = None
    backend: str = ""
    recommended_mode: str = "web"
    capability_tier: str = "unknown"
    message: str = "GPU情報を確認できませんでした。Web版画像生成は利用できます。"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _parse_int(value: str) -> int | None:
    try:
        return int(float(str(value).strip()))
    except (TypeError, ValueError):
        return None


def diagnose_gpu(timeout_seconds: float = 3.0) -> GPUDiagnostic:
    """Return a safe, dependency-free GPU capability snapshot.

    This is a diagnostic only. It does not promise that a particular diffusion
    model or runtime will work; actual local generation remains gated by the
    optional local-image runtime pack in a later phase.
    """

    nvidia_smi = shutil.which("nvidia-smi")
    if not nvidia_smi:
        return GPUDiagnostic(
            available=False,
            recommended_mode="web",
            capability_tier="not_detected",
            message="対応GPUを自動確認できませんでした。Web版画像生成をおすすめします。",
        )

    cmd = [
        nvidia_smi,
        "--query-gpu=name,memory.total",
        "--format=csv,noheader,nounits",
    ]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=max(1.0, float(timeout_seconds)),
            check=False,
            encoding="utf-8",
            errors="replace",
        )
    except (OSError, subprocess.SubprocessError, ValueError):
        return GPUDiagnostic(
            available=False,
            recommended_mode="web",
            capability_tier="diagnostic_failed",
            message="GPU診断に失敗しました。記事作成には影響ありません。Web版画像生成を利用できます。",
        )

    if result.returncode != 0 or not result.stdout.strip():
        return GPUDiagnostic(
            available=False,
            recommended_mode="web",
            capability_tier="diagnostic_failed",
            message="GPU情報を取得できませんでした。記事作成には影響ありません。",
        )

    first = result.stdout.strip().splitlines()[0]
    parts = [part.strip() for part in first.split(",", 1)]
    name = parts[0] if parts else "NVIDIA GPU"
    vram = _parse_int(parts[1]) if len(parts) > 1 else None

    if vram is None:
        tier = "detected"
        msg = "NVIDIA GPUを検出しました。ローカル生成の可否は画像ランタイム導入時に再確認します。"
    elif vram >= 12000:
        tier = "high"
        msg = "GPUを検出しました。ローカル画像生成候補として利用できますが、使用モデル導入時に最終確認します。"
    elif vram >= 7000:
        tier = "standard"
        msg = "GPUを検出しました。標準的なローカル画像生成候補ですが、モデルごとの必要VRAMを導入時に確認します。"
    elif vram >= 4000:
        tier = "light"
        msg = "GPUを検出しました。軽量設定の候補です。大きな画像や高負荷モデルはWeb版をおすすめする場合があります。"
    else:
        tier = "limited"
        msg = "GPUを検出しましたが、ローカル画像生成は軽量設定でも制約が出る可能性があります。Web版をおすすめします。"

    return GPUDiagnostic(
        available=True,
        gpu_name=name,
        vram_mb=vram,
        backend="nvidia-smi",
        recommended_mode="local_candidate" if tier in {"high", "standard", "light"} else "web",
        capability_tier=tier,
        message=msg,
    )
