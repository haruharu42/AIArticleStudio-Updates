"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  adminCreateAppRelease,
  adminListAppReleases,
  adminPublishAppRelease,
  adminRollbackAppRelease,
  type AdminAppRelease,
  type AdminReleaseSnapshot,
} from "@/lib/app-release";
import { getSupabaseClient } from "@/lib/supabase";

type FormState = {
  version: string;
  title: string;
  notes: string;
  updateKind: "optional" | "required";
};

const EMPTY_FORM: FormState = {
  version: "",
  title: "",
  notes: "",
  updateKind: "optional",
};

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("ja-JP");
}

function statusLabel(status: AdminAppRelease["status"]): string {
  if (status === "candidate") return "管理者テスト中";
  if (status === "published") return "公開済み";
  if (status === "rolled_back") return "ロールバック済み";
  return "終了";
}

export function AdminReleasePage() {
  const [snapshot, setSnapshot] = useState<AdminReleaseSnapshot | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const reload = async () => {
    const next = await adminListAppReleases(getSupabaseClient());
    setSnapshot(next);
  };

  useEffect(() => {
    let active = true;
    void adminListAppReleases(getSupabaseClient())
      .then((next) => { if (active) setSnapshot(next); })
      .catch(() => { if (active) setError("リリース情報を取得できませんでした。"); });
    return () => { active = false; };
  }, []);

  const current = useMemo(
    () => snapshot?.releases.find((release) => release.id === snapshot.channel.current_release_id) ?? null,
    [snapshot],
  );
  const candidate = useMemo(
    () => snapshot?.releases.find((release) => release.id === snapshot.channel.candidate_release_id) ?? null,
    [snapshot],
  );

  const createCandidate = async () => {
    if (busy) return;
    const version = form.version.trim();
    const title = form.title.trim();
    if (!/^\d+\.\d+\.\d+([+-][0-9A-Za-z.-]+)?$/.test(version)) {
      setError("バージョンは 1.2.3 の形式で入力してください。");
      return;
    }
    if (!title) {
      setError("アップデート名を入力してください。");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await adminCreateAppRelease(getSupabaseClient(), {
        version,
        title,
        notes: form.notes.trim(),
        updateKind: form.updateKind,
        buildKey: "pwa-" + version.replace(/[^0-9A-Za-z.-]/g, "-"),
      });
      setSnapshot(next);
      setForm(EMPTY_FORM);
      setMessage("管理者テスト版として登録しました。一般ユーザーにはまだ公開されていません。");
    } catch {
      setError("候補版を登録できませんでした。同じバージョンがないか確認してください。");
    } finally {
      setBusy(false);
    }
  };

  const publish = async (release: AdminAppRelease) => {
    if (busy) return;
    if (!window.confirm("v" + release.version + " を一般ユーザー向けアップデートとして公開しますか？\nユーザー側には更新通知が表示され、更新ボタンを押した人から反映されます。")) return;

    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await adminPublishAppRelease(getSupabaseClient(), release.id);
      setSnapshot(next);
      setMessage("アップデートを公開しました。ユーザー側へ更新通知が表示されます。");
    } catch {
      setError("アップデートを公開できませんでした。候補版の状態を確認してください。");
    } finally {
      setBusy(false);
    }
  };

  const rollback = async (release: AdminAppRelease) => {
    if (busy || release.id === snapshot?.channel.current_release_id) return;
    if (!window.confirm("公開版を v" + release.version + " へ戻しますか？\n現在版へ更新済みのユーザーも安全のためこの版へ戻します。")) return;

    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await adminRollbackAppRelease(getSupabaseClient(), release.id);
      setSnapshot(next);
      setMessage("公開版をロールバックしました。");
    } catch {
      setError("ロールバックできませんでした。公開済みの過去版だけを選択できます。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="release-admin-page">
      <header className="release-admin-head">
        <div>
          <p className="eyebrow">RELEASE CONTROL</p>
          <h1>アップデート管理</h1>
          <p>変更はまず管理者テスト版として確認し、問題がなければユーザーへ更新通知を公開します。</p>
        </div>
        <nav>
          <Link href="/admin">管理ダッシュボード</Link>
          <Link href="/">ホーム</Link>
        </nav>
      </header>

      {message && <p className="route-notice">{message}</p>}
      {error && <p className="route-notice error">{error}</p>}

      <section className="release-admin-summary">
        <article>
          <span>現在の公開版</span>
          <strong>{current ? "v" + current.version : "-"}</strong>
          <small>{current?.title ?? "未設定"}</small>
        </article>
        <article>
          <span>管理者テスト版</span>
          <strong>{candidate ? "v" + candidate.version : "なし"}</strong>
          <small>{candidate ? candidate.title : "候補版を登録すると管理者だけで確認できます。"}</small>
        </article>
        <article>
          <span>更新方式</span>
          <strong>{candidate?.update_kind === "required" ? "必須" : candidate ? "任意" : "-"}</strong>
          <small>通常は任意、互換性・安全性に関わる場合のみ必須を使用します。</small>
        </article>
      </section>

      <section className="release-admin-panel">
        <div className="admin-panel-heading">
          <div>
            <p className="eyebrow">CANDIDATE</p>
            <h2>管理者テスト版を登録</h2>
          </div>
        </div>
        <p className="trial-admin-note">
          登録した時点では一般ユーザーへは反映されません。管理者アカウントでは候補版が有効になり、確認後に「アップデートを公開」を押します。
        </p>

        <div className="release-admin-form">
          <label className="editor-field">
            <span>バージョン</span>
            <input
              value={form.version}
              onChange={(event) => setForm((value) => ({ ...value, version: event.target.value }))}
              placeholder="例: 0.1.1"
              autoComplete="off"
            />
          </label>
          <label className="editor-field">
            <span>アップデート名</span>
            <input
              value={form.title}
              onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))}
              placeholder="例: 記事作成UI改善"
              maxLength={120}
            />
          </label>
          <label className="editor-field release-admin-notes">
            <span>ユーザーへ表示する更新内容</span>
            <textarea
              value={form.notes}
              onChange={(event) => setForm((value) => ({ ...value, notes: event.target.value }))}
              placeholder="変更点を分かりやすく入力してください。"
              maxLength={4000}
            />
          </label>
          <label className="editor-field">
            <span>更新方式</span>
            <select
              value={form.updateKind}
              onChange={(event) => setForm((value) => ({ ...value, updateKind: event.target.value as FormState["updateKind"] }))}
            >
              <option value="optional">任意アップデート</option>
              <option value="required">必須アップデート</option>
            </select>
          </label>
        </div>

        <button className="primary-action" type="button" disabled={busy} onClick={() => void createCandidate()}>
          {busy ? "処理中…" : "管理者テスト版として登録"}
        </button>
      </section>

      {candidate && (
        <section className="release-admin-panel candidate">
          <div>
            <p className="eyebrow">ADMIN PREVIEW</p>
            <h2>v{candidate.version} を管理者確認中</h2>
            <p>{candidate.title}</p>
            {candidate.notes && <pre>{candidate.notes}</pre>}
          </div>
          <div className="release-admin-publish">
            <span className={candidate.update_kind === "required" ? "required" : ""}>
              {candidate.update_kind === "required" ? "必須アップデート" : "任意アップデート"}
            </span>
            <button className="primary-action" type="button" disabled={busy} onClick={() => void publish(candidate)}>
              アップデートを公開
            </button>
          </div>
        </section>
      )}

      <section className="release-admin-panel">
        <div className="admin-panel-heading">
          <div>
            <p className="eyebrow">HISTORY</p>
            <h2>リリース履歴</h2>
          </div>
        </div>

        <div className="release-history-list">
          {(snapshot?.releases ?? []).map((release) => {
            const isCurrent = release.id === snapshot?.channel.current_release_id;
            return (
              <article key={release.id} className={isCurrent ? "current" : ""}>
                <div className="release-history-version">
                  <strong>v{release.version}</strong>
                  <span>{isCurrent ? "現在の公開版" : statusLabel(release.status)}</span>
                </div>
                <div>
                  <strong>{release.title}</strong>
                  <small>{formatDate(release.published_at ?? release.created_at)} ・ 利用中 {release.adopted_users}人</small>
                  {release.notes && <p>{release.notes}</p>}
                </div>
                <div className="release-history-actions">
                  {release.status === "published" && !isCurrent && (
                    <button type="button" disabled={busy} onClick={() => void rollback(release)}>この版へ戻す</button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
