from __future__ import annotations

import tkinter as tk

from .guided_wizard_v0427 import (
    install_article_wizard as _install_article_wizard,
    install_web_ai_wizard as _install_web_ai_wizard,
)


ACTIVATION_MARKER = "v0.4.2.8-direct-visual-wizard"
LEGACY_STEP_WORDS = ("基本設定", "テーマ", "記事設計", "作成", "完成")


def _manager(widget):
    try:
        return str(widget.winfo_manager() or "")
    except Exception:
        return ""


def _hide(widget):
    try:
        manager = _manager(widget)
        if manager == "pack":
            widget.pack_forget()
        elif manager == "grid":
            widget.grid_remove()
        elif manager == "place":
            widget.place_forget()
    except Exception:
        pass


def _text(widget):
    try:
        if str(widget.winfo_class()) in {
            "Label", "TLabel", "Button", "TButton", "Checkbutton", "TCheckbutton", "Radiobutton"
        }:
            return str(widget.cget("text") or "").strip()
    except Exception:
        pass
    return ""


def _walk(widget):
    yield widget
    try:
        children = list(widget.winfo_children())
    except Exception:
        children = []
    for child in children:
        yield from _walk(child)


def _descendant_text(widget):
    return tuple(value for value in (_text(item) for item in _walk(widget)) if value)


def _descendant_count(widget):
    return sum(1 for _item in _walk(widget))


def _legacy_navigation_candidate(app, body):
    candidates = []
    for widget in _walk(app):
        if widget is body or _manager(widget) not in {"pack", "grid", "place"}:
            continue
        values = _descendant_text(widget)
        joined = "\n".join(values)
        matches = sum(1 for word in LEGACY_STEP_WORDS if word in joined)
        if matches < 4:
            continue
        count = _descendant_count(widget)
        # The old progress strip is compact. Large article containers are never hidden here.
        if count <= 28 and "生成方法を選択" not in joined and "完成記事を作る前の画像計画" not in joined:
            candidates.append((count, widget))
    return min(candidates, key=lambda item: item[0])[1] if candidates else None


def _hide_legacy_chrome(app, body):
    navigation = _legacy_navigation_candidate(app, body)
    if navigation is not None:
        _hide(navigation)
        app._v0428_hidden_legacy_navigation = navigation

    # The approved layout does not use the old long-form vertical scrollbar.
    ancestors = []
    current = body
    for _index in range(4):
        try:
            current = current.master
        except Exception:
            break
        if current is None:
            break
        ancestors.append(current)
    for ancestor in ancestors:
        try:
            siblings = ancestor.winfo_children()
        except Exception:
            continue
        for sibling in siblings:
            try:
                if str(sibling.winfo_class()) not in {"Scrollbar", "TScrollbar"}:
                    continue
                orient = str(sibling.cget("orient") or "vertical")
                if orient == "vertical":
                    _hide(sibling)
                    app._v0428_hidden_legacy_scrollbar = sibling
            except Exception:
                pass


def install_article_wizard(app, body):
    """Direct activation entry point used by the patched article-create call site."""
    _hide_legacy_chrome(app, body)
    result = _install_article_wizard(app, body)
    wizard = getattr(app, "_v0427_article_wizard", None)
    if not wizard or not wizard.get("root") or len(wizard.get("pages") or ()) != 4:
        raise RuntimeError("専用6ステップUIを初期化できませんでした。")
    app._v0428_visual_wizard_active = True
    app._v0428_activation_marker = ACTIVATION_MARKER
    return result


def install_web_ai_wizard(app, win, req, pages, fields):
    """Direct activation entry point for the embedded create/complete stages."""
    result = _install_web_ai_wizard(app, win, req, pages, fields)
    wizard = getattr(app, "_v0427_web_wizard", None)
    if not wizard or not wizard.get("shell"):
        raise RuntimeError("Web版AIの作成画面を初期化できませんでした。")
    app._v0428_web_wizard_active = True
    return result
