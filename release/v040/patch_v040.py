from __future__ import annotations
import re, shutil, sys
from pathlib import Path

VERSION='0.4.0'
MARKER='# v0.4.0 Phase 3.5 integrated Web AI'

CORE_IMPORTS='''from ..core.web_ai_config import load_web_ai_model_config\nfrom ..core.web_ai_ui_bridge import WebAIUIBridge\nfrom ..core.web_ai_prompt_builder import WebAIContext\nfrom ..core.web_ai_repair import build_issue_repair_prompt, build_repair_issues\nfrom ..core.web_ai_ingest import ingest_web_ai_output\n'''

INIT_INSERT='''        # v0.4.0 Phase 3.5 integrated Web AI\n        _data_base = Path(os.getenv("LOCALAPPDATA") or str(Path.home())) / "AIArticleStudio" / "data"\n        self.web_ai_model_config = load_web_ai_model_config(_data_base)\n        self.web_ai_bridge = WebAIUIBridge()\n'''

PUBLISH_CONSTANTS='''PUBLISH_PLATFORM_URLS = {\n    "note": "https://note.com/",\n    "Tips": "https://tips.jp/",\n    "Brain": "https://brain-market.com/",\n}\n'''

WEB_SETTINGS=r'''        self.web_settings_card = self.card(body, bg=SURFACE_2)
        self._section_title(self.web_settings_card, "WEB", "Web版AIの設定", "使用するAI・生成品質・モデルを連動して選べます")
        webgrid = tk.Frame(self.web_settings_card, bg=SURFACE_2)
        webgrid.pack(fill="x", padx=20, pady=(0,12)); webgrid.grid_columnconfigure(1,weight=1); webgrid.grid_columnconfigure(3,weight=1)
        self.vars["web_ai_service"] = tk.StringVar(value="ChatGPT")
        self.vars["web_ai_quality"] = tk.StringVar(value="標準")
        self.vars["web_ai_model"] = tk.StringVar(value=self.web_ai_model_config.default_label("ChatGPT", "標準"))
        self._label(webgrid,"使用するWeb AI",size=9,fg=SOFT,bg=SURFACE_2).grid(row=0,column=0,sticky="w",padx=(0,8),pady=6)
        self.web_ai_cb = ttk.Combobox(webgrid,textvariable=self.vars["web_ai_service"],values=["ChatGPT","Claude","Gemini","その他"],state="readonly",style="Dark.TCombobox")
        self.web_ai_cb.grid(row=0,column=1,sticky="ew",padx=(0,16),pady=6)
        self.web_ai_cb.bind("<<ComboboxSelected>>", self._web_ai_service_changed)
        self._label(webgrid,"生成品質",size=9,fg=SOFT,bg=SURFACE_2).grid(row=0,column=2,sticky="w",padx=(0,8),pady=6)
        self.web_ai_quality_cb = ttk.Combobox(webgrid,textvariable=self.vars["web_ai_quality"],values=["速さ優先","標準","高品質"],state="readonly",style="Dark.TCombobox")
        self.web_ai_quality_cb.grid(row=0,column=3,sticky="ew",pady=6)
        self.web_ai_quality_cb.bind("<<ComboboxSelected>>", self._web_ai_quality_changed)
        self._label(webgrid,"モデル / 推論モード",size=9,fg=SOFT,bg=SURFACE_2).grid(row=1,column=0,sticky="w",padx=(0,8),pady=6)
        self.web_ai_model_cb = ttk.Combobox(webgrid,textvariable=self.vars["web_ai_model"],values=self.web_ai_model_config.labels("ChatGPT"),state="readonly",style="Dark.TCombobox")
        self.web_ai_model_cb.grid(row=1,column=1,columnspan=3,sticky="ew",pady=6)
        self.web_ai_model_cb.bind("<<ComboboxSelected>>", self._web_ai_model_changed)
        self.web_ai_model_note = self._label(webgrid,f"モデル一覧は外部設定と24時間キャッシュで更新します（{self.web_ai_model_config.source}）。",size=8,fg=MUTED,bg=SURFACE_2)
        self.web_ai_model_note.grid(row=2,column=1,columnspan=3,sticky="w",pady=(0,4))
        guide=tk.Frame(self.web_settings_card,bg="#131B31",highlightthickness=1,highlightbackground="#2E315C")
        guide.pack(fill="x",padx=20,pady=(0,16))
        self._label(guide,"💡 チャットの使い方",size=9,bold=True,fg="#C4B5FD",bg="#131B31").pack(anchor="w",padx=12,pady=(10,4))
        self._label(guide,"新しい記事は『1記事につき1チャット』がおすすめです。同じ記事の修正・特典追加は同じチャットでもOKです。完成記事用プロンプトは自己完結型なので、新しいチャットに貼っても使えます。",size=8,fg=SOFT,bg="#131B31",wraplength=760,justify="left").pack(anchor="w",padx=12,pady=(0,8))
        openrow = tk.Frame(guide, bg="#131B31")
        openrow.pack(fill="x", padx=12, pady=(0,10))
        self.web_ai_open_btn = self._primary_button(openrow,"ChatGPTを開く",self._open_selected_web_ai)
        self.web_ai_open_btn.pack(side="left")
        self._secondary_button(openrow,"ChatGPT",lambda:self._open_web_ai_site("ChatGPT")).pack(side="left",padx=(8,4))
        self._secondary_button(openrow,"Claude",lambda:self._open_web_ai_site("Claude")).pack(side="left",padx=4)
        self._secondary_button(openrow,"Gemini",lambda:self._open_web_ai_site("Gemini")).pack(side="left",padx=4)
        self._label(guide,"※ 外部ブラウザで公式Web版を開きます。ログインや送信操作はアプリから自動操作しません。",size=8,fg=MUTED,bg="#131B31").pack(anchor="w",padx=12,pady=(0,10))

        # Basic settings
'''

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

PUBLISH_LINKS=r'''        publish_links=tk.Frame(step4,bg=SURFACE)
        publish_links.pack(fill="x",padx=18,pady=(0,14))
        self._label(publish_links,"掲載先を開く",size=8,fg=MUTED).pack(side="left",padx=(0,8))
        self._secondary_button(publish_links,"note",lambda:self._open_publish_platform("note")).pack(side="left",padx=(0,4))
        self._secondary_button(publish_links,"Tips",lambda:self._open_publish_platform("Tips")).pack(side="left",padx=4)
        self._secondary_button(publish_links,"Brain",lambda:self._open_publish_platform("Brain")).pack(side="left",padx=4)
'''

COMPLETION=r'''        def finish_web_article():
            text_now=current_publish_text()
            ready=self.web_ai_bridge.publish_step(text_now, platform=req.platform) if text_now else {"can_publish":False}
            if not ready.get("can_publish"):
                messagebox.showwarning("作成完了", "記事を掲載用に整えてから完了してください。")
                return
            self.web_ai_bridge.mark_completed()
            messagebox.showinfo("作成完了", "記事作成を完了しました。掲載先で最終確認して公開してください。")
        self._primary_button(publish_links,"✓ 作成完了",finish_web_article).pack(side="right")
'''

RESUME_PREFILL=r'''        _snap = self.web_ai_bridge.current_snapshot()
        if _resume.get("visible"):
            if _snap.get("selected_title"):
                selected_title.set(_snap.get("selected_title", ""))
                prompt_status.configure(text=f"再開：{selected_title.get()}", fg="#86EFAC")
            if _snap.get("raw_web_output"):
                final_text.delete("1.0","end"); final_text.insert("1.0", _snap.get("raw_web_output", ""))
            if _snap.get("formatted_output"):
                formatted_text.configure(state="normal"); formatted_text.delete("1.0","end"); formatted_text.insert("1.0", _snap.get("formatted_output", ""))
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

    text=replace_once(text,r'        self\.web_settings_card = self\.card\(body, bg=SURFACE_2\)\n.*?        # Basic settings\n',WEB_SETTINGS,'Web AI settings block',flags=re.S)
    text=replace_once(text,r'    def _web_ai_service_changed\(self, _event=None\):\n.*?    def _genre_changed\(self, _event=None\):\n',SERVICE_METHODS,'web ai helper methods',flags=re.S)

    if 'PUBLISH_PLATFORM_URLS = {' not in text:
        class_pos=text.find('\n\nclass App(tk.Tk):')
        if class_pos<0: raise RuntimeError('class App marker not found')
        text=text[:class_pos]+'\n\n'+PUBLISH_CONSTANTS.rstrip()+text[class_pos:]

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
    if top_anchor in text:
        text=text.replace(top_anchor,top_anchor+resume,1)
    else:
        win_anchor='        win.configure(bg=BG)\n'
        if win_anchor not in text: raise RuntimeError('Web AI window anchor not found')
        text=text.replace(win_anchor,win_anchor+'        _resume = self.web_ai_bridge.resume_card()\n',1)

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
    if button_anchor not in text: raise RuntimeError('save button anchor not found')
    repair_button='        self._secondary_button(controls4,"修正用プロンプト",copy_repair_prompt).pack(side="left",padx=8)\n'
    text=text.replace(button_anchor,button_anchor+repair_button,1)

    publish_anchor='        self._secondary_button(publish_links,"Brain",lambda:self._open_publish_platform("Brain")).pack(side="left",padx=4)\n'
    if publish_anchor not in text:
        text=text.replace(repair_button,repair_button+PUBLISH_LINKS,1)
    if publish_anchor not in text:
        raise RuntimeError('publish links could not be created')
    text=text.replace(publish_anchor,publish_anchor+COMPLETION+RESUME_PREFILL,1)

    class_anchor='\n\nclass App(tk.Tk):'
    if class_anchor not in text: raise RuntimeError('class App anchor not found')
    text=text.replace(class_anchor,'\n\n'+MARKER+class_anchor,1)
    app.write_text(text,encoding='utf-8',newline='\n')
    init.write_text('__version__ = "0.4.0"\n',encoding='utf-8',newline='\n')
    print('v0.4.0 patch applied')

if __name__=='__main__': main()
