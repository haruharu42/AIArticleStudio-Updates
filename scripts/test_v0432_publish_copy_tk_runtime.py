from __future__ import annotations

import pathlib
import sys
import tkinter as tk


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from ai_article_studio.ui.guided_wizard_v0432 import activate_live_article_wizard  # noqa: E402
from ai_article_studio.core.article_publish_text import build_article_text_variants  # noqa: E402


class Bridge:
    def __init__(self):
        self.snapshot = {"current_step": "00", "article_id": "v0432-runtime"}

    def history_items(self, limit=10):
        return []

    def build_title_step(self, request, provider, quality, model_label):
        self.snapshot.update({"current_step": "02", "article_request": dict(request), "title_prompt": "TITLE PROMPT"})
        return {"step": "02", "prompt": "TITLE PROMPT"}

    def build_article_step(self, request, selected_title, provider, quality, model_label, title_candidates, title_response_raw):
        self.snapshot.update({
            "current_step": "03", "article_request": dict(request), "selected_title": selected_title,
            "title_candidates": list(title_candidates), "title_response_raw": title_response_raw,
            "final_prompt": "ARTICLE PROMPT",
        })
        return {"step": "03", "selected_title": selected_title, "prompt": "ARTICLE PROMPT"}

    def ingest_step(self, raw_text, expect_paid):
        self.snapshot.update({"current_step": "04", "raw_web_output": raw_text, "normalized_output": raw_text})
        return {"step": "04", "normalized_output": raw_text, "issues": [], "can_continue": True}

    def publish_step(self, publish_text, platform):
        variants = build_article_text_variants(publish_text)
        self.snapshot.update({"current_step": "04", "formatted_output": variants.publish_text, "publish_platform": platform})
        return {"step": "04", "can_publish": True, **variants.to_dict()}

    def build_image_prompts(self, article_text=None):
        return {"eyecatch_prompt": "EYECATCH PROMPT", "illustration_prompts": [{"position": "見出しの後", "prompt": "ILLUSTRATION PROMPT"}]}

    def current_snapshot(self):
        return dict(self.snapshot)

    def mark_completed(self):
        self.snapshot["current_step"] = "05"
        return {"step": "05", "is_completed": True}

    def new_article(self):
        self.snapshot = {"current_step": "00", "article_id": "v0432-new"}
        return dict(self.snapshot)

    def clear_article_content(self):
        self.snapshot.update({"raw_web_output": "", "normalized_output": "", "formatted_output": ""})
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

    def _sync_image_settings(self):
        return {}

    def _update_image_plan_controls(self):
        return {}


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
        print("V0.4.3.2 EMBEDDED FLOW TK TEST SKIPPED: display unavailable")
        return
    try:
        body = tk.Frame(app, bg="#07101F")
        body.pack(fill="both", expand=True)
        for title in ("生成方法を選択", "完成記事を作る前の画像計画", "基本設定"):
            card = tk.Frame(body, bg="#111E34")
            card.pack(fill="x")
            tk.Label(card, text=title, bg="#111E34", fg="#FFFFFF").pack()
        wizard = activate_live_article_wizard(app)
        app.update_idletasks()
        assert wizard is not None
        assert app._v0432_embedded_active is True
        assert len(wizard["pages"]) == 6
        assert wizard["root"].winfo_manager() == "pack"

        wizard["show_page"](3)
        find_button(wizard["root"], "作成へ").invoke()
        app.update_idletasks()
        assert wizard["state"]["index"] == 4
        assert wizard["state"]["phase"] == 0
        assert wizard["pages"][4].winfo_manager() == "pack"
        assert wizard["root"].winfo_manager() == "pack"
        assert wizard["state"]["title_prompt"] == "TITLE PROMPT"

        title_response = wizard["fields"]["title_response"]
        title_response.insert("1.0", "1. テスト記事タイトル候補その一\n2. テスト記事タイトル候補その二")
        find_button(wizard["root"], "候補を確認").invoke()
        app.update_idletasks()
        assert wizard["state"]["phase"] == 1
        assert len(wizard["state"]["candidates"]) == 2

        find_button(wizard["root"], "記事プロンプトへ").invoke()
        app.update_idletasks()
        assert wizard["state"]["phase"] == 2
        assert wizard["state"]["article_prompt"] == "ARTICLE PROMPT"

        article_response = wizard["fields"]["article_response"]
        article_response.insert("1.0", "# テスト記事\n\n## 見出し\n\n| 項目 | 内容 |\n| --- | --- |\n| 目的 | 確認 |\n\n[挿絵1｜表の後｜判断の流れ]\n\n## 【挿絵一覧】\n- 挿絵1")
        find_button(wizard["root"], "記事を確認").invoke()
        app.update_idletasks()
        assert wizard["state"]["index"] == 5
        assert wizard["pages"][5].winfo_manager() == "pack"
        assert "# テスト記事" in wizard["state"]["article"]
        assert "| 項目 | 内容 |" in wizard["state"]["article"]
        assert "[挿絵1｜" not in wizard["state"]["article"]
        assert "[挿絵1｜" in wizard["state"]["insertion_article"]
        assert "挿絵一覧" not in wizard["state"]["insertion_article"]
        find_button(wizard["root"], "掲載用をコピー")
        find_button(wizard["root"], "画像差し込み用")
        find_button(wizard["root"], "元記事")
        assert app.web_ai_bridge.snapshot["current_step"] == "05"
        assert all(str(item.winfo_class()) != "Toplevel" for item in app.winfo_children())
    finally:
        app.destroy()
    print("V0.4.3.2 REAL EMBEDDED SIX-STEP TK TEST OK")


if __name__ == "__main__":
    main()
