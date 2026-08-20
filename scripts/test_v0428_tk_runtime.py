from __future__ import annotations

import pathlib
import sys
import tkinter as tk


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from ai_article_studio.ui.guided_wizard_v0428 import install_article_wizard, install_web_ai_wizard  # noqa: E402


class Bridge:
    def __init__(self):
        self.snapshot = {"current_step": "00", "article_id": "runtime-test"}

    def history_items(self, limit=10):
        return []

    def save_editor_draft(self, raw_text="", formatted_text=""):
        self.snapshot["raw_web_output"] = raw_text
        self.snapshot["formatted_output"] = formatted_text
        return dict(self.snapshot)

    def current_snapshot(self):
        return dict(self.snapshot)

    def build_image_prompts(self, article_text=None):
        return {
            "eyecatch_prompt": "アイキャッチ用テストプロンプト",
            "illustration_prompts": [
                {"label": "見出しの後", "position": "見出しの後", "prompt": "挿絵用テストプロンプト"}
            ],
        }

    def clear_article_content(self):
        self.snapshot.update({"raw_web_output": "", "formatted_output": "", "current_step": "03"})
        return dict(self.snapshot)

    def new_article(self):
        self.snapshot = {"current_step": "00", "article_id": "runtime-test-new"}
        return dict(self.snapshot)

    def load_history(self, article_id):
        return dict(self.snapshot)

    def delete_history(self, article_id):
        return True


class RuntimeApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.withdraw()
        self.vars = {}
        self.web_ai_bridge = Bridge()

    def _primary_button(self, parent, text, command):
        return tk.Button(parent, text=text, command=command, bg="#7C3AED", fg="#FFFFFF")

    def _secondary_button(self, parent, text, command):
        return tk.Button(parent, text=text, command=command, bg="#16243C", fg="#FFFFFF")

    def _open_web_ai_mode(self):
        self.web_opened = True

    def _sync_image_settings(self):
        return {}

    def _restore_article_setup(self):
        self.restored = True


def walk(widget):
    yield widget
    for child in widget.winfo_children():
        yield from walk(child)


def find_button(widget, startswith):
    for item in walk(widget):
        if str(item.winfo_class()) in {"Button", "TButton"} and str(item.cget("text") or "").startswith(startswith):
            return item
    raise AssertionError(f"button not found: {startswith}")


def main() -> None:
    try:
        app = RuntimeApp()
    except tk.TclError as exc:
        if sys.platform == "win32" or "--require-display" in sys.argv:
            raise RuntimeError(f"Tk runtime is required but unavailable: {exc}") from exc
        print("V0.4.2.8 TK RUNTIME TEST SKIPPED: display unavailable")
        return

    try:
        legacy_nav = tk.Frame(app, bg="#0B1020")
        legacy_nav.pack(fill="x")
        for text in ("01 基本設定", "02 テーマ", "03 記事設計", "04 作成", "05 完成"):
            tk.Label(legacy_nav, text=text, bg="#0B1020", fg="#FFFFFF").pack(side="left")

        page_shell = tk.Frame(app, bg="#0B1020")
        page_shell.pack(fill="both", expand=True)
        body = tk.Frame(page_shell, bg="#0B1020")
        body.pack(side="left", fill="both", expand=True)
        scrollbar = tk.Scrollbar(page_shell, orient="vertical")
        scrollbar.pack(side="right", fill="y")
        legacy_cards = []
        for title in ("生成方法を選択", "完成記事を作る前の画像計画", "基本設定"):
            card = tk.Frame(body, bg="#151C2F")
            card.pack(fill="x")
            tk.Label(card, text=title, bg="#151C2F", fg="#FFFFFF").pack()
            legacy_cards.append(card)

        install_article_wizard(app, body)
        app.update_idletasks()
        assert app._v0428_visual_wizard_active is True
        assert app._v0428_activation_marker == "v0.4.2.8-direct-visual-wizard"
        assert legacy_nav.winfo_manager() == ""
        assert scrollbar.winfo_manager() == ""
        assert all(card.winfo_manager() == "" for card in legacy_cards)
        wizard = app._v0427_article_wizard
        assert len(wizard["pages"]) == 4
        assert wizard["pages"][0].winfo_manager() == "pack"
        assert all(page.winfo_manager() == "" for page in wizard["pages"][1:])
        find_button(wizard["root"], "次へ").invoke()
        app.update_idletasks()
        assert wizard["pages"][0].winfo_manager() == ""
        assert wizard["pages"][1].winfo_manager() == "pack"

        host = tk.Frame(app, bg="#0B1020")
        host.pack(fill="both", expand=True)
        pages = [tk.Frame(host, bg="#111827") for _index in range(4)]
        for index, page in enumerate(pages):
            tk.Label(page, text=f"Web step {index + 1}", bg="#111827", fg="#FFFFFF").pack()
            page.pack(fill="both", expand=True)
        fields = {
            "paste_titles": tk.Text(pages[1], height=2),
            "selected_title": tk.StringVar(app, value="テスト記事"),
            "final_text": tk.Text(pages[2], height=4),
            "formatted_text": tk.Text(pages[3], height=4),
        }
        fields["final_text"].insert("1.0", "# テスト記事\n\n## 見出し\n本文")
        fields["formatted_text"].insert("1.0", "# テスト記事\n\n## 見出し\n本文")
        install_web_ai_wizard(app, host, object(), pages, fields)
        app.update_idletasks()
        assert app._v0428_web_wizard_active is True
        web = app._v0427_web_wizard
        assert web["pages"][0].winfo_manager() == "pack"
        web["show_page"](3)
        app.update_idletasks()
        assert web["pages"][3].winfo_manager() == "pack"
        assert app._v0427_image_result_panel.winfo_manager() == "pack"
    finally:
        app.destroy()
    print("V0.4.2.8 REAL TK RUNTIME TEST OK")


if __name__ == "__main__":
    main()
