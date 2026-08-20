from __future__ import annotations

import pathlib
import sys
import tkinter as tk


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "scripts"))

from ai_article_studio.ui.guided_wizard_v0429 import activate_live_article_wizard  # noqa: E402
from test_v0428_tk_runtime import RuntimeApp as BaseRuntimeApp  # noqa: E402


class LiveEventApp(BaseRuntimeApp):
    def _build_legacy_create_screen(self):
        legacy_nav = tk.Frame(self, bg="#0B1020")
        legacy_nav.pack(fill="x")
        for text in ("01 基本設定", "02 テーマ", "03 記事設計", "04 作成", "05 完成"):
            tk.Label(legacy_nav, text=text, bg="#0B1020", fg="#FFFFFF").pack(side="left")

        page_shell = tk.Frame(self, bg="#0B1020")
        page_shell.pack(fill="both", expand=True)
        canvas = tk.Canvas(page_shell, bg="#0B1020", highlightthickness=0)
        canvas.pack(side="left", fill="both", expand=True)
        body = tk.Frame(canvas, bg="#0B1020")
        canvas.create_window((0, 0), window=body, anchor="nw")
        scrollbar = tk.Scrollbar(page_shell, orient="vertical")
        scrollbar.pack(side="right", fill="y")
        cards = []
        for title in ("生成方法を選択", "完成記事を作る前の画像計画", "基本設定"):
            card = tk.Frame(body, bg="#151C2F")
            card.pack(fill="x")
            tk.Label(card, text=title, bg="#151C2F", fg="#FFFFFF").pack()
            cards.append(card)
        self.legacy_nav = legacy_nav
        self.legacy_scrollbar = scrollbar
        self.legacy_cards = cards
        self.live_body = body
        return body

    def _old_show_create(self):
        body = self._build_legacy_create_screen()
        # Mirrors the observed installed path: the previous activation call is unreachable.
        return body

    _v0429_original_show_create = _old_show_create

    def _v0429_activate_after_show_create(self):
        try:
            activate_live_article_wizard(self)
        except Exception as exc:
            self._v0429_live_wizard_active = False
            self._v0429_activation_error = f"{type(exc).__name__}: {exc}"

    def show_create(self, *args, **kwargs):
        result = self._v0429_original_show_create(*args, **kwargs)
        self.after_idle(self._v0429_activate_after_show_create)
        return result


def main() -> None:
    try:
        app = LiveEventApp()
    except tk.TclError as exc:
        if sys.platform == "win32" or "--require-display" in sys.argv:
            raise RuntimeError(f"Tk runtime is required but unavailable: {exc}") from exc
        print("V0.4.2.9 LIVE EVENT TK TEST SKIPPED: display unavailable")
        return
    try:
        returned_body = app.show_create()
        assert returned_body is app.live_body
        assert not hasattr(app, "_v0429_live_wizard_active")
        app.update_idletasks()
        app.update()
        assert app._v0429_live_wizard_active is True, getattr(app, "_v0429_activation_error", "")
        assert app._v0429_activation_marker == "v0.4.2.9-live-show-create-hook"
        assert app.legacy_nav.winfo_manager() == ""
        assert app.legacy_scrollbar.winfo_manager() == ""
        assert all(card.winfo_manager() == "" for card in app.legacy_cards)
        wizard = app._v0427_article_wizard
        assert wizard["root"].master is app.live_body
        assert wizard["pages"][0].winfo_manager() == "pack"
        assert all(page.winfo_manager() == "" for page in wizard["pages"][1:])
    finally:
        app.destroy()
    print("V0.4.2.9 REAL SHOW_CREATE EVENT TK TEST OK")


if __name__ == "__main__":
    main()
