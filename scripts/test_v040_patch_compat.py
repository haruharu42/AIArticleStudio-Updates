from __future__ import annotations

import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
PATCH = ROOT / "release" / "v040" / "patch_v040.py"

HEADER = '''from __future__ import annotations
import threading
import webbrowser
from pathlib import Path
import tkinter as tk
from tkinter import ttk, messagebox, filedialog
from ..core.router import ROLE_THEME, ROLE_RESEARCH_PLAN, ROLE_WRITER, ROLE_AUDIT

BG = "#000"
SURFACE = "#111"
SURFACE_2 = "#222"
SURFACE_3 = "#333"
SOFT = "#ddd"
MUTED = "#999"
TEXT = "#fff"
WHITE_CANVAS = "#fff"
DARK_TEXT = "#111"
ACCENT = "#70f"
FONT = "Arial"
WEB_AI_URLS = {"ChatGPT":"https://chatgpt.com/","Claude":"https://claude.ai/","Gemini":"https://gemini.google.com/"}
'''

V037_SETTINGS = '''        self.web_settings_card = self.card(body, bg=SURFACE_2)
        webgrid = tk.Frame(self.web_settings_card, bg=SURFACE_2)
        self.vars["web_ai_service"] = tk.StringVar(value="ChatGPT")
        self.vars["web_ai_quality"] = tk.StringVar(value="標準")
        self.vars["web_ai_model"] = tk.StringVar(value="GPT-5.6 Sol")
        self.web_ai_cb = ttk.Combobox(webgrid,textvariable=self.vars["web_ai_service"],values=["ChatGPT","Claude","Gemini","その他"],state="readonly")
        self.web_ai_cb.bind("<<ComboboxSelected>>", self._web_ai_service_changed)
        ttk.Entry(webgrid,textvariable=self.vars["web_ai_model"]).grid()
        # Basic settings
'''

V039_SETTINGS = '''        self.web_settings_card = self.card(body, bg=SURFACE_2)
        webgrid = tk.Frame(self.web_settings_card, bg=SURFACE_2)
        self.vars["web_ai_service"] = tk.StringVar(value="ChatGPT")
        self.vars["web_ai_quality"] = tk.StringVar(value="標準")
        self.vars["web_ai_model"] = tk.StringVar(value="GPT-5.6 Sol（Medium）")
        self.web_ai_cb = ttk.Combobox(webgrid,textvariable=self.vars["web_ai_service"],values=["ChatGPT","Claude","Gemini","その他"],state="readonly")
        self.web_ai_model_cb = ttk.Combobox(webgrid,textvariable=self.vars["web_ai_model"],values=[])
        # Basic settings
'''

HELPERS = '''    def _web_ai_service_changed(self, _event=None):
        service = self.vars.get("web_ai_service").get()

    def _open_web_ai_site(self, service: str):
        pass

    def _open_selected_web_ai(self):
        pass

    def _genre_changed(self, _event=None):
        pass
'''

WEB_MODE_BASE = '''    def _open_web_ai_mode(self):
        req = self.req
        win = tk.Toplevel(self)
        win.configure(bg=BG)
        top = tk.Frame(win, bg=BG)
        self._label(top, f"使用AI: {getattr(req, 'web_ai_service', 'Web版AI')} / 品質: {getattr(req, 'web_ai_quality', '標準')}　｜　新しい記事は『1記事につき1チャット』推奨", size=8, fg="#C4B5FD", bg=BG).pack(anchor="w", pady=(5,0))
        title_prompt_text = title_prompt(req.__dict__)
        paste_titles = tk.Text(win)
        article_prompt_text={"value":""}
        def choose_candidate(title: str):
            article_prompt_text["value"] = article_prompt(req.__dict__, title)
        final_text=tk.Text(win)
        formatted_text=tk.Text(win)
        format_status=tk.Label(win)
        selected_title=tk.StringVar(value="")
        def current_publish_text():
            return final_text.get("1.0","end").strip()
        def copy_string(text: str, label="コピー完了"):
            pass
        def local_format():
            source=final_text.get("1.0","end").strip()
            result=format_for_publish(source, req.platform, req.article_type)
            formatted_text.configure(state="normal")
            formatted_text.delete("1.0","end")
            formatted_text.insert("1.0",result.formatted)
            summary="done"
            format_status.configure(text=summary)

        web_saved_record={"value":None}
        def save_markdown():
            pass
        step4=tk.Frame(win)
        controls4=tk.Frame(step4,bg=SURFACE); controls4.pack(fill="x",padx=18,pady=(0,14))
        self._secondary_button(controls4,"元＋掲載用を保存",save_markdown).pack(side="left")
'''

PUBLISH_039 = '''        publish_links=tk.Frame(step4,bg=SURFACE)
        publish_links.pack(fill="x",padx=18,pady=(0,14))
        self._secondary_button(publish_links,"note",lambda:self._open_publish_platform("note")).pack(side="left")
        self._secondary_button(publish_links,"Tips",lambda:self._open_publish_platform("Tips")).pack(side="left")
        self._secondary_button(publish_links,"Brain",lambda:self._open_publish_platform("Brain")).pack(side="left",padx=4)
'''

CLASS_PREFIX = '''
class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.vars = {}
        self._route_open = False
        self.req = type("R", (), {"platform":"note","article_type":"有料","web_ai_service":"ChatGPT","web_ai_quality":"標準","web_ai_model":"GPT"})()

    def card(self, *a, **k):
        return tk.Frame(self)
    def _section_title(self, *a, **k):
        pass
    def _label(self, *a, **k):
        return tk.Label(self)
    def _primary_button(self, *a, **k):
        return tk.Button(self)
    def _secondary_button(self, *a, **k):
        return tk.Button(self)

    def show_create(self):
        body = tk.Frame(self)
'''


def fixture(version: str) -> str:
    settings = V037_SETTINGS if version == "0.3.7" else V039_SETTINGS
    publish_constant = "" if version == "0.3.7" else '\nPUBLISH_PLATFORM_URLS = {"note":"https://note.com/","Tips":"https://tips.jp/","Brain":"https://brain-market.com/"}\n'
    publish = "" if version == "0.3.7" else PUBLISH_039
    return HEADER + publish_constant + CLASS_PREFIX + settings + "\n" + HELPERS + "\n" + WEB_MODE_BASE + publish


def run_case(version: str) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = pathlib.Path(tmp) / "AIArticleStudio"
        app = root / "src" / "ai_article_studio" / "ui" / "app.py"
        init = root / "src" / "ai_article_studio" / "__init__.py"
        core = root / "src" / "ai_article_studio" / "core"
        package = pathlib.Path(tmp) / "package"
        payload = package / "payload" / "core"
        app.parent.mkdir(parents=True)
        core.mkdir(parents=True)
        payload.mkdir(parents=True)
        app.write_text(fixture(version), encoding="utf-8")
        init.write_text(f'__version__ = "{version}"\n', encoding="utf-8")
        for name in ["paid_value.py","web_ai_config.py","web_ai_ingest.py","web_ai_prompt_builder.py","web_ai_publish.py","web_ai_repair.py","web_ai_state.py","web_ai_ui_bridge.py","web_ai_workflow.py"]:
            (payload / name).write_text("# fixture payload\n", encoding="utf-8")
        subprocess.run([sys.executable, str(PATCH), str(root), str(package)], check=True)
        subprocess.run([sys.executable, "-m", "py_compile", str(app)], check=True)
        text = app.read_text(encoding="utf-8")
        assert text.count("# v0.4.0 Phase 3.5 integrated Web AI") == 2
        assert text.count("publish_links=tk.Frame(step4,bg=SURFACE)") == 1
        assert text.count("✓ 作成完了") == 1
        assert "self.web_ai_model_cb = ttk.Combobox" in text
        assert "PUBLISH_PLATFORM_URLS = {" in text
        subprocess.run([sys.executable, str(PATCH), str(root), str(package)], check=True)
        assert app.read_text(encoding="utf-8").count("✓ 作成完了") == 1


def main() -> None:
    run_case("0.3.7")
    run_case("0.3.9")
    print("V0.4.0 PATCH COMPAT TESTS OK")


if __name__ == "__main__":
    main()
