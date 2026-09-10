"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { articleLibraryMessage } from "@/lib/phase7-articles";
import {
  createImageSignedUrl, listArticleImages, prepareImageFile, recoverArticleImage,
  removeArticleImage, saveImageMetadata, uploadArticleImage, validateImageMetadata,
  type ImageAsset, type ImageContext, type ImageDraft, type ImageMetadata, type PreparedImage,
} from "@/lib/phase8-images";

const storageOrigin = (process.env.NEXT_PUBLIC_AAS_SUPABASE_URL ?? "").trim();
const STATUS = { ready: "保存済み", pending_upload: "アップロード準備中", delete_pending: "削除待ち" };
function draftFrom(asset: ImageAsset): ImageDraft {
  return { asset, sortOrder: asset.sortOrder, insertionMarker: asset.insertionMarker, altText: asset.altText };
}
function differs(d: ImageDraft): boolean {
  return d.sortOrder !== d.asset.sortOrder || d.insertionMarker !== d.asset.insertionMarker || d.altText !== d.asset.altText;
}

function PrivatePreview({ ctx, asset }: { ctx: ImageContext; asset: ImageAsset }) {
  const holder = useRef<HTMLDivElement>(null);
  const [visible,setVisible] = useState(false);
  const [url,setUrl] = useState("");
  const [error,setError] = useState(false);
  const [retry,setRetry] = useState(0);
  const automaticRetry = useRef(false);
  useEffect(() => {
    const node = holder.current;
    if (!node) return;
    const observer = new IntersectionObserver(entries => setVisible(entries[0]?.isIntersecting ?? false), { rootMargin: "150px" });
    observer.observe(node);
    return () => observer.disconnect();
  },[]);
  useEffect(() => {
    if (!visible || asset.status !== "ready") return;
    let alive = true;
    let active = false;
    const refresh = async () => {
      if (document.visibilityState === "hidden" || active) return;
      active = true;
      try {
        const next = await createImageSignedUrl(ctx,asset,storageOrigin);
        if (alive) { setUrl(next); setError(false); }
      } catch { if (alive) { setUrl(""); setError(true); } }
      finally { active = false; }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 75000);
    const focus = () => void refresh();
    document.addEventListener("visibilitychange",focus);
    return () => { alive=false; window.clearInterval(timer); document.removeEventListener("visibilitychange",focus); };
  },[ctx,asset,visible,retry]);
  return <div ref={holder} className="image-preview">
    {url && !error ? (
      // Private, expiring URLs must bypass public image optimization/caches.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={asset.altText || (asset.assetType === "cover" ? "記事のアイキャッチ" : "記事の挿絵")} loading="lazy" referrerPolicy="no-referrer"
        onError={() => { setError(true); if (!automaticRetry.current) { automaticRetry.current=true; setRetry(v=>v+1); } }} />
    ) : <div className="image-placeholder"><span aria-hidden="true">▧</span><span>{error ? "画像を表示できませんでした" : asset.status === "ready" ? "画像を読み込みます" : STATUS[asset.status]}</span>
      {error && <button type="button" className="back-action" onClick={() => setRetry(v=>v+1)}>画像を再取得</button>}
    </div>}
  </div>;
}

export function Phase8Images({ client, ownerId, articleId, revision, onBusyChange, onUnsavedChange }: {
  client: SupabaseClient; ownerId: string; articleId: string; revision: number;
  onBusyChange: (busy: boolean) => void; onUnsavedChange: (unsaved: boolean) => void;
}) {
  const ctx = useMemo(() => ({ client, ownerId, articleId, revision }),[client,ownerId,articleId,revision]);
  const [assets,setAssets] = useState<ImageAsset[]>([]);
  const [drafts,setDrafts] = useState<ImageDraft[]>([]);
  const [latest,setLatest] = useState<ImageAsset[] | null>(null);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [image,setImage] = useState<PreparedImage | null>(null);
  const [target,setTarget] = useState<ImageAsset | null>(null);
  const [metadata,setMetadata] = useState<ImageMetadata>({ assetType: "cover", sortOrder: 0, insertionMarker: null, altText: "" });
  const fileInput = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const dirty = drafts.some(differs);
  const unsaved = dirty || image !== null;
  const adopt = useCallback((rows: ImageAsset[]) => { setAssets(rows); setDrafts(rows.map(draftFrom)); setLatest(null); },[]);
  const reload = useCallback(async () => { const rows = await listArticleImages(ctx); adopt(rows); },[ctx,adopt]);
  useEffect(() => {
    let alive = true;
    void listArticleImages(ctx).then(rows => { if (alive) adopt(rows); }).catch(caught => { if (alive) setError(articleLibraryMessage(caught)); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive=false; };
  },[ctx,adopt]);
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); },[busy,onBusyChange]);
  useEffect(() => { onUnsavedChange(unsaved); return () => onUnsavedChange(false); },[unsaved,onUnsavedChange]);
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => { if (unsaved || busy) { event.preventDefault(); event.returnValue=""; } };
    window.addEventListener("beforeunload",before);
    return () => window.removeEventListener("beforeunload",before);
  },[unsaved,busy]);
  const run = async (operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await operation(); }
    catch (caught) { setError(articleLibraryMessage(caught)); }
    finally { setBusy(false); }
  };
  const compare = () => run(async () => { setLatest(await listArticleImages(ctx)); setNotice("最新状態を取得しました。入力中の内容は保持しています。"); });
  const change = (id: string, patch: Partial<ImageDraft>) => setDrafts(rows => rows.map(d => d.asset.id === id ? { ...d,...patch } : d));
  const move = (index: number, offset: number) => {
    const rows = [...drafts].sort((a,b) => a.sortOrder-b.sortOrder);
    const other = index+offset;
    if (other<0 || other>=rows.length) return;
    [rows[index],rows[other]]=[rows[other],rows[index]];
    setDrafts(rows.map((d,i) => ({ ...d,sortOrder:i })));
  };
  const beginFile = (asset: ImageAsset | null) => {
    setTarget(asset); setImage(null);
    if (fileInput.current) fileInput.current.value="";
    if (asset) setMetadata({ assetType:asset.assetType,sortOrder:asset.sortOrder,insertionMarker:asset.insertionMarker,altText:asset.altText });
    else setMetadata({ assetType: assets.some(a=>a.assetType === "cover") ? "inline" : "cover", sortOrder: Math.max(-1,...assets.map(a=>a.sortOrder))+1, insertionMarker: "", altText:"" });
    form.current?.scrollIntoView({ behavior:"smooth",block:"center" });
    fileInput.current?.click();
  };
  const upload = (event: FormEvent) => {
    event.preventDefault();
    if (!image || busy || dirty) return;
    void run(async () => {
      const values = validateImageMetadata({ ...metadata, sortOrder: target ? metadata.sortOrder : Math.max(-1,...assets.map(a=>a.sortOrder))+1 });
      if (target?.status === "ready") {
        if (!window.confirm("現在の画像を削除して、この画像へ差し替えますか？\n送信が中断した場合は、選択した画像を再送できます。")) return;
        await removeArticleImage(ctx,target);
        setTarget(null);
      }
      try {
        await uploadArticleImage(ctx,image,values,target?.status === "pending_upload" ? target : undefined);
        setImage(null); setTarget(null);
        if (fileInput.current) fileInput.current.value="";
        await reload(); setNotice("画像を保存しました。Windows版でもクラウド画像を再取得すると反映されます。");
      } catch (caught) {
        // Expose the persistent pending row after a lost response, retaining File.
        try { await reload(); } catch { /* Keep the original failure and selection. */ }
        throw caught;
      }
    });
  };
  const save = () => run(async () => { adopt(await saveImageMetadata(ctx,drafts.filter(differs))); setNotice("画像の順序・挿入位置・代替テキストを保存しました。"); });
  const recover = (asset: ImageAsset) => run(async () => { await recoverArticleImage(ctx,asset); await reload(); setNotice("画像の処理を再開しました。"); });
  const remove = (asset: ImageAsset) => {
    const prompt = asset.status === "pending_upload" ? "この画像のアップロード準備を取り消しますか？" : "この画像を削除しますか？";
    if (!window.confirm(prompt)) return;
    void run(async () => {
      try { await removeArticleImage(ctx,asset); setNotice("画像の処理が完了しました。"); }
      finally { await reload(); }
    });
  };
  const ordered = [...drafts].sort((a,b)=>a.sortOrder-b.sortOrder);
  return <section className="article-images" aria-labelledby="article-images-title">
    <div className="images-heading"><div><p className="eyebrow">ARTICLE IMAGES</p><h3 id="article-images-title">記事の画像</h3><p>アイキャッチと挿絵を、Windows版と共有します。</p></div>
      <div className="image-actions"><button type="button" className="secondary-action" onClick={compare} disabled={busy || loading}>最新状態を確認</button><button type="button" className="primary-action" onClick={()=>beginFile(null)} disabled={busy || dirty || loading}>画像を追加</button></div>
    </div>
    {error && <p className="library-notice error" role="alert">{error}</p>}
    {notice && <p className="library-notice success" role="status">{notice}</p>}
    {loading ? <p role="status">画像一覧を読み込んでいます…</p> : <>
      {latest && <section className="image-comparison"><h4>クラウドの最新状態</h4><p>入力中の変更と比べてください。本文の変更も競合している場合は、記事一覧から最新の記事を開き直してください。</p>
        {latest.length ? <ul>{latest.map(a=><li key={a.id}>{a.assetType === "cover" ? "アイキャッチ" : `挿絵：${a.insertionMarker || "位置未設定"}`} · 順序 {a.sortOrder} · {STATUS[a.status]}<br />{a.altText || "代替テキストなし"}</li>)}</ul> : <p>保存されている画像はありません。</p>}
        <button type="button" className="secondary-action" disabled={busy} onClick={() => { if (!dirty || window.confirm("入力中の画像情報の変更を破棄し、最新状態へ切り替えますか？")) adopt(latest); }}>この最新状態へ切り替える</button>
      </section>}
      {!assets.length && <div className="images-empty"><span aria-hidden="true">▧</span><h4>画像を追加しましょう</h4><p>PNG・JPEG・WebP、1枚10 MiBまで。アイキャッチは1枚、挿絵は挿入位置を指定して追加します。</p></div>}
      <div className="image-grid">
        {ordered.map((d,index) => <div className="image-card" key={d.asset.id}>
          <PrivatePreview ctx={ctx} asset={d.asset} />
          <div className="image-card-content"><div className="image-card-title"><strong>{d.asset.assetType === "cover" ? "アイキャッチ" : `挿絵 ${index+1}`}</strong><span>{STATUS[d.asset.status]}</span></div>
            <p className="image-filename">{d.asset.originalFilename} · {(d.asset.sizeBytes/1024).toFixed(0)} KB</p>
            <fieldset disabled={busy || d.asset.status !== "ready"}>
              {d.asset.assetType === "inline" && <label>挿入マーカー<input value={d.insertionMarker ?? ""} maxLength={500} onChange={e=>change(d.asset.id,{ insertionMarker:e.target.value })} placeholder="例：見出し2の後" /></label>}
              <label>代替テキスト<textarea rows={2} value={d.altText} maxLength={2000} onChange={e=>change(d.asset.id,{ altText:e.target.value })} placeholder="画像の内容を簡潔に説明" /></label>
              <div className="image-order"><span>表示順 {index+1}</span><button type="button" aria-label={`${d.asset.originalFilename}を前へ`} onClick={()=>move(index,-1)} disabled={index===0 || assets.some(a=>a.status!=="ready")}>↑ 前へ</button><button type="button" aria-label={`${d.asset.originalFilename}を後ろへ`} onClick={()=>move(index,1)} disabled={index===ordered.length-1 || assets.some(a=>a.status!=="ready")}>↓ 後ろへ</button></div>
            </fieldset>
            <div className="image-actions">
              {d.asset.status === "ready" && <button type="button" className="secondary-action" onClick={()=>beginFile(d.asset)} disabled={busy || dirty}>差し替え</button>}
              {d.asset.status === "pending_upload" && <><button type="button" className="secondary-action" onClick={()=>void recover(d.asset)} disabled={busy || dirty}>送信済みか確認</button><button type="button" className="secondary-action" onClick={()=>beginFile(d.asset)} disabled={busy || dirty || !d.asset.checksumSha256}>同じ画像を再送</button></>}
              {d.asset.status === "delete_pending" ? <button type="button" className="danger-action" onClick={()=>void recover(d.asset)} disabled={busy || dirty}>削除を再開</button> : <button type="button" className="danger-action" onClick={()=>remove(d.asset)} disabled={busy || dirty}>{d.asset.status === "pending_upload" ? "準備を取り消す" : "削除"}</button>}
            </div>
          </div>
        </div>)}
      </div>
      {assets.length>0 && <div className="image-save"><span>{dirty ? "画像情報に未保存の変更があります" : "変更した画像情報は、保存すると共有されます"}</span><button type="button" className="primary-action" disabled={!dirty || busy} onClick={()=>void save()}>画像情報を保存</button></div>}
      <form ref={form} className="image-upload" onSubmit={upload}>
        <h4>{target?.status === "ready" ? "画像の差し替え" : target ? "アップロードの再送" : "画像を追加"}</h4>
        <fieldset disabled={busy || dirty}><label>画像ファイル<input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" onChange={event => {
          const file = event.target.files?.[0]; if (!file) return;
          setImage(null);
          void run(async () => { setImage(await prepareImageFile(file)); });
        }} /></label>
          {image && <p>{image.file.name} · {image.width} × {image.height} px</p>}
          <div className="image-upload-fields"><label>用途<select value={metadata.assetType} disabled={!!target} onChange={e=>setMetadata(v=>({...v,assetType:e.target.value as "cover"|"inline",insertionMarker:e.target.value === "cover" ? null : ""}))}><option value="cover">アイキャッチ</option><option value="inline">挿絵</option></select></label>
            {metadata.assetType === "inline" && <label>挿入マーカー<input value={metadata.insertionMarker ?? ""} maxLength={500} disabled={!!target} onChange={e=>setMetadata(v=>({...v,insertionMarker:e.target.value}))} placeholder="例：見出し2の後" required /></label>}
          </div>
          <label>代替テキスト<textarea value={metadata.altText} rows={2} maxLength={2000} disabled={!!target} onChange={e=>setMetadata(v=>({...v,altText:e.target.value}))} placeholder="画像の内容を簡潔に説明" /></label>
          <p className="image-help">挿入マーカーは、本文内の位置を識別する名前です。本文は自動で書き換えません。</p>
          <div className="image-actions"><button className="primary-action" type="submit" disabled={!image}>{busy ? "処理中…" : target?.status === "ready" ? "この画像へ差し替える" : target ? "同じ画像を再送" : "画像を保存"}</button>
            {(image || target) && <button className="secondary-action" type="button" onClick={()=>{setImage(null);setTarget(null); if(fileInput.current) fileInput.current.value="";}}>選択を解除</button>}
            {target && <button className="back-action" type="button" onClick={()=>{setTarget(null);}}>新しい画像として追加</button>}
          </div>
        </fieldset>
      </form>
    </>}
  </section>;
}
