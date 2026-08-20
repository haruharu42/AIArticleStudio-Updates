from __future__ import annotations

import pathlib
import sys
import tkinter as tk


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "scripts"))

from ai_article_studio.ui.guided_wizard_v0427 import install_article_wizard  # noqa: E402
from ai_article_studio.ui.guided_wizard_v0428 import install_web_ai_wizard  # noqa: E402
from test_v0428_tk_runtime import RuntimeApp as BaseRuntimeApp, find_button  # noqa: E402


class CreationFlowApp(BaseRuntimeApp):
    def _open_web_ai_mode(self):
        self.official_web_action_called = True
        body = self._article_create_body
        for child in body.winfo_children():
            if child.winfo_manager() == "pack":
                child.pack_forget()
        host = tk.Frame(body, bg="#07101F")
        host.pack(fill="both", expand=True)
        pages = [tk.Frame(host, bg="#111827") for _index in range(4)]
        for index, page in enumerate(pages):
            tk.Label(page, text=f"Web step {index + 1}", bg="#111827", fg="#FFFFFF").pack()
            page.pack(fill="both", expand=True)
        fields = {
            "paste_titles": tk.Text(pages[1], height=2),
            "selected_title": tk.StringVar(self, value="テスト記事"),
            "final_text": tk.Text(pages[2], height=4),
            "formatted_text": tk.Text(pages[3], height=4),
        }
        install_web_ai_wizard(self, host, object(), pages, fields)


def main() -> None:
    try:
        app = CreationFlowApp()
    except tk.TclError as exc:
        if sys.platform == "win32" or "--require-display" in sys.argv:
            raise RuntimeError(f"Tk runtime is required but unavailable: {exc}") from exc
        print("V0.4.3.0 STEP FIVE TK TEST SKIPPED: display unavailable")
        return
    try:
        body = tk.Frame(app, bg="#07101F")
        body.pack(fill="both", expand=True)
        legacy = tk.Frame(body, bg="#111E34")
        legacy.pack(fill="x")
        original_button = tk.Button(legacy, text="Web版AIで作成", command=app._open_web_ai_mode)
        original_button.pack()

        install_article_wizard(app, body)
        app.update_idletasks()
        wizard = app._v0427_article_wizard
        assert app._v0430_theme_auto.get() is True
        assert app.vars["theme"].get() == "AIおまかせ"
        assert str(app._v0430_theme_editor.cget("state")) == "disabled"

        wizard["show_page"](3)
        app.update_idletasks()
        create_button = find_button(wizard["root"], "作成へ")
        create_button.invoke()
        app.update_idletasks()
        app.update()

        assert app._v0430_creation_action == "Web版AIで作成"
        assert app.official_web_action_called is True
        assert app._v0428_web_wizard_active is True
        web = app._v0427_web_wizard
        assert web["pages"][0].winfo_manager() == "pack"
        assert wizard["root"].winfo_manager() == ""
    finally:
        app.destroy()
    print("V0.4.3.0 REAL STEP FOUR TO FIVE TK TEST OK")


if __name__ == "__main__":
    main()
