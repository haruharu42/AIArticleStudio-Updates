from __future__ import annotations
import re, shutil, sys
from pathlib import Path

VERSION='0.4.0'
MARKER='# v0.4.0 Phase 3.5 integrated Web AI'

CORE_IMPORTS='''from ..core.web_ai_config import load_web_ai_model_config\nfrom ..core.web_ai_ui_bridge import WebAIUIBridge\nfrom ..core.web_ai_prompt_builder import WebAIContext\nfrom ..core.web_ai_repair import build_issue_repair_prompt, build_repair_issues\nfrom ..core.web_ai_ingest import ingest_web_ai_output\n'''

INIT_INSERT='''        # v0.4.0 Phase 3.5 integrated Web AI\n        _data_base = Path(os.getenv("LOCALAPPDATA") or str(Path.home())) / "AIArticleStudio" / "data"\n        self.web_ai_model_config = load_web_ai_model_config(_data_base)\n        self.web_ai_bridge = WebAIUIBridge()\n'''

SERVICE_METHODS=r'''    def _web_ai_service_changed(self, _event=None):
        service = self.vars.get("web_ai_service").get() if self.vars.get("web_ai_service") else "ChatGPT"
        if hasattr(self, "web_ai_open_btn"):
            enabled = bool(self.web_ai_model_config.launch_url(service) or WEB_AI_URLS.get(service))
            self.web_ai_open_btn.configure(text=(f"{service}を開く" if enabled else "Web AIを選択してください"), state=("normal" if enabled else "disabled"))
        if not hasattr(self, "web_ai_model_cb"):
            return
        if service in {"ChatGPT", "Claude", "Gemini"}:
            models = self.web_ai_model_config.labels(service)
            self.web_ai_model_cb.configure(values=models, state="readonly")
            quality = self.vars.get("web_ai_quality").get() if self.vars.get("web_ai_quality") else "標準"
            self.vars["web_ai_model"].set(self.web_ai_model_config.default_label(service, quality))
            if hasattr(self, "web_ai_model_note"):
                source = getattr(self.web_ai_model_config, "source", "fallback")
                self.web_ai_model_note.configure(text=f"モデル一覧は外部設定と24時間キャッシュで更新します（{source}）。")
        else:
            self.web_ai_model_cb.configure(values=(), state="normal")
            self.vars["web_ai_model"].set("")
            if hasattr(self, "web_ai_model_note"):
                self.web_ai_model_note.configure(text="その他のWeb AIではモデル名を自由入力できます。")

    def _web_ai_quality_changed(self, _event=None):
        service = self.vars.get("web_ai_service").get() if self.vars.get("web_ai_service") else "ChatGPT"
        quality = self.vars.get("web_ai_quality").get() if self.vars.get("web_ai_quality") else "標準"
        if service in {"ChatGPT", "Claude", "Gemini"} and self.vars.get("web_ai_model"):
            self.vars["web_ai_model"].set(self.web_ai_model_config.default_label(service, quality))

    def _web_ai_model_changed(self, _event=None):
        service = self.vars.get("web_ai_service").get() if self.vars.get("web_ai_service") else "ChatGPT"
        model = self.vars.get("web_ai_model").get() if self.vars.get("web_ai_model") else ""
        quality = self.web_ai_model_config.quality_for_label(service, model)
        if quality and self.vars.get("web_ai_quality"):
            self.vars["web_ai_quality"].set(quality)

    def _open_web_ai_site(self, service: str):
        url = self.web_ai_model_config.launch_url(service) or WEB_AI_URLS.get(service)
        if not url:
            messagebox.showinfo("Web版AI", "ChatGPT / Claude / Gemini から選択してください。")
            return
        try:
            webbrowser.open_new_tab(url)
        except Exception as e:
            messagebox.showerror("Web版AI", f"ブラウザを開けませんでした。\n{e}")

    def _open_selected_web_ai(self):
        service = self.vars.get("web_ai_service").get() if self.vars.get("web_ai_service") else "ChatGPT"
        self._open_web_ai_site(service)

    def _open_publish_platform(self, platform: str):
        url = PUBLISH_PLATFORM_URLS.get(platform)
        if not url:
            messagebox.showinfo("掲載先", "note / Tips / Brain から選択してください。")
            return
        try:
            webbrowser.open_new_tab(url)
        except Exception as e:
            messagebox.showerror("掲載先", f"ブラウザを開けませんでした。\n{e}")

    def _genre_changed(self, _event=None):
'''

def replace_once(text, pattern, replacement, label, flags=0):
    new,n=re.subn(pattern, lambda m: replacement, text, count=1, flags=flags)
    if n!=1: raise RuntimeError(f'{label}: expected 1 match, got {n}')
    return new

def main():
    if len(sys.argv)!=3:
        raise SystemExit('usage: patch_v040.py <install-root> <package-root>')
    install=Path(sys.argv[1]); package=Path(sys.argv[2])
    app=install/'src/ai_article_studio/ui/app.py'; init=install/'src/ai_article_studio/__init__.py'
    core_dst=install/'src/ai_article_studio/core'; core_src=package/'payload/core'
    if not app.is_file() or not init.is_file(): raise RuntimeError('AIArticleStudio source files not found')
    if not core_src.is_dir(): raise RuntimeError('Phase 3.5 payload/core not found')
    core_dst.mkdir(parents=True,exist_ok=True)
    for src in core_src.glob('*.py'):
        shutil.copy2(src, core_dst/src.name)

    text=app.read_text(encoding='utf-8')
    if MARKER in text:
        init.write_text('__version__ = "0.4.0"\n',encoding='utf-8',newline='\n'); print('v0.4.0 already applied'); return
    if 'import os\n' not in text:
        text=text.replace('import threading\n','import threading\nimport os\n',1)
    anchor='from ..core.router import ROLE_THEME, ROLE_RESEARCH_PLAN, ROLE_WRITER, ROLE_AUDIT\n'
    if CORE_IMPORTS.splitlines()[0] not in text:
        if anchor not in text: raise RuntimeError('core import anchor not found')
        text=text.replace(anchor,anchor+CORE_IMPORTS,1)
    init_anchor='        self._route_open = False\n'
    if init_anchor not in text: raise RuntimeError('App init anchor not found')
    text=text.replace(init_anchor, init_anchor+INIT_INSERT,1)

    text=text.replace('self.vars["web_ai_model"] = tk.StringVar(value="GPT-5.6 Sol（Medium）")', 'self.vars["web_ai_model"] = tk.StringVar(value=self.web_ai_model_config.default_label("ChatGPT", "標準"))',1)
    text=re.sub(r'values=(?:WEB_AI_MODEL_OPTIONS\["ChatGPT"\]|web_ai_models_for\("ChatGPT"\))', 'values=self.web_ai_model_config.labels("ChatGPT")', text, count=1)
    text=re.sub(r'self\.web_ai_model_note = self\._label\(webgrid,.*?\)\n        self\.web_ai_model_note\.grid\(row=2,column=1,columnspan=3,sticky="w",pady=\(0,4\)\)',
                'self.web_ai_model_note = self._label(webgrid,f"モデル一覧は外部設定と24時間キャッシュで更新します（{self.web_ai_model_config.source}）。",size=8,fg=MUTED,bg=SURFACE_2)\n        self.web_ai_model_note.grid(row=2,column=1,columnspan=3,sticky="w",pady=(0,4))',text,count=1,flags=re.S)
    text=replace_once(text,r'    def _web_ai_service_changed\(self, _event=None\):\n.*?    def _genre_changed\(self, _event=None\):\n',SERVICE_METHODS,'web ai helper methods',flags=re.S)

    old='        title_prompt_text = title_prompt(req.__dict__)\n'
    new='''        _provider = getattr(req, "web_ai_service", "ChatGPT")\n        _quality = getattr(req, "web_ai_quality", "標準")\n        _model = getattr(req, "web_ai_model", "")\n        _title_step = self.web_ai_bridge.build_title_step(req.__dict__, provider=_provider, quality=_quality, model_label=_model)\n        title_prompt_text = _title_step["prompt"]\n'''
    if old not in text: raise RuntimeError('title prompt anchor not found')
    text=text.replace(old,new,1)

    old='            article_prompt_text["value"] = article_prompt(req.__dict__, title)\n'
    new='''            _article_step = self.web_ai_bridge.build_article_step(\n                req.__dict__, title, provider=_provider, quality=_quality, model_label=_model,\n                title_candidates=parse_title_candidates(paste_titles.get("1.0","end")),\n                title_response_raw=paste_titles.get("1.0","end"),\n            )\n            article_prompt_text["value"] = _article_step["prompt"]\n'''
    if old not in text: raise RuntimeError('article prompt anchor not found')
    text=text.replace(old,new,1)

    top_anchor='        self._label(top, f"使用AI: {getattr(req, \'web_ai_service\', \'Web版AI\')} / 品質: {getattr(req, \'web_ai_quality\', \'標準\')}　｜　新しい記事は『1記事につき1チャット』推奨", size=8, fg="#C4B5FD", bg=BG).pack(anchor="w", pady=(5,0))\n'
    resume='''        _resume = self.web_ai_bridge.resume_card()\n        if _resume.get("visible"):\n            self._label(top, "続きから：" + _resume.get("label", ""), size=8, fg="#86EFAC", bg=BG).pack(anchor="w", pady=(5,0))\n'''
    if top_anchor in text: text=text.replace(top_anchor,top_anchor+resume,1)

    pattern=r'        def local_format\(\):\n.*?\n        web_saved_record=\{"value":None\}\n'
    replacement=r'''        def local_format():
            source=final_text.get("1.0","end").strip()
            if not source:
                messagebox.showwarning("掲載用整形", "先にWeb版AIで生成した記事を貼り付けてください。")
                return
            ingest = self.web_ai_bridge.ingest_step(source, expect_paid=(req.article_type == "有料"))
            blocking = [x for x in ingest["issues"] if x.get("severity") == "blocking"]
            if blocking:
                messagebox.showerror("記事を確認してください", blocking[0].get("title", "記事を読み込めませんでした。"))
                return
            notices = [x.get("title", "") for x in ingest["issues"] if x.get("severity") in {"warning", "info"}]
            if notices:
                messagebox.showwarning("AI記事チェック", "不足している可能性があります。\n\n" + "\n".join("・" + x for x in notices[:6]) + "\n\n必要なら下の『修正用プロンプト』から不足部分だけ直せます。")
            result=format_for_publish(ingest["normalized_output"], req.platform, req.article_type)
            formatted_text.configure(state="normal")
            formatted_text.delete("1.0","end")
            formatted_text.insert("1.0",result.formatted)
            self.web_ai_bridge.publish_step(result.formatted, platform=req.platform)
            summary=" / ".join(result.changes) if result.changes else "変更不要（すでに整っています）"
            format_status.configure(text=f"API未使用｜整形完了：{summary}",fg="#86EFAC")

        web_saved_record={"value":None}
'''
    text=replace_once(text,pattern,replacement,'local_format',flags=re.S)

    controls_anchor='        controls4=tk.Frame(step4,bg=SURFACE); controls4.pack(fill="x",padx=18,pady=(0,14))\n'
    repair_fn=r'''        def copy_repair_prompt():
            source=final_text.get("1.0","end").strip()
            if not source:
                messagebox.showwarning("修正用プロンプト", "先に完成記事を貼り付けてください。")
                return
            result = ingest_web_ai_output(source, expect_paid=(req.article_type == "有料"))
            issues = build_repair_issues(result)
            issue = next((x for x in issues if x.repair_type), None)
            if not issue:
                messagebox.showinfo("修正用プロンプト", "大きな不足は見つかりませんでした。")
                return
            ctx = WebAIContext(provider=_provider, quality=_quality, model_label=_model)
            prompt = build_issue_repair_prompt(issue, result, req.__dict__, ctx)
            copy_string(prompt, "修正用プロンプト")

'''
    if controls_anchor not in text: raise RuntimeError('controls4 anchor not found')
    text=text.replace(controls_anchor,repair_fn+controls_anchor,1)
    button_anchor='        self._secondary_button(controls4,"元＋掲載用を保存",save_markdown).pack(side="left")\n'
    text=text.replace(button_anchor,button_anchor+'        self._secondary_button(controls4,"修正用プロンプト",copy_repair_prompt).pack(side="left",padx=8)\n',1)

    publish_anchor='        self._secondary_button(publish_links,"Brain",lambda:self._open_publish_platform("Brain")).pack(side="left",padx=4)\n'
    completion='''        def finish_web_article():\n            text_now=current_publish_text()\n            ready=self.web_ai_bridge.publish_step(text_now, platform=req.platform) if text_now else {"can_publish":False}\n            if not ready.get("can_publish"):\n                messagebox.showwarning("作成完了", "記事を掲載用に整えてから完了してください。")\n                return\n            self.web_ai_bridge.mark_completed()\n            messagebox.showinfo("作成完了", "記事作成を完了しました。掲載先で最終確認して公開してください。")\n        self._primary_button(publish_links,"✓ 作成完了",finish_web_article).pack(side="right")\n'''
    if publish_anchor not in text: raise RuntimeError('publish links anchor not found')
    text=text.replace(publish_anchor,publish_anchor+completion,1)

    resume_prefill='''        _snap = self.web_ai_bridge.current_snapshot()\n        if _resume.get("visible"):\n            if _snap.get("selected_title"):\n                selected_title.set(_snap.get("selected_title", ""))\n                prompt_status.configure(text=f"再開：{selected_title.get()}", fg="#86EFAC")\n            if _snap.get("raw_web_output"):\n                final_text.delete("1.0","end"); final_text.insert("1.0", _snap.get("raw_web_output", ""))\n            if _snap.get("formatted_output"):\n                formatted_text.configure(state="normal"); formatted_text.delete("1.0","end"); formatted_text.insert("1.0", _snap.get("formatted_output", ""))\n'''
    text=text.replace(completion,completion+resume_prefill,1)

    class_anchor='\n\nclass App(tk.Tk):'
    if class_anchor not in text: raise RuntimeError('class App anchor not found')
    text=text.replace(class_anchor,'\n\n'+MARKER+class_anchor,1)
    app.write_text(text,encoding='utf-8',newline='\n')
    init.write_text('__version__ = "0.4.0"\n',encoding='utf-8',newline='\n')
    print('v0.4.0 patch applied')

if __name__=='__main__': main()
