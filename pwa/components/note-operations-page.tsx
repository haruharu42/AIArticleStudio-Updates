"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AasReferenceHeader } from "@/components/aas-reference-shell";
import { launchAiApp } from "@/lib/ai-app-links";
import {
  NOTE_ACCOUNT_GENRES,
  NOTE_ACCOUNT_STYLES,
  NOTE_AUDIENCE_PRESETS,
  NOTE_MONETIZATION_STYLES,
  NOTE_OPERATION_GOALS,
  NOTE_SCHEDULE_TYPE_LABELS,
  NOTE_TONE_PRESETS,
  buildNoteAccountResearchPrompt,
  buildNoteProfileDraft,
  buildNoteScheduleResearchPrompt,
  currentJstMonth,
  exportNoteOperationsJson,
  exportNoteScheduleCsv,
  listNoteSchedule,
  loadNoteAiSchedulePlan,
  loadNoteOperationProfile,
  parseNoteAiSchedulePlan,
  parseNoteOperationsImport,
  replaceNoteSchedule,
  replaceNoteScheduleMonth,
  saveNoteAiSchedulePlan,
  saveNoteOperationProfile,
  setNoteScheduleStatus,
  todayJstDateKey,
  type NoteAiSchedulePlan,
  type NoteOperationProfile,
  type NoteScheduleItem,
} from "@/lib/note-operations";
import { getSupabaseClient } from "@/lib/supabase";
import {
  AI_PROVIDER_LABELS,
  loadWritingProfile,
  saveWritingProfile,
  type AiProvider,
  type UserWritingProfile,
} from "@/lib/user-personalization";

type Gate =
  | { kind: "loading" }
  | { kind: "signed_out" }
  | { kind: "ready"; userId: string }
  | { kind: "error"; message: string };

type Tab = "start" | "profile" | "plan" | "calendar";

const NOTE_HOME_URL = "https://note.com/";
const NOTE_PROFILE_OFFICIAL = "https://note.com/info/n/n27cb842c7737";
const NOTE_PAID_OFFICIAL = "https://note.com/info/n/na5f43ec69740";
const NOTE_RESERVATION_OFFICIAL = "https://note.com/info/n/nc84e9a40b092";

function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function monthStart(value: string): string {
  return /^\d{4}-\d{2}$/.test(value) ? value + "-01" : todayJstDateKey().slice(0, 7) + "-01";
}

function moveMonth(value: string, delta: number): string {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

function monthCells(value: string): Array<{ date: string; current: boolean }> {
  const start = monthStart(value);
  const [year, month] = start.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const lead = first.getUTCDay();
  const base = new Date(Date.UTC(year, month - 1, 1 - lead));
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(base);
    date.setUTCDate(base.getUTCDate() + index);
    return {
      date: date.toISOString().slice(0, 10),
      current: date.getUTCMonth() === month - 1,
    };
  });
}

function typeClass(item: NoteScheduleItem): string {
  if (item.itemType === "paid_note") return "paid";
  if (item.itemType === "free_note") return "free";
  if (item.itemType === "review") return "review";
  return "setup";
}

function createHref(item: NoteScheduleItem): string {
  const params = new URLSearchParams({
    publicationTarget: "note",
    articleType: item.itemType === "paid_note" ? "paid" : "free",
    theme: item.theme || "",
    from: "note-operations",
  });
  return "/create?" + params.toString();
}

export function NoteOperationsPage() {
  const [gate, setGate] = useState<Gate>({ kind: "loading" });
  const [tab, setTab] = useState<Tab>("start");
  const [profile, setProfile] = useState<NoteOperationProfile | null>(null);
  const [schedule, setSchedule] = useState<NoteScheduleItem[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [targetMonth, setTargetMonth] = useState(currentJstMonth());
  const [calendarMonth, setCalendarMonth] = useState(currentJstMonth());
  const [selectedAi, setSelectedAi] = useState<AiProvider>("chatgpt");
  const [writingProfile, setWritingProfile] = useState<UserWritingProfile | null>(null);
  const [accountPrompt, setAccountPrompt] = useState("");
  const [schedulePrompt, setSchedulePrompt] = useState("");
  const [scheduleResponse, setScheduleResponse] = useState("");
  const [schedulePreview, setSchedulePreview] = useState<NoteAiSchedulePlan | null>(null);

  const reload = async (userId: string) => {
    const client = getSupabaseClient();
    const [nextProfile, nextSchedule, nextWritingProfile] = await Promise.all([
      loadNoteOperationProfile(client, userId),
      listNoteSchedule(client, userId),
      loadWritingProfile(client, userId),
    ]);
    setProfile(nextProfile);
    setSchedule(nextSchedule);
    setWritingProfile(nextWritingProfile);
    setSelectedAi(nextWritingProfile.preferredAi);
  };

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
        const { data: account, error: profileError } = await client
          .from("profiles")
          .select("id,status")
          .eq("id", user.id)
          .single();
        if (profileError || !account || account.id !== user.id || account.status !== "active") {
          throw new Error("activeアカウントを確認できません。");
        }
        await reload(user.id);
        if (active) setGate({ kind: "ready", userId: user.id });
      } catch (error) {
        if (active) setGate({ kind: "error", message: error instanceof Error ? error.message : "note運営を初期化できませんでした。" });
      }
    };
    void boot();
    return () => { active = false; };
  }, []);

  const groupedByDate = useMemo(() => {
    const map = new Map<string, NoteScheduleItem[]>();
    for (const item of schedule) {
      const list = map.get(item.scheduledDate) ?? [];
      list.push(item);
      map.set(item.scheduledDate, list);
    }
    return map;
  }, [schedule]);

  const saveProfile = async () => {
    if (gate.kind !== "ready" || !profile) return;
    setBusy(true);
    setMessage("");
    try {
      await saveNoteOperationProfile(getSupabaseClient(), profile);
      setMessage("note運営設定を保存しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const openAccountBuilderAi = async () => {
    if (gate.kind !== "ready" || !profile) return;
    setBusy(true);
    setMessage("");
    try {
      await saveNoteOperationProfile(getSupabaseClient(), profile);
      if (writingProfile && writingProfile.preferredAi !== selectedAi) {
        const saved = await saveWritingProfile(getSupabaseClient(), { ...writingProfile, preferredAi: selectedAi });
        setWritingProfile(saved);
      }
      const prompt = buildNoteAccountResearchPrompt(profile, selectedAi);
      setAccountPrompt(prompt);
      try {
        await navigator.clipboard.writeText(prompt);
        setMessage(`${AI_PROVIDER_LABELS[selectedAi]}用の最新調査プロンプトをコピーしました。AI側で貼り付けて実行してください。`);
      } catch {
        setMessage("クリップボードへコピーできなかったため、下のプロンプト欄からコピーしてください。");
      }
      launchAiApp(selectedAi);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI用アカウント構成プロンプトを作成できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const openScheduleBuilderAi = async () => {
    if (gate.kind !== "ready" || !profile) return;
    setBusy(true);
    setMessage("");
    try {
      await saveNoteOperationProfile(getSupabaseClient(), profile);
      if (writingProfile && writingProfile.preferredAi !== selectedAi) {
        const saved = await saveWritingProfile(getSupabaseClient(), { ...writingProfile, preferredAi: selectedAi });
        setWritingProfile(saved);
      }
      const prompt = buildNoteScheduleResearchPrompt(profile, selectedAi, targetMonth);
      setSchedulePrompt(prompt);
      setScheduleResponse("");
      setSchedulePreview(null);
      try {
        await navigator.clipboard.writeText(prompt);
        setMessage(`${AI_PROVIDER_LABELS[selectedAi]}用の月間運用リサーチプロンプトをコピーしました。AIのJSON回答をAASへ貼り付けてください。`);
      } catch {
        setMessage("クリップボードへコピーできなかったため、下のプロンプト欄からコピーしてください。");
      }
      launchAiApp(selectedAi);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "月間運用プロンプトを作成できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const previewAiSchedule = (text: string) => {
    setMessage("");
    try {
      const plan = parseNoteAiSchedulePlan(text, targetMonth);
      setScheduleResponse(text);
      setSchedulePreview(plan);
      setMessage(`${targetMonth.replace("-", "年")}月のAI運用案を読み込みました。内容を確認してからAASへ反映してください。`);
    } catch (error) {
      setSchedulePreview(null);
      setMessage(error instanceof Error ? error.message : "AIの運用スケジュールを読み込めませんでした。");
    }
  };

  const applyAiSchedule = async () => {
    if (gate.kind !== "ready" || !schedulePreview) return;
    setBusy(true);
    setMessage("");
    try {
      const client = getSupabaseClient();
      const next = await replaceNoteScheduleMonth(client, gate.userId, targetMonth, schedulePreview.schedule);
      setSchedule(next);
      setCalendarMonth(targetMonth);
      let historySaved = true;
      try {
        await saveNoteAiSchedulePlan(client, gate.userId, schedulePreview);
      } catch {
        historySaved = false;
      }
      setMessage(historySaved
        ? `${targetMonth.replace("-", "年")}月のAI運用スケジュールをAASへ反映しました。他の月の予定は変更していません。`
        : `${targetMonth.replace("-", "年")}月の予定は反映できましたが、AI調査メモだけ保存できませんでした。予定自体は利用できます。`);
      setTab("calendar");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI運用スケジュールを反映できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const importAiScheduleFile = async (file: File) => {
    try {
      const text = await file.text();
      previewAiSchedule(text);
    } catch {
      setMessage("AIスケジュールファイルを読み込めませんでした。");
    }
  };

  const changeStatus = async (item: NoteScheduleItem, done: boolean) => {
    if (gate.kind !== "ready" || !item.id) return;
    setBusy(true);
    try {
      await setNoteScheduleStatus(getSupabaseClient(), gate.userId, item.id, done ? "done" : "planned");
      setSchedule((current) => current.map((value) => value.id === item.id ? { ...value, status: done ? "done" : "planned" } : value));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "状態を更新できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const importFile = async (file: File) => {
    if (gate.kind !== "ready" || !profile) return;
    setBusy(true);
    setMessage("");
    try {
      const parsed = parseNoteOperationsImport(await file.text(), file.name);
      if (!parsed.schedule.length) throw new Error("読み込める予定がありません。");
      if (!window.confirm(parsed.schedule.length + "件の予定を読み込み、現在のスケジュールと入れ替えますか？")) return;
      const nextProfile = parsed.profile ? { ...profile, ...parsed.profile, userId: gate.userId, timezone: "Asia/Tokyo" } : profile;
      await saveNoteOperationProfile(getSupabaseClient(), nextProfile);
      const nextSchedule = await replaceNoteSchedule(getSupabaseClient(), gate.userId, parsed.schedule);
      setProfile(nextProfile);
      setSchedule(nextSchedule);
      setMessage("運営データを読み込みました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ファイルを読み込めませんでした。");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (gate.kind !== "ready") return;
    let active = true;
    void loadNoteAiSchedulePlan(getSupabaseClient(), gate.userId, targetMonth).then(
      (plan) => {
        if (active && plan) setSchedulePreview(plan);
      },
      () => {
        // Previous plan history is optional. Schedule browsing must still work.
      },
    );
    return () => { active = false; };
  }, [gate, targetMonth]);

  if (gate.kind !== "ready" || !profile) {
    return (
      <div className="note-ops-shell">
        <AasReferenceHeader />
        <main className="note-ops-gate">
          <p className="eyebrow">NOTE OPERATIONS</p>
          <h1>note運営アシスタント</h1>
          {gate.kind === "loading" && <p>アカウントと運営データを確認しています…</p>}
          {gate.kind === "signed_out" && <p>先にログインしてください。</p>}
          {gate.kind === "error" && <p>{gate.message}</p>}
          <Link href="/">← ホームへ戻る</Link>
        </main>
      </div>
    );
  }

  return (
    <div className="note-ops-shell">
      <AasReferenceHeader />
      <main className="note-ops-main">
        <header className="note-ops-head">
          <div>
            <p className="eyebrow">NOTE OPERATIONS</p>
            <h1>note運営アシスタント</h1>
            <p>アカウント準備からプロフィール、無料・有料noteの運用予定、毎日のToDoまでAASで管理します。</p>
          </div>
          <Link href="/">ホームへ</Link>
        </header>

        <div className="note-ops-security-note">
          <strong>noteのログイン情報は保存しません</strong>
          <span>AASはnoteのパスワード、Cookie、認証コード、アクセストークンを入力・保存しません。運営計画と公開予定だけを管理します。</span>
        </div>

        <nav className="note-ops-tabs" aria-label="note運営メニュー">
          <button className={tab === "start" ? "active" : ""} onClick={() => setTab("start")}>1. はじめ方</button>
          <button className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}>2. プロフィール</button>
          <button className={tab === "plan" ? "active" : ""} onClick={() => setTab("plan")}>3. 運用プラン</button>
          <button className={tab === "calendar" ? "active" : ""} onClick={() => setTab("calendar")}>4. カレンダー</button>
        </nav>

        {message && <div className="route-notice note-ops-message">{message}</div>}

        {tab === "start" && (
          <section className="note-ops-panel">
            <div className="note-ops-section-head">
              <div><span>START GUIDE</span><h2>noteを始める順番</h2></div>
              <a href={NOTE_HOME_URL} target="_blank" rel="noreferrer">note公式を開く ↗</a>
            </div>
            <div className="note-start-steps">
              <article><b>1</b><div><strong>noteアカウントを作る</strong><p>note公式を開き、画面の案内に沿ってアカウントを作成します。AASへnoteのパスワードを入力する必要はありません。</p></div></article>
              <article><b>2</b><div><strong>表示名・アイコン・発信テーマを決める</strong><p>誰に何を届けるアカウントかを先に決めると、プロフィールと記事テーマをそろえやすくなります。</p></div></article>
              <article><b>3</b><div><strong>プロフィール文と自己紹介記事を準備</strong><p>noteでは投稿した記事をプロフィールとして表示できる仕組みがあります。AASでは入力した事実だけから下書きを作ります。</p><a href={NOTE_PROFILE_OFFICIAL} target="_blank" rel="noreferrer">note公式のプロフィール案内 ↗</a></div></article>
              <article><b>4</b><div><strong>無料noteで読者の入口を作る</strong><p>AASおすすめとして、最初は無料記事を軸に投稿習慣とテーマの反応を確認します。これは成果を保証するものではありません。</p></div></article>
              <article><b>5</b><div><strong>必要に応じて有料noteを組み合わせる</strong><p>有料記事は価格と無料で読める範囲をnote側で設定します。</p><a href={NOTE_PAID_OFFICIAL} target="_blank" rel="noreferrer">note公式の有料記事案内 ↗</a></div></article>
              <article><b>6</b><div><strong>AASカレンダーで継続する</strong><p>投稿日時・無料/有料・週次振り返りをAASに保存します。AASカレンダー自体はプランを問わず使えます。note側の予約投稿はnoteプレミアム / note pro向け機能として案内されています。</p><a href={NOTE_RESERVATION_OFFICIAL} target="_blank" rel="noreferrer">note公式の予約投稿案内 ↗</a></div></article>
            </div>
            <div className="note-ready-checks">
              <label><input type="checkbox" checked={profile.accountReady} onChange={(event) => setProfile({ ...profile, accountReady: event.target.checked })} /> noteアカウントの作成が完了した</label>
              <label><input type="checkbox" checked={profile.profileReady} onChange={(event) => setProfile({ ...profile, profileReady: event.target.checked })} /> プロフィールの準備が完了した</label>
            </div>
            <button className="primary-action" disabled={busy} onClick={() => void saveProfile()}>進捗を保存</button>
          </section>
        )}

        {tab === "profile" && (
          <section className="note-ops-panel">
            <div className="note-ops-section-head"><div><span>PROFILE BUILDER</span><h2>初心者向け・選ぶだけプロフィール設計</h2></div></div>
            <p className="note-ops-hint">まずプルダウンで近いものを選ぶだけで大丈夫です。「その他」を選んだ場合だけ自由入力できます。経験・資格・実績は、実際に事実として書ける内容だけ使用します。</p>

            <div className="note-profile-choice-grid">
              <label><span>① どのジャンルで運営したい？</span><select value={profile.accountGenre} onChange={(event) => setProfile({ ...profile, accountGenre: event.target.value as NoteOperationProfile["accountGenre"] })}>{NOTE_ACCOUNT_GENRES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>{profile.accountGenre === "other" && <input value={profile.customGenre} maxLength={120} onChange={(event) => setProfile({ ...profile, customGenre: event.target.value })} placeholder="運営したいジャンルを入力" />}</label>
              <label><span>② どんなアカウントにしたい？</span><select value={profile.accountStyle} onChange={(event) => setProfile({ ...profile, accountStyle: event.target.value as NoteOperationProfile["accountStyle"] })}>{NOTE_ACCOUNT_STYLES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>{profile.accountStyle === "other" && <input value={profile.customAccountStyle} maxLength={180} onChange={(event) => setProfile({ ...profile, customAccountStyle: event.target.value })} placeholder="例：失敗談も含めて一緒に学ぶアカウント" />}</label>
              <label><span>③ 主に誰に届けたい？</span><select value={profile.audiencePreset} onChange={(event) => setProfile({ ...profile, audiencePreset: event.target.value as NoteOperationProfile["audiencePreset"] })}>{NOTE_AUDIENCE_PRESETS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>{profile.audiencePreset === "other" && <input value={profile.customAudience} maxLength={300} onChange={(event) => setProfile({ ...profile, customAudience: event.target.value })} placeholder="届けたい読者を入力" />}</label>
              <label><span>④ 文章の雰囲気は？</span><select value={profile.tonePreset} onChange={(event) => setProfile({ ...profile, tonePreset: event.target.value as NoteOperationProfile["tonePreset"] })}>{NOTE_TONE_PRESETS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>{profile.tonePreset === "other" && <input value={profile.customTone} maxLength={120} onChange={(event) => setProfile({ ...profile, customTone: event.target.value })} placeholder="希望する雰囲気を入力" />}</label>
              <label><span>⑤ 収益化はどうしたい？</span><select value={profile.monetizationStyle} onChange={(event) => setProfile({ ...profile, monetizationStyle: event.target.value as NoteOperationProfile["monetizationStyle"] })}>{NOTE_MONETIZATION_STYLES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>{profile.monetizationStyle === "other" && <input value={profile.customMonetizationStyle} maxLength={180} onChange={(event) => setProfile({ ...profile, customMonetizationStyle: event.target.value })} placeholder="希望する収益化方針を入力" />}</label>
              <label><span>⑥ 運営の目的は？</span><select value={profile.operationGoal} onChange={(event) => setProfile({ ...profile, operationGoal: event.target.value as NoteOperationProfile["operationGoal"] })}>{NOTE_OPERATION_GOALS.map((goal) => <option key={goal.value} value={goal.value}>{goal.label}</option>)}</select></label>
            </div>

            <details className="note-profile-advanced">
              <summary>必要な人だけ：自由入力で詳しく設定</summary>
              <div className="note-profile-grid">
                <label><span>希望する表示名（任意）</span><input value={profile.noteDisplayName} maxLength={120} onChange={(event) => setProfile({ ...profile, noteDisplayName: event.target.value })} placeholder="未定でもOK" /></label>
                <label><span>読者の補足（任意）</span><input value={profile.targetReader} maxLength={600} onChange={(event) => setProfile({ ...profile, targetReader: event.target.value })} placeholder="例：AIをこれから使う30代の会社員" /></label>
                <label className="full"><span>扱いたいテーマ・キーワード（任意）</span><textarea value={profile.mainTopics.join("\n")} onChange={(event) => setProfile({ ...profile, mainTopics: event.target.value.split(/[\n,、]/).map((value) => value.trim()).filter(Boolean).slice(0, 12) })} placeholder={"例：ChatGPT活用\nAI副業\n初心者向け手順"} /></label>
                <label className="full"><span>事実として書ける経験・資格・背景（任意）</span><textarea value={profile.experienceNote} maxLength={1200} onChange={(event) => setProfile({ ...profile, experienceNote: event.target.value })} placeholder="未入力でもOK。AIが架空の経歴を追加することはありません。" /></label>
              </div>
            </details>

            <div className="note-ai-account-builder">
              <div className="note-ai-builder-head">
                <div><span>AI ACCOUNT DESIGN</span><h3>よく使うAIでアカウント構成候補を作る</h3><p>選んだ条件をもとに、実行時点のnote公式情報と直近トレンドをWeb検索してから3つの構成案を作るプロンプトです。</p></div>
              </div>
              <div className="note-ai-provider-grid">
                {(["chatgpt","gemini","claude"] as AiProvider[]).map((provider) => (
                  <button type="button" key={provider} className={selectedAi === provider ? "active" : ""} onClick={() => setSelectedAi(provider)}>
                    <strong>{AI_PROVIDER_LABELS[provider]}</strong>
                    <small>{writingProfile?.preferredAi === provider ? "現在のよく使うAI" : "選択する"}</small>
                  </button>
                ))}
              </div>
              <div className="note-ai-research-note">
                <strong>毎回、最新情報を調査</strong>
                <span>note公式の最新変更・創作カレンダー・開催中/直近の企画・選択ジャンルの直近90日/12か月トレンドを確認し、出典URLと日付を付けるよう指示します。検索できない場合は最新情報を作らないルールです。</span>
              </div>
              <button className="primary-action note-ai-build-button" type="button" disabled={busy} onClick={() => void openAccountBuilderAi()}>
                {busy ? "準備中…" : `${AI_PROVIDER_LABELS[selectedAi]}で最新情報から構成候補を作る`}
              </button>
              <p className="note-data-note">プロンプトをクリップボードへコピーして選択したAIを開きます。AASからAIサービスへAPIキーやnoteログイン情報は送信しません。</p>
              {accountPrompt && <details className="note-account-prompt"><summary>AIへ渡すプロンプトを確認・コピー</summary><textarea readOnly value={accountPrompt} rows={18} onFocus={(event) => event.currentTarget.select()} /></details>}
            </div>

            <div className="note-local-profile-draft">
              <strong>AIを使わない簡易プロフィール案</strong>
              <div className="note-profile-actions">
                <button type="button" onClick={() => setProfile({ ...profile, bioDraft: buildNoteProfileDraft(profile) })}>入力内容だけで下書きを作る</button>
                <button className="primary-action" type="button" disabled={busy} onClick={() => void saveProfile()}>設定をAASに保存</button>
              </div>
              {profile.bioDraft && <label className="note-profile-draft-field"><span>プロフィール文の下書き</span><textarea value={profile.bioDraft} maxLength={1200} onChange={(event) => setProfile({ ...profile, bioDraft: event.target.value })} /></label>}
            </div>
          </section>
        )}

        {tab === "plan" && (
          <section className="note-ops-panel">
            <div className="note-ops-section-head"><div><span>AI MONTHLY OPERATION PLAN</span><h2>AIに1か月の運用スケジュールを決めてもらう</h2></div></div>
            <p className="note-ops-hint">開始日ではなく「対象月」で計画します。投稿回数、有料noteの頻度、1日の投稿回数、曜日、時間帯、記事テーマまでChatGPT / Gemini / Claudeが最新情報を調査して提案します。時間や頻度は成果保証ではなく、検証するための運用仮説として扱います。</p>

            <div className="note-ai-month-controls">
              <label>
                <span>① 計画したい月</span>
                <input type="month" min={currentJstMonth()} value={targetMonth} onChange={(event) => { setTargetMonth(event.target.value || currentJstMonth()); setScheduleResponse(""); setSchedulePreview(null); }} />
              </label>
              <div>
                <span>② リサーチに使うAI</span>
                <div className="note-ai-provider-grid">
                  {(["chatgpt","gemini","claude"] as AiProvider[]).map((provider) => (
                    <button type="button" key={provider} className={selectedAi === provider ? "active" : ""} onClick={() => setSelectedAi(provider)}>
                      <strong>{AI_PROVIDER_LABELS[provider]}</strong>
                      <small>{writingProfile?.preferredAi === provider ? "現在のよく使うAI" : "選択する"}</small>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="note-ai-decision-list">
              <strong>AIに決めてもらう内容</strong>
              <div>
                <span>週に何回投稿するか</span><span>1日に何回まで投稿するか</span><span>無料note / 有料noteの比率</span>
                <span>有料noteを週何回にするか</span><span>投稿する曜日・時間帯</span><span>その月の記事テーマ</span>
                <span>トレンド記事と長期記事の配分</span><span>SNS告知・週次振り返り</span>
              </div>
            </div>

            <div className="note-ai-research-note">
              <strong>最新情報を毎回調査</strong>
              <span>note公式、創作カレンダー、現在の企画・お題、カテゴリ/おすすめの仕組み、選択ジャンルの直近30日・90日・12か月を確認し、出典URLと日付をJSONへ入れるよう指示します。検索できない場合は最新情報を作らないルールです。</span>
            </div>

            <button type="button" className="primary-action note-ai-build-button" disabled={busy} onClick={() => void openScheduleBuilderAi()}>
              {busy ? "準備中…" : `${AI_PROVIDER_LABELS[selectedAi]}で${targetMonth.replace("-", "年")}月をリサーチする`}
            </button>

            {schedulePrompt && <details className="note-account-prompt"><summary>AIへ渡す月間スケジュール用プロンプトを確認</summary><textarea readOnly value={schedulePrompt} rows={18} onFocus={(event) => event.currentTarget.select()} /></details>}

            <div className="note-ai-import-box">
              <div><strong>③ AIのJSON回答をAASへ読み込む</strong><small>AIの回答全体を貼り付けるか、JSONファイルをアップロードしてください。</small></div>
              <textarea value={scheduleResponse} onChange={(event) => setScheduleResponse(event.target.value)} placeholder={'{"schema":"aas-note-schedule-v2", ...}'} rows={10} />
              <div className="note-data-actions">
                <button type="button" disabled={!scheduleResponse.trim()} onClick={() => previewAiSchedule(scheduleResponse)}>読み込み・確認</button>
                <label className="note-import-button">JSONファイルを読み込む<input type="file" accept=".json,.txt,application/json,text/plain" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importAiScheduleFile(file); event.currentTarget.value = ""; }} /></label>
              </div>
            </div>

            {schedulePreview && (
              <div className="note-ai-plan-preview">
                <div className="note-ops-section-head"><div><span>RESEARCH PREVIEW</span><h2>{schedulePreview.targetMonth.replace("-", "年")}月 AI運用案</h2></div></div>
                <div className="note-plan-stats">
                  <article><small>平均投稿/週</small><strong>{schedulePreview.recommendation.postsPerWeek}</strong></article>
                  <article><small>有料note/週</small><strong>{schedulePreview.recommendation.paidPostsPerWeek}</strong></article>
                  <article><small>無料 / 有料</small><strong>{schedulePreview.recommendation.freePosts} / {schedulePreview.recommendation.paidPosts}</strong></article>
                  <article><small>1日最大</small><strong>{schedulePreview.recommendation.maxPostsPerDay}</strong></article>
                </div>

                {schedulePreview.researchSummary && <div className="note-ai-plan-text"><strong>最新動向</strong><p>{schedulePreview.researchSummary}</p></div>}
                {schedulePreview.strategySummary && <div className="note-ai-plan-text"><strong>今月の運用方針</strong><p>{schedulePreview.strategySummary}</p></div>}
                {schedulePreview.recommendation.reason && <div className="note-ai-plan-text"><strong>この投稿頻度にした理由</strong><p>{schedulePreview.recommendation.reason}</p></div>}

                {schedulePreview.warnings.length > 0 && <div className="note-ai-plan-warnings"><strong>AASの確認事項</strong>{schedulePreview.warnings.map((warning) => <p key={warning}>• {warning}</p>)}</div>}

                <div className="note-ai-plan-sample">
                  <strong>予定プレビュー（{schedulePreview.schedule.length}件）</strong>
                  {schedulePreview.schedule.slice(0, 12).map((item, index) => (
                    <div key={item.scheduledDate + item.scheduledTime + index}><span>{item.scheduledDate} {item.scheduledTime}</span><b>{NOTE_SCHEDULE_TYPE_LABELS[item.itemType]}</b><em>{item.title}</em></div>
                  ))}
                  {schedulePreview.schedule.length > 12 && <small>ほか {schedulePreview.schedule.length - 12}件。反映後はカレンダーで全件確認できます。</small>}
                </div>

                {schedulePreview.sources.length > 0 && <details className="note-ai-plan-sources"><summary>AIが参照した情報源（{schedulePreview.sources.length}件）</summary>{schedulePreview.sources.map((source) => <div key={source.url}><strong>{source.title || "出典"}</strong><span>{source.publishedAt}</span><code>{source.url}</code>{source.whyUsed && <p>{source.whyUsed}</p>}</div>)}</details>}

                <button type="button" className="primary-action note-ai-apply-button" disabled={busy} onClick={() => void applyAiSchedule()}>
                  この月のAASスケジュールに反映
                </button>
                <p className="note-data-note">対象月だけを入れ替えます。他の月の予定は残ります。AIの調査概要と根拠もAASへ保存するため、後から「なぜこの頻度にしたか」を確認できます。</p>
              </div>
            )}

            <details className="note-profile-advanced note-schedule-backup">
              <summary>バックアップ・従来形式の読み込み</summary>
              <div className="note-data-actions">
                <button type="button" disabled={!schedule.length} onClick={() => downloadText("aas-note-schedule.csv", exportNoteScheduleCsv(schedule), "text/csv;charset=utf-8")}>現在の予定をCSV保存</button>
                <button type="button" disabled={!schedule.length} onClick={() => downloadText("aas-note-operations.json", exportNoteOperationsJson(profile, schedule), "application/json;charset=utf-8")}>AAS運営データをJSON保存</button>
                <label className="note-import-button">従来JSON/CSVを読み込む<input type="file" accept=".json,.csv,application/json,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.currentTarget.value = ""; }} /></label>
              </div>
            </details>
          </section>
        )}

        {tab === "calendar" && (
          <section className="note-ops-panel">
            <div className="note-calendar-head">
              <button onClick={() => setCalendarMonth((value) => moveMonth(value, -1))}>←</button>
              <div><span>CALENDAR</span><h2>{calendarMonth.replace("-", "年")}月</h2></div>
              <button onClick={() => setCalendarMonth((value) => moveMonth(value, 1))}>→</button>
            </div>
            <div className="note-calendar-weekdays">{["日","月","火","水","木","金","土"].map((day) => <span key={day}>{day}</span>)}</div>
            <div className="note-calendar-grid">
              {monthCells(calendarMonth).map((cell) => {
                const items = groupedByDate.get(cell.date) ?? [];
                return (
                  <article key={cell.date} className={(cell.current ? "" : "outside ") + (cell.date === todayJstDateKey() ? "today" : "")}>
                    <strong>{Number(cell.date.slice(-2))}</strong>
                    <div>{items.map((item, index) => <span key={item.id ?? item.scheduledDate + item.scheduledTime + index} className={typeClass(item)} title={item.title}>{item.scheduledTime} {NOTE_SCHEDULE_TYPE_LABELS[item.itemType]}</span>)}</div>
                  </article>
                );
              })}
            </div>

            <div className="note-schedule-list">
              <h3>予定一覧</h3>
              {schedule.length === 0 ? <p>まだ予定がありません。「運用プラン」から作成してください。</p> : schedule.slice(0, 120).map((item, index) => (
                <article key={item.id ?? item.scheduledDate + item.scheduledTime + index} className={item.status === "done" ? "done" : ""}>
                  <div className={"note-schedule-type " + typeClass(item)}>{NOTE_SCHEDULE_TYPE_LABELS[item.itemType]}</div>
                  <div>
                    <small>{item.scheduledDate} {item.scheduledTime}</small>
                    <strong>{item.title}</strong>
                    {item.theme && <span>テーマ：{item.theme}</span>}
                  </div>
                  <div className="note-schedule-actions">
                    {(item.itemType === "free_note" || item.itemType === "paid_note") && <Link href={createHref(item)}>この記事を作る</Link>}
                    {item.id && <button disabled={busy} onClick={() => void changeStatus(item, item.status !== "done")}>{item.status === "done" ? "未完了に戻す" : "完了"}</button>}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
