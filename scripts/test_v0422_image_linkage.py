from __future__ import annotations

import pathlib
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
RELEASE = ROOT / "release" / "v0422"

from ai_article_studio.core.image_prompt_builder import build_image_prompt_bundle  # noqa: E402
from ai_article_studio.core.image_settings import normalize_image_settings  # noqa: E402
from ai_article_studio.core.web_ai_state import WebAIStateStore, WebAIWorkflowState  # noqa: E402
from ai_article_studio.core.web_ai_workflow import WebAIWorkflow  # noqa: E402

APP_FIXTURE = '''import tkinter as tk\nfrom tkinter import ttk, messagebox\nBG="#0B1020"\nSURFACE="#111827"\nSURFACE_2="#151C2F"\nTEXT="#F8FAFC"\nSOFT="#CBD5E1"\nMUTED="#64748B"\n# v0.4.0 Phase 3.5 integrated Web AI\nclass App(tk.Tk):\n    def __init__(self):\n        super().__init__()\n        self.vars={}\n        self.web_ai_bridge=None\n    def card(self,*a,**k): return tk.Frame(self)\n    def _section_title(self,*a,**k): pass\n    def _label(self,*a,**k): return tk.Label(self)\n    def _primary_button(self,*a,**k): return tk.Button(self)\n    def _secondary_button(self,*a,**k): return tk.Button(self)\n    def _open_web_ai_site(self,*a,**k): pass\n    # v0.4.2 Phase 3.6 image workflow\n    def show_create(self):\n        body=tk.Frame(self)\n        self.image_settings_card = self.card(body, bg=SURFACE_2)\n        self.image_settings_card.pack(fill="x", pady=(0,12))\n        self.vars["image_enabled"] = tk.BooleanVar(value=False)\n        self.vars["image_target"] = tk.StringVar(value="アイキャッチ＋挿絵")\n        self.vars["image_mode"] = tk.StringVar(value="Web版（おすすめ）")\n        self.vars["image_style"] = tk.StringVar(value="おまかせ")\n        self.vars["image_count"] = tk.StringVar(value="自動")\n        self.vars["image_insert_markers"] = tk.BooleanVar(value=True)\n        ttk.Combobox(self.image_settings_card,textvariable=self.vars["image_style"],values=["おまかせ","ビジネス","テック","やさしい","図解風"])\n        # Basic settings\n    def _collect_image_settings(self):\n        def _value(name, default=""):\n            var=self.vars.get(name); return var.get() if var is not None else default\n        target_map={"アイキャッチ＋挿絵":"both","アイキャッチのみ":"eyecatch","挿絵のみ":"illustrations"}\n        mode_map={"Web版（おすすめ）":"web","API版（準備中）":"api","ローカルGPU（準備中）":"local"}\n        style_map = {"おまかせ":"auto", "ビジネス":"business", "テック":"tech", "やさしい":"gentle", "図解風":"diagram"}\n        return {"enabled":bool(_value("image_enabled",False)),"target":target_map.get(_value("image_target"),"both"),"mode":mode_map.get(_value("image_mode"),"web"),"style":style_map.get(_value("image_style"),"auto"),"illustration_count":"auto","insert_markers":True}\n    def _sync_image_settings(self): return {}\n    def _show_gpu_diagnostic(self): pass\n    def _show_image_prompts(self):\n        self._sync_image_settings()\n        data=self.web_ai_bridge.build_image_prompts()\n        if not data.get("eyecatch_prompt"):\n            messagebox.showinfo("画像プロンプト","画像生成をONにして記事を作成・取り込み後に利用してください。")\n    def _genre_changed(self, _event=None):\n        pass\n    def _open_web_ai_mode(self):\n        req=type("R",(),{"platform":"note"})()\n        win=tk.Toplevel(self)\n        step4=tk.Frame(win,bg=SURFACE)\n        final_text=tk.Text(step4)\n        formatted_text=tk.Text(step4)\n        controls4=tk.Frame(step4,bg=SURFACE); controls4.pack(fill="x",padx=18,pady=(0,14))\n        publish_links=tk.Frame(step4,bg=SURFACE)\n        self._secondary_button(publish_links,"Brain",lambda:None).pack(side="left",padx=4)\n        self._secondary_button(publish_links,"画像プロンプト",self._show_image_prompts).pack(side="left",padx=4)\n'''


def request() -> dict:
    return {
        "platform": "note",
        "article_type": "無料",
        "genre": "AI副業",
        "subgenre": "AIおまかせ",
        "reader_level": "初心者",
        "target_age": "30代",
        "reader_problem": "何から始めればよいか分からない",
    }


def run(*args: str) -> None:
    subprocess.run([sys.executable, *args], check=True)


def test_core() -> None:
    anime = normalize_image_settings({"enabled": True, "style": "anime", "target": "both", "illustration_count": "2"})
    assert anime.style == "anime"
    manga = normalize_image_settings({"enabled": True, "style": "manga"})
    assert manga.style == "manga"
    assert normalize_image_settings({"style": "unknown"}).style == "auto"

    article = """# AI副業入門\n\n導入文です。AIを使った副業の選び方を説明します。\n\n## まず決めること\n自分の使える時間と得意分野を整理します。\n\n## 小さく試す\n無料ツールで試作品を作り、改善します。\n"""
    bundle = build_image_prompt_bundle(request(), "AI副業入門", article, anime)
    assert bundle.article_linked is True
    assert bundle.marker_source == "derived_from_article"
    assert "実際の記事内容" in bundle.eyecatch_prompt
    assert "まず決めること" in bundle.eyecatch_prompt
    assert len(bundle.illustration_prompts) == 2
    assert bundle.illustration_prompts[0]["source"] == "derived_from_article"
    assert "アニメ調" in bundle.illustration_prompts[0]["prompt"]

    with tempfile.TemporaryDirectory() as tmp:
        root = pathlib.Path(tmp)
        store = WebAIStateStore(root / "state.json")
        state = WebAIWorkflowState(
            selected_title="AI副業入門",
            article_request=request(),
            normalized_output=article,
            image_settings=anime.to_dict(),
        )
        store.save(state)
        workflow = WebAIWorkflow(state_store=store)
        payload = workflow.build_image_prompts(state=state)
        assert payload["ready"] is True
        assert payload["article_source"] == "normalized_output"
        assert payload["article_linked"] is True
        assert payload["marker_source"] == "derived_from_article"
        assert payload["style_label"] == "アニメ風"

        off = WebAIWorkflowState(selected_title="AI副業入門", article_request=request(), normalized_output=article)
        store.save(off)
        errors = workflow.validate_image_prompt_requirements(state=off)
        assert any("ON" in e for e in errors)


def test_patch() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        install = pathlib.Path(tmp) / "AIArticleStudio"
        package = pathlib.Path(tmp) / "package"
        app_dir = install / "src" / "ai_article_studio" / "ui"
        core_dir = install / "src" / "ai_article_studio" / "core"
        payload = package / "payload" / "core"
        app_dir.mkdir(parents=True)
        core_dir.mkdir(parents=True)
        payload.mkdir(parents=True)
        (install / "src" / "ai_article_studio" / "__init__.py").write_text('__version__ = "0.4.2.1"\n', encoding="utf-8")
        (app_dir / "app.py").write_text(APP_FIXTURE, encoding="utf-8")
        for name in ("image_settings.py", "image_prompt_builder.py", "web_ai_workflow.py", "web_ai_ui_bridge.py"):
            shutil.copy2(ROOT / "src" / "ai_article_studio" / "core" / name, core_dir / name)
            shutil.copy2(ROOT / "src" / "ai_article_studio" / "core" / name, payload / name)
        for name in ("image_marker_parser.py", "image_assets.py", "gpu_diagnostic.py", "paid_value.py", "web_ai_ingest.py", "web_ai_prompt_builder.py", "web_prompt_engine_v2.py", "web_ai_publish.py", "web_ai_repair.py", "web_ai_state.py"):
            src = ROOT / "src" / "ai_article_studio" / "core" / name
            if src.is_file():
                shutil.copy2(src, core_dir / name)

        run(str(RELEASE / "phase36_v0422_preflight.py"), "--app-root", str(install))
        run(str(RELEASE / "patch_v0422.py"), str(install), str(package))
        run(str(RELEASE / "set_version_v0422.py"), str(install))
        run(str(RELEASE / "validate_v0422.py"), str(install))

        text = (app_dir / "app.py").read_text(encoding="utf-8")
        assert '# v0.4.2.2 linked image controls' in text
        assert 'self.image_settings_card.pack(fill="x", pady=(0,12))' not in text
        assert "記事に合う画像を作る" in text
        assert "アニメ風" in text and "漫画風" in text
        assert "article_text=article_text" in text
        compile(text, "app.py", "exec")

        run(str(RELEASE / "patch_v0422.py"), str(install), str(package))
        text2 = (app_dir / "app.py").read_text(encoding="utf-8")
        assert text2.count('# v0.4.2.2 linked image controls') == 1


def main() -> None:
    test_core()
    test_patch()
    print("V0.4.2.2 ARTICLE-LINKED IMAGE TESTS OK")


if __name__ == "__main__":
    main()
