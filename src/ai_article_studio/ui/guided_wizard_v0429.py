from __future__ import annotations

from .guided_wizard_v0428 import install_article_wizard


ACTIVATION_MARKER = "v0.4.2.9-live-show-create-hook"
LIVE_BODY_WORDS = (
    "生成方法を選択",
    "完成記事を作る前の画像計画",
    "基本設定",
)


def _manager(widget):
    try:
        return str(widget.winfo_manager() or "")
    except Exception:
        return ""


def _text(widget):
    try:
        if str(widget.winfo_class()) in {
            "Label",
            "TLabel",
            "Button",
            "TButton",
            "Checkbutton",
            "TCheckbutton",
            "Radiobutton",
            "TRadiobutton",
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
    return "\n".join(value for value in (_text(item) for item in _walk(widget)) if value)


def _descendant_count(widget):
    return sum(1 for _item in _walk(widget))


def find_live_article_body(app):
    """Find the live long-form body after the real show_create event has rendered it."""
    candidates = []
    for widget in _walk(app):
        if widget is app or _manager(widget) not in {"pack", "grid", "place", "canvas"}:
            continue
        try:
            widget_class = str(widget.winfo_class())
        except Exception:
            continue
        if widget_class not in {"Frame", "TFrame", "Canvas"}:
            continue
        joined = _descendant_text(widget)
        if not all(word in joined for word in LIVE_BODY_WORDS):
            continue
        if "AI ASSIST" in joined or "記事ライブラリ" in joined:
            continue
        candidates.append((_descendant_count(widget), widget))
    if not candidates:
        return None
    return min(candidates, key=lambda item: item[0])[1]


def activate_live_article_wizard(app):
    """Activate the approved UI against the widgets created by the real navigation event."""
    body = find_live_article_body(app)
    if body is None:
        app._v0429_live_wizard_active = False
        app._v0429_activation_error = "live_article_body_not_found"
        return None

    current = getattr(app, "_v0427_article_wizard", None)
    if current:
        try:
            root = current.get("root")
            if root and root.winfo_exists() and root.master is body:
                app._v0429_live_wizard_active = True
                app._v0429_activation_marker = ACTIVATION_MARKER
                return current
        except Exception:
            pass

    original = [child for child in body.winfo_children() if _manager(child)]
    install_article_wizard(app, body)
    wizard = getattr(app, "_v0427_article_wizard", None)
    if not wizard or not wizard.get("root") or len(wizard.get("pages") or ()) != 4:
        raise RuntimeError("記事作成の新画面を有効化できませんでした。")
    if any(_manager(child) for child in original):
        raise RuntimeError("旧記事作成画面を非表示にできませんでした。")
    app._article_create_body = body
    app._v0429_live_wizard_active = True
    app._v0429_activation_marker = ACTIVATION_MARKER
    app._v0429_activation_error = ""
    return wizard
