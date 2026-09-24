import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
if (!url || !serviceKey) throw new Error("Supabase runtime credentials unavailable.");

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function normalize(raw: string) {
  return raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function pageTitle(raw: string) {
  const match = raw.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? normalize(match[1]).slice(0, 300) : "";
}

function nextCheck(hours: number) {
  return new Date(Date.now() + Math.max(1, hours) * 3600000).toISOString();
}

const genericTerms = [
  "help","guide","policy","rules","terms","update","release","changelog","analytics",
  "creator","support","faq","advertising","ヘルプ","ガイド","規約","ルール","更新","変更",
  "分析","広告","販売","出品","手数料","料金","納品","契約","応募","著作","個人情報"
];

const taskTerms: Record<string,string[]> = {
  sidejob_content:["note","membership","paid","content","publish","記事","有料","公開"],
  sidejob_sns:["social","post","automation","analytics","instagram","tiktok","sns","投稿","自動化"],
  sidejob_video:["youtube","video","thumbnail","retention","analytics","動画","サムネ","視聴"],
  sidejob_affiliate:["affiliate","advertising","review","comparison","広告","アフィリエイト","比較"],
  sidejob_resale:["listing","shipping","fee","prohibited","出品","発送","送料","手数料","禁止"],
  sidejob_crowdsourcing:["contract","proposal","payment","crowd","応募","契約","報酬","納品"],
  sidejob_skill_sales:["service","seller","delivery","revision","販売","サービス","納品","修正"],
  sidejob_digital_product:["digital","product","membership","download","教材","デジタル","商品"],
  sidejob_outreach:["message","automation","spam","proposal","contact","営業","連絡","迷惑","提案"],
  sidejob_research:["search","web","source","citation","research","検索","出典","根拠","調査"],
  sidejob_efficiency:["automation","prompt","workflow","eval","ai","自動化","業務","評価"],
  sidejob_planning:["side job","work","tax","hours","employment","副業","税","労働","就業"]
};

function discoverLinks(raw: string, baseUrl: string, tasks: string[], limit: number) {
  if (limit <= 0) return [] as Array<{url:string;label:string}>;
  let base: URL;
  try { base = new URL(baseUrl); } catch { return []; }
  const terms = new Set(genericTerms);
  for (const task of tasks) for (const term of taskTerms[task] ?? []) terms.add(term);
  const results = new Map<string,string>();
  const regex = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null && results.size < limit * 3) {
    try {
      const target = new URL(match[1], base);
      if (target.protocol !== "https:" || target.origin !== base.origin) continue;
      target.hash = "";
      const cleanUrl = target.toString();
      if (cleanUrl === base.toString()) continue;
      if (/\.(png|jpe?g|gif|webp|svg|css|js|woff2?|ico|zip|mp4|mp3)(\?|$)/i.test(cleanUrl)) continue;
      const label = normalize(match[2]).slice(0, 220);
      const text = (cleanUrl + " " + label).toLowerCase();
      if (![...terms].some((term) => text.includes(term.toLowerCase()))) continue;
      if (!results.has(cleanUrl)) results.set(cleanUrl, label);
    } catch {}
  }
  return [...results.entries()].slice(0, limit).map(([linkUrl,label]) => ({ url:linkUrl, label }));
}

function researchPrompt(action: string, sourceUrl: string, tasks: string[], title: string, excerpt: string, item: any, reason: string) {
  const existing = item ? "\n現行項目: " + JSON.stringify(item) : "";
  return [
    "あなたはAI Action Studio（AAS）のKnowledge更新レビュー担当です。",
    "これは公式Webソースの自動監視で作られた候補です。自動公開は禁止です。",
    "action: " + action,
    "対象task: " + (tasks.join(", ") || "未特定"),
    "公式URL: " + sourceUrl,
    "タイトル: " + (title || "未取得"),
    "検出理由: " + reason,
    "抜粋: " + (excerpt.slice(0,1600) || "なし") + existing,
    "",
    "公式一次情報を開いて、公開日・更新日・対象地域・対象プランを確認してください。",
    "実質変更がなければ no_change。404/410は移転先を確認してから retire を判断してください。",
    "新規Knowledgeが必要な場合のみ auto: keyを作り、更新時は既存keyを維持してください。",
    "最終公開はAAS管理画面のQuality Gateと差分確認を通して管理者が行います。",
    "",
    "出力: review_decision / reason / verified_source_urls / proposed_knowledge_or_prompt_json"
  ].join("\n");
}

async function candidate(runId: number, source: any, action: string, sourceUrl: string, title: string, excerpt: string, hash: string, status: number|null, tasks: string[], item: any, confidence: number, reason: string) {
  const fingerprint = await sha256([action,item?.item_type ?? "source",item?.key ?? "",sourceUrl,hash,String(status ?? "")].join("|"));
  const payload = item?.payload ?? null;
  const { error } = await db.from("knowledge_automation_candidates").insert({
    fingerprint,
    run_id: runId,
    source_id: source.id,
    candidate_action: action,
    existing_item_type: item?.item_type ?? null,
    existing_item_key: item?.key ?? null,
    matched_tasks: tasks,
    source_url: sourceUrl,
    source_title: title,
    source_excerpt: excerpt.slice(0,4000),
    source_content_hash: hash,
    source_http_status: status,
    current_payload: payload,
    proposed_payload: null,
    research_prompt: researchPrompt(action,sourceUrl,tasks,title,excerpt,payload,reason).slice(0,20000),
    confidence,
    reason: reason.slice(0,2000),
    status: "pending"
  });
  if (!error) return 1;
  if (error.code === "23505") return 0;
  throw error;
}

async function loadItems() {
  const snapshot = await db.rpc("get_knowledge_automation_catalog_snapshot");
  if (snapshot.error) throw new Error("catalog snapshot failed: " + snapshot.error.message);
  const value = snapshot.data && typeof snapshot.data === "object" ? snapshot.data as any : {};
  const items: any[] = [];
  for (const row of value.knowledge ?? []) {
    items.push({
      item_type:"knowledge",
      key:row.key,
      label:row.label,
      tasks:Array.isArray(row.tasks) ? row.tasks : [],
      source_urls:Array.isArray(row.source_urls) ? row.source_urls : [],
      payload:row
    });
  }
  for (const row of value.prompts ?? []) {
    items.push({
      item_type:"prompt",
      key:row.key,
      label:String(row.provider) + " / " + String(row.task),
      tasks:row.task ? [row.task] : [],
      source_urls:Array.isArray(row.source_urls) ? row.source_urls : [],
      payload:row
    });
  }
  return items;
}

async function syncSources(items: any[]) {
  const grouped = new Map<string,Set<string>>();
  for (const item of items) {
    for (const sourceUrl of item.source_urls) {
      if (typeof sourceUrl !== "string" || !sourceUrl.startsWith("https://")) continue;
      const set = grouped.get(sourceUrl) ?? new Set<string>();
      for (const task of item.tasks) if (typeof task === "string") set.add(task);
      grouped.set(sourceUrl,set);
    }
  }
  const rows = [...grouped.entries()].map(([source_url,tasks]) => ({
    source_url,
    tasks:[...tasks].sort(),
    enabled:true,
    updated_at:new Date().toISOString()
  }));
  if (rows.length) {
    const { error } = await db.from("knowledge_automation_sources").upsert(rows,{ onConflict:"source_url" });
    if (error) throw error;
  }
}

async function inspectSource(source: any, settings: any, runId: number, items: any[], known: Set<string>) {
  const mapped = items.filter((item) => item.source_urls.includes(source.source_url));
  const headers = new Headers({ "accept":"text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.5", "user-agent":"AI-Action-Studio-KnowledgeMonitor/1.0" });
  if (source.etag) headers.set("if-none-match",source.etag);
  if (source.last_modified) headers.set("if-modified-since",source.last_modified);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(),12000);
  try {
    const res = await fetch(source.source_url,{ headers, redirect:"follow", signal:controller.signal });
    const now = new Date().toISOString();
    if (res.status === 304) {
      await db.from("knowledge_automation_sources").update({ last_checked_at:now,next_check_at:nextCheck(settings.check_interval_hours),last_http_status:304,consecutive_failures:0,last_error:"",updated_at:now }).eq("id",source.id);
      return { checked:1,candidates:0,changed:0,discovered:0 };
    }
    if (res.status === 404 || res.status === 410) {
      let made = 0;
      for (const item of mapped) made += await candidate(runId,source,"retire",source.source_url,item.label,"",source.last_content_hash ?? "",res.status,item.tasks.length ? item.tasks : source.tasks,item,92,"公式ソースがHTTP " + res.status + "を返しました。移転先と継続要否を確認してください。");
      await db.from("knowledge_automation_sources").update({ last_checked_at:now,next_check_at:nextCheck(12),last_http_status:res.status,consecutive_failures:(source.consecutive_failures ?? 0)+1,last_error:"HTTP "+res.status,updated_at:now }).eq("id",source.id);
      return { checked:1,candidates:made,changed:1,discovered:0 };
    }
    if (!res.ok) {
      const failures = (source.consecutive_failures ?? 0)+1;
      let made = 0;
      if (failures >= 3) made += await candidate(runId,source,"recheck",source.source_url,"","",source.last_content_hash ?? "",res.status,source.tasks,null,65,"公式ソース取得が" + failures + "回連続で失敗しています。");
      await db.from("knowledge_automation_sources").update({ last_checked_at:now,next_check_at:nextCheck(12),last_http_status:res.status,consecutive_failures:failures,last_error:"HTTP "+res.status,updated_at:now }).eq("id",source.id);
      return { checked:1,candidates:made,changed:0,discovered:0 };
    }
    const raw = (await res.text()).slice(0,900000);
    const contentType = res.headers.get("content-type") ?? "";
    const text = normalize(raw).slice(0,250000);
    const hash = await sha256(text);
    const title = contentType.includes("html") ? pageTitle(raw) : "";
    const changed = Boolean(source.last_content_hash && source.last_content_hash !== hash);
    let made = 0;
    if (changed) {
      for (const item of mapped) made += await candidate(runId,source,"update",source.source_url,title || item.label,text.slice(0,2500),hash,res.status,item.tasks.length ? item.tasks : source.tasks,item,85,"公式ソース本文のハッシュが前回確認時から変更されました。");
      if (!mapped.length) {
        const action = ["official_changelog","official_feed"].includes(source.source_kind) ? "new" : "recheck";
        const confidence = action === "new" ? 78 : 70;
        const reason = action === "new"
          ? "公式Changelog / Releaseソース本文が前回確認時から変更されました。新規Knowledge / Prompt候補の有無を確認してください。"
          : "追跡中の公式ソースが変更されましたが現行Knowledgeとの直接対応を特定できません。";
        made += await candidate(runId,source,action,source.source_url,title,text.slice(0,2500),hash,res.status,source.tasks,null,confidence,reason);
      }
    }
    let discovered = 0;
    if (contentType.includes("html") && ["official_changelog","official_feed"].includes(source.source_kind)) {
      const links = discoverLinks(raw,res.url || source.source_url,source.tasks,settings.max_discovered_links_per_source);
      for (const link of links) {
        if (known.has(link.url)) continue;
        const created = await candidate(runId,source,"new",link.url,link.label,"既存の公式ページから同一公式ドメイン内の関連ページとして検出。",await sha256(link.url),200,source.tasks,null,58,"対象タスクに関連する同一公式ドメイン内リンクを新規検出しました。");
        made += created;
        if (created) { discovered += 1; known.add(link.url); }
      }
    }
    await db.from("knowledge_automation_sources").update({
      last_checked_at:now,next_check_at:nextCheck(settings.check_interval_hours),last_http_status:res.status,
      last_content_hash:hash,etag:res.headers.get("etag"),last_modified:res.headers.get("last-modified"),
      consecutive_failures:0,last_error:"",updated_at:now
    }).eq("id",source.id);
    return { checked:1,candidates:made,changed:changed ? 1 : 0,discovered };
  } catch (error) {
    const failures = (source.consecutive_failures ?? 0)+1;
    const message = error instanceof Error ? error.message : (() => { try { return JSON.stringify(error); } catch { return String(error); } })();
    let made = 0;
    if (failures >= 3) made += await candidate(runId,source,"recheck",source.source_url,"","",source.last_content_hash ?? "",null,source.tasks,null,60,"公式ソース取得が" + failures + "回連続で失敗: " + message.slice(0,500));
    await db.from("knowledge_automation_sources").update({ last_checked_at:new Date().toISOString(),next_check_at:nextCheck(12),consecutive_failures:failures,last_error:message.slice(0,1000),updated_at:new Date().toISOString() }).eq("id",source.id);
    return { checked:1,candidates:made,changed:0,discovered:0 };
  } finally { clearTimeout(timer); }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return response({ error:"POST required" },405);
  const { data:settings,error:settingsError } = await db.from("knowledge_automation_settings").select("*").eq("id",1).single();
  if (settingsError || !settings) return response({ error:"settings unavailable" },500);
  const token = req.headers.get("x-aas-worker-token") ?? "";
  if (!token || await sha256(token) !== settings.worker_token_hash) return response({ error:"unauthorized" },401);
  await db.from("knowledge_automation_settings").update({ last_worker_invoked_at:new Date().toISOString(),updated_at:new Date().toISOString() }).eq("id",1);
  if (!settings.enabled) return response({ ok:true,skipped:"disabled" });

  let runId: number|null = null;
  try {
    const { data:processing } = await db.from("knowledge_automation_runs").select("id,started_at").eq("status","processing").order("id",{ascending:false}).limit(1);
    if (processing?.length) {
      const started = processing[0].started_at ? new Date(processing[0].started_at).getTime() : Date.now();
      if (Date.now()-started < 3600000) return response({ ok:true,skipped:"busy",run_id:processing[0].id });
      await db.from("knowledge_automation_runs").update({ status:"failed",completed_at:new Date().toISOString(),error_message:"AAS recovery: processing exceeded 1 hour." }).eq("id",processing[0].id);
    }
    const { data:pending } = await db.from("knowledge_automation_runs").select("id").eq("status","pending").order("id",{ascending:true}).limit(1);
    if (pending?.length) {
      runId = pending[0].id;
      await db.from("knowledge_automation_runs").update({ status:"processing",started_at:new Date().toISOString(),error_message:"" }).eq("id",runId);
    } else {
      let trigger = "cron";
      try { const body = await req.json(); if (body?.trigger === "manual") trigger = "manual"; } catch {}
      const inserted = await db.from("knowledge_automation_runs").insert({ trigger_type:trigger,status:"processing",started_at:new Date().toISOString() }).select("id").single();
      if (inserted.error) throw inserted.error;
      runId = inserted.data.id;
    }

    const items = await loadItems();
    await syncSources(items);
    const due = await db.from("knowledge_automation_sources").select("*").eq("enabled",true).lte("next_check_at",new Date().toISOString()).order("next_check_at",{ascending:true}).limit(settings.max_sources_per_run);
    if (due.error) throw due.error;
    const known = new Set<string>();
    const all = await db.from("knowledge_automation_sources").select("source_url");
    for (const row of all.data ?? []) if (row.source_url) known.add(row.source_url);
    for (const item of items) for (const sourceUrl of item.source_urls) known.add(sourceUrl);

    const metrics:any[] = [];
    const sources = due.data ?? [];
    for (let i=0;i<sources.length;i+=4) {
      metrics.push(...await Promise.all(sources.slice(i,i+4).map((source) => inspectSource(source,settings,runId!,items,known))));
    }
    const totals = metrics.reduce((a,v) => ({ checked:a.checked+v.checked,candidates:a.candidates+v.candidates,changed:a.changed+v.changed,discovered:a.discovered+v.discovered }),{checked:0,candidates:0,changed:0,discovered:0});
    await db.from("knowledge_automation_runs").update({
      status:"completed",completed_at:new Date().toISOString(),sources_checked:totals.checked,candidates_created:totals.candidates,
      changed_sources:totals.changed,discovered_links:totals.discovered,
      summary:{ tracked_catalog_items:items.length,sources_selected:sources.length,...totals }
    }).eq("id",runId);
    await db.from("knowledge_automation_settings").update({ last_success_at:new Date().toISOString(),last_error:"",updated_at:new Date().toISOString() }).eq("id",1);
    return response({ ok:true,run_id:runId,...totals });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (runId) await db.from("knowledge_automation_runs").update({ status:"failed",completed_at:new Date().toISOString(),error_message:message.slice(0,2000) }).eq("id",runId);
    await db.from("knowledge_automation_settings").update({ last_error:message.slice(0,2000),updated_at:new Date().toISOString() }).eq("id",1);
    return response({ error:"automation_failed",detail:message.slice(0,1000),run_id:runId },500);
  }
});
