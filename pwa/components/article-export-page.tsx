"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getCloudArticleDetail,
  listCloudArticles,
  type ArticleDetail,
  type ArticleSummary,
} from "@/lib/phase7-articles";
import {
  articleExportBody,
  articleExportFilename,
  articleExportMarkdown,
} from "@/lib/article-export";
import { getSupabaseClient } from "@/lib/supabase";

type Gate =
  | { kind: "loading" }
  | { kind: "signed_out" }
  | { kind: "ready"; ownerId: string; aasId: string }
  | { kind: "error"; message: string };

export function ArticleExportPage() {
  const [gate, setGate] = useState<Gate>({ kind: "loading" });
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [detail, setDetail] = useState<ArticleDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        const client = getSupabaseClient();
        const { data: { user }, error } = await client.auth.getUser();
        if (!active) return;
        if (error || !user) {
          setGate({ kind: "signed_out" });
          return;
        }
        const { data: profile, error: profileError } = await client
          .from("profiles")
          .select("id,aas_user_id,status")
          .eq("id", user.id)
          .single();
        if (
          profileError ||
          !profile ||
          profile.id !== user.id ||
          profile.status !== "active"
        ) {
          throw new Error("activeプロフィールを確認できません。");
        }
        const next = await listCloudArticles(client, user.id, 200);
        if (!active) return;
        setArticles(next);
        setGate({ kind: "ready", ownerId: user.id, aasId: profile.aas_user_id });
      } catch (error) {
        if (active) {
          setGate({ kind: "error", message: error instanceof Error ? error.message : "初期化に失敗しました。" });
        }
      }
    };
    void boot();
    return () => { active = false; };
  }, []);

  const body = useMemo(() => detail ? articleExportBody(detail) : "", [detail]);
  const filename = useMemo(() => detail ? articleExportFilename(detail) : "", [detail]);

  const choose = async (articleId: string) => {
    if (gate.kind !== "ready") return;
    setDetail(null);
    setMessage("");
    if (!articleId) return;
    setBusy(true);
    try {
      setDetail(await getCloudArticleDetail(getSupabaseClient(), gate.ownerId, articleId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "記事を読み込めませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!body) return;
    try {
      await navigator.clipboard.writeText(body);
      setMessage("掲載用本文をコピーしました。");
    } catch {
      setMessage("自動コピーできません。本文欄からコピーしてください。");
    }
  };

  const download = () => {
    if (!detail) return;
    const blob = new Blob([articleExportMarkdown(detail)], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = articleExportFilename(detail);
    anchor.rel = "noopener";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setMessage("Markdownファイルを作成しました。");
  };

  if (gate.kind !== "ready") {
    return (
      <main className="standalone-page"><section className="standalone-card">
        <p className="eyebrow">ARTICLE OUTPUT</p><h1>記事出力</h1>
        {gate.kind === "loading" && <p className="route-notice">記事ライブラリを確認しています…</p>}
        {gate.kind === "signed_out" && <p className="route-notice error">先にログインしてください。</p>}
        {gate.kind === "error" && <p className="route-notice error">{gate.message}</p>}
        <a className="route-back" href="/tools">← 機能一覧へ戻る</a>
      </section></main>
    );
  }

  return (
    <main className="creator-page">
      <header className="creator-head">
        <div><p className="eyebrow">ARTICLE OUTPUT</p><h1>掲載用本文を出力</h1><p>{gate.aasId} / 共通記事ライブラリからコピー・Markdown保存</p></div>
        <a className="route-back" href="/tools">← 機能一覧</a>
      </header>
      <section className="creator-card">
        <label className="route-field"><span>記事</span><select defaultValue="" disabled={busy} onChange={(event) => void choose(event.target.value)}><option value="">選択してください</option>{articles.map((article) => <option key={article.id} value={article.id}>{article.title} / {article.status}</option>)}</select></label>
        {detail && (
          <>
            <dl className="route-meta"><div><dt>タイトル</dt><dd>{detail.title}</dd></div><div><dt>掲載先</dt><dd>{detail.publicationTarget}</dd></div><div><dt>revision</dt><dd>{detail.revision}</dd></div><div><dt>ファイル名</dt><dd>{filename}</dd></div></dl>
            <label className="route-field"><span>掲載用本文</span><textarea className="body-area" readOnly value={body} /></label>
            <div className="wizard-actions"><button className="secondary-action" type="button" disabled={!body} onClick={() => void copy()}>本文をコピー</button><button className="primary-action" type="button" disabled={!body} onClick={download}>Markdownを保存</button></div>
          </>
        )}
        {message && <div className="route-notice">{message}</div>}
        <p className="panel-muted">外部サービスへ自動投稿せず、AASに保存済みの掲載用本文だけを出力します。</p>
      </section>
    </main>
  );
}
