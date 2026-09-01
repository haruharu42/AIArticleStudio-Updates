from __future__ import annotations

import os
from pathlib import Path
import threading
import tkinter as tk
from tkinter import filedialog, messagebox
from typing import Any, Callable, Mapping
import webbrowser


SURFACE_2 = "#151C2F"
SURFACE_3 = "#1C2942"
LINE = "#2A3A59"
TEXT = "#F8FAFC"
SOFT = "#CBD5E1"
MUTED = "#8FA2C4"
GREEN = "#34D399"
PURPLE_DARK = "#6D28D9"


def _font(size: int = 9, weight: str = "normal") -> tuple[str, int, str]:
    return ("Yu Gothic UI", size, weight)


def _label(parent, text: str, *, size: int = 9, color: str = TEXT, bold: bool = False, bg: str = SURFACE_2, **kwargs):
    return tk.Label(parent, text=text, font=_font(size, "bold" if bold else "normal"), fg=color, bg=bg, **kwargs)


def _button(parent, text: str, command: Callable[[], None], *, primary: bool = False):
    return tk.Button(
        parent,
        text=text,
        command=command,
        font=_font(8, "bold"),
        fg=TEXT,
        bg=PURPLE_DARK if primary else SURFACE_3,
        activeforeground=TEXT,
        activebackground="#8B5CF6" if primary else LINE,
        relief="flat",
        bd=0,
        cursor="hand2",
        padx=8,
        pady=6,
    )


def render_cloud_image_panel(
    app,
    panel,
    *,
    article_id: str,
    article_text: str,
    prompt_renderer: Callable[[Any, Any, Mapping[str, Any]], None],
    prompt_fields: Mapping[str, Any],
) -> None:
    """Render prompt/attachment tabs in the existing 330px result panel."""

    for child in panel.winfo_children():
        child.destroy()
    article_value = str(article_id or "").strip()
    tabs = tk.Frame(panel, bg=SURFACE_2)
    tabs.pack(fill="x", padx=12, pady=(12, 4))
    content = tk.Frame(panel, bg=SURFACE_2)
    content.pack(fill="both", expand=True)

    def show_prompts() -> None:
        prompt_renderer(app, content, prompt_fields)

    def show_assets() -> None:
        _render_assets(app, content, article_value, article_text, refresh=show_assets)

    _button(tabs, "プロンプト", show_prompts).pack(side="left", fill="x", expand=True, padx=(0, 3))
    _button(tabs, "画像ファイル", show_assets, primary=True).pack(side="left", fill="x", expand=True, padx=(3, 0))
    show_assets()


def _render_assets(app, parent, article_id: str, article_text: str, *, refresh: Callable[[], None]) -> None:
    for child in parent.winfo_children():
        child.destroy()
    scrollbar = tk.Scrollbar(parent, orient="vertical")
    scrollbar.pack(side="right", fill="y")
    canvas = tk.Canvas(parent, bg=SURFACE_2, highlightthickness=0, yscrollcommand=scrollbar.set)
    canvas.pack(side="left", fill="both", expand=True)
    scrollbar.configure(command=canvas.yview)
    holder = tk.Frame(canvas, bg=SURFACE_2)
    window = canvas.create_window((0, 0), window=holder, anchor="nw")
    holder.bind("<Configure>", lambda _event: canvas.configure(scrollregion=canvas.bbox("all")))
    canvas.bind("<Configure>", lambda event: canvas.itemconfigure(window, width=event.width))

    _label(holder, "Windows画像ライブラリ", size=12, bold=True).pack(anchor="w", padx=16, pady=(10, 2))
    _label(
        holder,
        "選択時にローカルへ安全保存。クラウド記事がある場合だけprivate Storageへ同期します。",
        size=8,
        color=SOFT,
        wraplength=292,
        justify="left",
    ).pack(anchor="w", padx=16, pady=(0, 9))
    if not article_id:
        _label(holder, "先に記事をライブラリへ保存してください。", size=8, color=MUTED).pack(anchor="w", padx=16, pady=12)
        return
    store = getattr(app, "_aas_image_store", None)
    if store is None:
        _label(holder, "画像保存先を初期化できませんでした。", size=8, color=MUTED).pack(anchor="w", padx=16, pady=12)
        return

    active = store.list_managed_assets(article_id)
    prompt_data = store.load_payload(article_id)
    slots = _planned_slots(app, article_text, article_id, prompt_data)
    slot_keys = {(role, str(marker or "")) for role, marker, _label_text in slots}
    for asset in active:
        key = (str(asset.get("asset_type") or "inline"), str(asset.get("insertion_marker") or ""))
        if key in slot_keys:
            continue
        role, marker = key[0], key[1] or None
        label_text = "アイキャッチ" if role == "cover" else f"保存済み挿絵　{marker or '位置未設定'}"
        slots.append((role, marker, label_text))
        slot_keys.add(key)
    if not slots:
        slots = [("cover", None, "アイキャッチ")]
    for index, (asset_type, marker, label_text) in enumerate(slots):
        current = _slot_asset(active, asset_type, marker)
        row = tk.Frame(holder, bg="#0D182A", highlightthickness=1, highlightbackground=LINE)
        row.pack(fill="x", padx=12, pady=4)
        _label(row, label_text, size=8, bold=True, color=SOFT, bg="#0D182A", wraplength=270, justify="left").pack(anchor="w", padx=9, pady=(8, 2))
        if current:
            filename = str(current.get("original_filename") or "画像")
            status = _status_text(current)
            _label(row, f"{filename}\n{status}", size=7, color=GREEN if current.get("cloud_status") == "ready" else MUTED, bg="#0D182A", wraplength=270, justify="left").pack(anchor="w", padx=9)
        else:
            _label(row, "未選択", size=7, color=MUTED, bg="#0D182A").pack(anchor="w", padx=9)
        actions = tk.Frame(row, bg="#0D182A")
        actions.pack(fill="x", padx=7, pady=(5, 8))
        _button(
            actions,
            "置換" if current else "選択",
            lambda role=asset_type, mark=marker, order=index, current_value=current: _choose(
                app,
                article_id,
                role,
                mark,
                order,
                current_value,
                refresh,
            ),
            primary=not current,
        ).pack(side="left", padx=2)
        if current:
            _button(actions, "開く", lambda value=current: _open_asset(app, article_id, value)).pack(side="left", padx=2)
            _button(actions, "削除", lambda value=current: _delete(app, article_id, value, refresh)).pack(side="left", padx=2)

    footer = tk.Frame(holder, bg=SURFACE_2)
    footer.pack(fill="x", padx=12, pady=(8, 12))
    _button(footer, "クラウド同期を再試行", lambda: _sync(app, article_id), primary=True).pack(fill="x")
    app._aas_image_sync_changed = lambda changed_id: refresh() if str(changed_id) == article_id else None


def _planned_slots(
    app,
    article_text: str,
    article_id: str,
    prompt_data: Mapping[str, Any],
) -> list[tuple[str, str | None, str]]:
    value = dict(prompt_data or {})
    has_saved_plan = "eyecatch_prompt" in value or "illustration_prompts" in value
    if not has_saved_plan:
        try:
            snapshot = app.web_ai_bridge.current_snapshot()
        except Exception:
            snapshot = {}
        if str(snapshot.get("article_id") or "") == article_id:
            try:
                value = app.web_ai_bridge.build_image_prompts(article_text=str(article_text or ""))
            except TypeError:
                try:
                    value = app.web_ai_bridge.build_image_prompts()
                except Exception:
                    value = {}
            except Exception:
                value = {}
    slots: list[tuple[str, str | None, str]] = []
    if str(value.get("eyecatch_prompt") or ""):
        slots.append(("cover", None, "アイキャッチ"))
    for index, item in enumerate(value.get("illustration_prompts") or [], start=1):
        entry = dict(item) if isinstance(item, Mapping) else {}
        marker = str(entry.get("marker") or "").strip() or f"derived:inline:{index}"
        position = str(entry.get("position") or entry.get("label") or f"挿絵 {index}")
        slots.append(("inline", marker, f"挿絵 {index}　{position}"))
    if not slots:
        settings = dict(value.get("image_settings") or {})
        if settings.get("enabled") and str(settings.get("target") or "") in {"eyecatch", "both"}:
            slots.append(("cover", None, "アイキャッチ"))
    return slots


def _slot_asset(assets: list[dict[str, Any]], asset_type: str, marker: str | None) -> dict[str, Any] | None:
    for asset in reversed(assets):
        if asset.get("asset_type") != asset_type:
            continue
        if asset_type == "cover" or str(asset.get("insertion_marker") or "") == str(marker or ""):
            return asset
    return None


def _choose(app, article_id: str, asset_type: str, marker: str | None, sort_order: int, current: Mapping[str, Any] | None, refresh: Callable[[], None]) -> None:
    selected = filedialog.askopenfilename(
        parent=app,
        title="記事画像を選択",
        filetypes=(("対応画像", "*.png *.jpg *.jpeg *.webp"), ("PNG", "*.png"), ("JPEG", "*.jpg *.jpeg"), ("WebP", "*.webp")),
    )
    if not selected:
        return
    store = getattr(app, "_aas_image_store", None)
    try:
        store.add_managed_asset(
            article_id,
            selected,
            asset_type=asset_type,
            sort_order=sort_order,
            insertion_marker=marker,
            alt_text="",
        )
    except Exception as exc:
        messagebox.showerror("記事画像", f"画像を保存できませんでした。\n{exc}")
        return
    refresh()
    _sync(app, article_id)


def _delete(app, article_id: str, asset: Mapping[str, Any], refresh: Callable[[], None]) -> None:
    if not messagebox.askyesno("記事画像", "この画像を記事から削除しますか？\nクラウド画像がある場合はStorageを先に削除します。"):
        return
    try:
        app._aas_image_store.mark_delete(article_id, str(asset.get("local_asset_id") or ""))
    except Exception as exc:
        messagebox.showerror("記事画像", f"削除を準備できませんでした。\n{exc}")
        return
    refresh()
    _sync(app, article_id)


def _sync(app, article_id: str) -> None:
    bridge = getattr(app, "_aas_cloud_bridge", None)
    if bridge is None:
        app._aas_cloud_sync_status = {"status": "local_only", "local_article_id": article_id, "images": "local_only"}
        return
    bridge.schedule_asset_sync(article_id)


def _open_asset(app, article_id: str, asset: Mapping[str, Any]) -> None:
    try:
        path = app._aas_image_store.managed_file_path(article_id, asset)
    except Exception:
        path = Path()
    if str(asset.get("managed_filename") or "") and path.is_file():
        try:
            if os.name == "nt":
                os.startfile(str(path))  # type: ignore[attr-defined]
            else:
                webbrowser.open(path.resolve().as_uri())
        except Exception as exc:
            messagebox.showwarning("記事画像", f"ローカル画像を開けませんでした。\n{exc}")
        return
    bridge = getattr(app, "_aas_cloud_bridge", None)
    if bridge is None or asset.get("cloud_status") != "ready":
        messagebox.showinfo("記事画像", "開けるローカル画像または同期済みクラウド画像がありません。")
        return

    def worker() -> None:
        try:
            url = bridge.signed_asset_url(asset, expires_in=60)
        except Exception as exc:
            app.after(0, lambda: messagebox.showwarning("記事画像", f"クラウド画像を開けませんでした。\n{exc}"))
            return
        app.after(0, lambda: webbrowser.open(url))

    threading.Thread(target=worker, daemon=True).start()


def _status_text(asset: Mapping[str, Any]) -> str:
    status = str(asset.get("cloud_status") or "local_only")
    labels = {
        "local_only": "ローカル保存済み",
        "pending_upload": "クラウド同期中",
        "ready": "クラウド同期済み",
        "delete_pending": "クラウド削除待ち",
        "error": "ローカル保持・同期要再試行",
    }
    return labels.get(status, status)
