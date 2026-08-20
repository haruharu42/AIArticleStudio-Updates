from __future__ import annotations

import shutil
import sys
from pathlib import Path

VERSION = "0.4.2"
MARKER = "# v0.4.2 Phase 3.6 image workflow"

IMAGE_CARD = r'''        # v0.4.2 Phase 3.6 image workflow
        self.image_settings_card = self.card(body, bg=SURFACE_2)
        self._section_title(self.image_settings_card, "IMAGE", "画像生成設定", "初心者向け：まずはWeb版がおすすめです。記事に合わせたアイキャッチと挿絵を準備します")
        imagegrid = tk.Frame(self.image_settings_card, bg=SURFACE_2)
        imagegrid.pack(fill="x", padx=20, pady=(0, 14))
        imagegrid.grid_columnconfigure(1, weight=1)
        imagegrid.grid_columnconfigure(3, weight=1)
        self.vars["image_enabled"] = tk.BooleanVar(value=False)
        self.vars["image_target"] = tk.StringVar(value="アイキャッチ＋挿絵")
        self.vars["image_mode"] = tk.StringVar(value="Web版（おすすめ）")
        self.vars["image_style"] = tk.StringVar(value="おまかせ")
        self.vars["image_count"] = tk.StringVar(value="自動")
        self.vars["image_insert_markers"] = tk.BooleanVar(value=True)

        image_on = tk.Checkbutton(imagegrid, text="画像を作る", variable=self.vars["image_enabled"], bg=SURFACE_2, fg=TEXT, activebackground=SURFACE_2, activeforeground=TEXT, selectcolor="#111827")
        image_on.grid(row=0, column=0, sticky="w", pady=6)
        self._label(imagegrid, "作る画像", size=9, fg=SOFT, bg=SURFACE_2).grid(row=0, column=2, sticky="w", padx=(16,8), pady=6)
        ttk.Combobox(imagegrid, textvariable=self.vars["image_target"], values=["アイキャッチ＋挿絵","アイキャッチのみ","挿絵のみ"], state="readonly", style="Dark.TCombobox").grid(row=0, column=3, sticky="ew", pady=6)

        self._label(imagegrid, "作り方", size=9, fg=SOFT, bg=SURFACE_2).grid(row=1, column=0, sticky="w", pady=6)
        image_mode_cb = ttk.Combobox(imagegrid, textvariable=self.vars["image_mode"], values=["Web版（おすすめ）","API版（準備中）","ローカルGPU（準備中）"], state="readonly", style="Dark.TCombobox")
        image_mode_cb.grid(row=1, column=1, sticky="ew", padx=(8,0), pady=6)
        image_mode_cb.bind("<<ComboboxSelected>>", self._image_mode_changed)
        self._label(imagegrid, "デザイン", size=9, fg=SOFT, bg=SURFACE_2).grid(row=1, column=2, sticky="w", padx=(16,8), pady=6)
        ttk.Combobox(imagegrid, textvariable=self.vars["image_style"], values=["おまかせ","ビジネス","テック","やさしい","図解風"], state="readonly", style="Dark.TCombobox").grid(row=1, column=3, sticky="ew", pady=6)

        self._label(imagegrid, "挿絵の枚数", size=9, fg=SOFT, bg=SURFACE_2).grid(row=2, column=0, sticky="w", pady=6)
        ttk.Combobox(imagegrid, textvariable=self.vars["image_count"], values=["自動","1","2","3"], state="readonly", style="Dark.TCombobox").grid(row=2, column=1, sticky="ew", padx=(8,0), pady=6)
        marker_check = tk.Checkbutton(imagegrid, text="おすすめの差し込み位置を本文に記載", variable=self.vars["image_insert_markers"], bg=SURFACE_2, fg=SOFT, activebackground=SURFACE_2, activeforeground=TEXT, selectcolor="#111827")
        marker_check.grid(row=2, column=2, columnspan=2, sticky="w", padx=(16,0), pady=6)

        self.image_mode_note = self._label(imagegrid, "Web版：画像用プロンプトを作成し、ChatGPT等へコピーして使えます。", size=8, fg="#93C5FD", bg=SURFACE_2, wraplength=760, justify="left")
        self.image_mode_note.grid(row=3, column=0, columnspan=4, sticky="w", pady=(6,4))
        image_actions = tk.Frame(self.image_settings_card, bg=SURFACE_2)
        image_actions.pack(fill="x", padx=20, pady=(0,16))
        self._secondary_button(image_actions, "GPUを確認", self._show_gpu_diagnostic).pack(side="left")
        self._label(image_actions, "※ API版・ローカルGPUでの直接生成は次段階。現在はWeb版プロンプト生成とGPU診断を安全に利用できます。", size=8, fg=MUTED, bg=SURFACE_2, wraplength=660, justify="left").pack(side="left", padx=(12,0))

'''

HELPER_METHODS = r'''    def _collect_image_settings(self):
        def _value(name, default=""):
            var = self.vars.get(name)
            return var.get() if var is not None else default
        target_map = {"アイキャッチ＋挿絵":"both", "アイキャッチのみ":"eyecatch", "挿絵のみ":"illustrations"}
        mode_map = {"Web版（おすすめ）":"web", "API版（準備中）":"api", "ローカルGPU（準備中）":"local"}
        style_map = {"おまかせ":"auto", "ビジネス":"business", "テック":"tech", "やさしい":"gentle", "図解風":"diagram"}
        count = str(_value("image_count", "自動"))
        return {
            "enabled": bool(_value("image_enabled", False)),
            "target": target_map.get(_value("image_target", "アイキャッチ＋挿絵"), "both"),
            "mode": mode_map.get(_value("image_mode", "Web版（おすすめ）"), "web"),
            "style": style_map.get(_value("image_style", "おまかせ"), "auto"),
            "illustration_count": "auto" if count == "自動" else count,
            "insert_markers": bool(_value("image_insert_markers", True)),
            "text_mode": "none",
            "generate_alt_text": True,
            "generate_caption": False,
            "include_illustration_summary": True,
        }

    def _sync_image_settings(self):
        try:
            return self.web_ai_bridge.set_image_settings(self._collect_image_settings())
        except Exception as e:
            messagebox.showwarning("画像生成設定", f"画像設定を保存できませんでした。記事作成は続けられます。\n{e}")
            return {}

    def _image_mode_changed(self, _event=None):
        mode = self.vars.get("image_mode").get() if self.vars.get("image_mode") else "Web版（おすすめ）"
        if not hasattr(self, "image_mode_note"):
            return
        if mode.startswith("Web版"):
            text = "Web版：画像用プロンプトを作成し、ChatGPT等へコピーして使えます。"
        elif mode.startswith("API版"):
            text = "API版：設定UIのみ先行対応です。直接画像生成は準備中なので、現在はWeb版をおすすめします。"
        else:
            text = "ローカルGPU：GPU診断を利用できます。画像モデルの導入・直接生成は準備中です。"
        self.image_mode_note.configure(text=text)

    def _show_gpu_diagnostic(self):
        try:
            data = self.web_ai_bridge.gpu_diagnostic()
            name = data.get("gpu_name") or "未検出"
            vram = data.get("vram_mb")
            vram_text = f"{vram} MB" if vram else "不明"
            messagebox.showinfo("GPU診断", f"GPU: {name}\nVRAM: {vram_text}\n\n{data.get('message','')}")
        except Exception as e:
            messagebox.showinfo("GPU診断", f"GPU情報を確認できませんでした。Web版はそのまま利用できます。\n{e}")

    def _show_image_prompts(self):
        self._sync_image_settings()
        try:
            data = self.web_ai_bridge.build_image_prompts()
        except Exception as e:
            messagebox.showwarning("画像プロンプト", f"画像プロンプトを作成できませんでした。\n{e}")
            return
        eye = str(data.get("eyecatch_prompt") or "").strip()
        inline = list(data.get("illustration_prompts") or [])
        if not eye and not inline:
            messagebox.showinfo("画像プロンプト", "画像生成をONにして記事を作成・取り込み後に利用してください。")
            return
        parts = []
        if eye:
            parts += ["【アイキャッチ用プロンプト】", eye]
        for item in inline:
            parts += [f"【{item.get('label','挿絵')}用プロンプト】", str(item.get("prompt") or "").strip()]
        summary = str(data.get("illustration_summary") or "").strip()
        if summary:
            parts += [summary]
        combined = "\n\n".join(x for x in parts if x)
        win = tk.Toplevel(self)
        win.title("画像プロンプト")
        win.geometry("900x650")
        win.configure(bg=BG)
        self._label(win, "アイキャッチ・挿絵用プロンプト", size=14, bold=True, fg=TEXT, bg=BG).pack(anchor="w", padx=18, pady=(16,6))
        self._label(win, "Web版AIへコピーして画像を作成してください。記事本文には挿絵の差し込み位置が残ります。", size=8, fg=SOFT, bg=BG).pack(anchor="w", padx=18, pady=(0,10))
        box = tk.Text(win, wrap="word", bg=SURFACE, fg=TEXT, insertbackground=TEXT, relief="flat")
        box.pack(fill="both", expand=True, padx=18, pady=(0,10))
        box.insert("1.0", combined)
        row = tk.Frame(win, bg=BG)
        row.pack(fill="x", padx=18, pady=(0,16))
        def copy_all():
            self.clipboard_clear(); self.clipboard_append(combined); self.update()
            messagebox.showinfo("コピー", "画像プロンプトをコピーしました。")
        self._primary_button(row, "すべてコピー", copy_all).pack(side="left")
        self._secondary_button(row, "ChatGPTを開く", lambda:self._open_web_ai_site("ChatGPT")).pack(side="left", padx=(8,0))

'''

SYNC_INSERT = '''        try:\n            self.web_ai_bridge.set_image_settings(self._collect_image_settings())\n        except Exception:\n            pass\n'''

IMAGE_BUTTON = '''        self._secondary_button(publish_links,"画像プロンプト",self._show_image_prompts).pack(side="left",padx=4)\n'''


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if text.count(old) != 1:
        raise RuntimeError(f"{label}: expected exactly one anchor, got {text.count(old)}")
    return text.replace(old, new, 1)


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: patch_v042.py <install-root> <package-root>")
    install = Path(sys.argv[1])
    package = Path(sys.argv[2])
    app = install / "src" / "ai_article_studio" / "ui" / "app.py"
    core_dst = install / "src" / "ai_article_studio" / "core"
    core_src = package / "payload" / "core"
    if not app.is_file():
        raise RuntimeError(f"required application file not found: {app}")
    if not core_src.is_dir():
        raise RuntimeError("Phase 3.6 payload/core not found")

    core_dst.mkdir(parents=True, exist_ok=True)
    for src in core_src.glob("*.py"):
        shutil.copy2(src, core_dst / src.name)

    text = app.read_text(encoding="utf-8")
    if MARKER in text:
        print("v0.4.2 image UI already applied")
        return

    text = replace_once(text, "        # Basic settings\n", IMAGE_CARD + "        # Basic settings\n", "image settings card")
    text = replace_once(text, "    def _genre_changed(self, _event=None):\n", HELPER_METHODS + "    def _genre_changed(self, _event=None):\n", "image helper methods")

    title_anchor = "        _title_step = self.web_ai_bridge.build_title_step("
    text = replace_once(text, title_anchor, SYNC_INSERT + title_anchor, "image settings sync")

    brain_anchor = '        self._secondary_button(publish_links,"Brain",lambda:self._open_publish_platform("Brain")).pack(side="left",padx=4)\n'
    text = replace_once(text, brain_anchor, brain_anchor + IMAGE_BUTTON, "image prompt button")

    app.write_text(text, encoding="utf-8", newline="\n")
    print("v0.4.2 image workflow UI patch applied")


if __name__ == "__main__":
    main()
