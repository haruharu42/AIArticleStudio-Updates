"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  adminCreateAppRelease,
  adminListAppReleases,
  adminPromoteAppReleaseToTesters,
  adminPublishAppRelease,
  adminRollbackAppRelease,
  adminSetAppReleaseTester,
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
  const [testerAasId, setTesterAasId] = useState("AAS-000002");

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

  const promoteToTesters = async (release: AdminAppRelease) => {
    if (busy) return;
    if (!window.confirm("v" + release.version + " を指定した一般ユーザーテスターへ反映しますか？\n他の一般ユーザーにはまだ公開されません。")) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await adminPromoteAppReleaseToTesters(getSupabaseClient(), release.id);
      setSnapshot(next);
      setMessage("第2段階へ進めました。指定テスターだけが候補版を確認できます。");
    } catch {
      setError("テスター確認段階へ進められませんでした。テスター設定と候補版の状態を確認してください。");
    } finally {
      setBusy(false);
    }
  };

  const setTester = async (aasUserId: string, enabled: boolean) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await adminSetAppReleaseTester(getSupabaseClient(), aasUserId, enabled);
      setSnapshot(next);
      if (enabled) setTesterAasId("");
      setMessage(enabled ? aasUserId + " を一般ユーザーテスターに設定しました。" : aasUserId + " のテスター指定を解除しました。");
    } catch {
      setError("テスター設定を更新できませんでした。activeな一般ユーザーのAAS IDを確認してください。");
    } finally {
      setBusy(false);
    }
  };

  const publish = async (release: AdminAppRelease) => {
    if (busy) return;
    if (!window.confirm("第1段階・第2段階の確認済みとして、v" + release.version + " を全一般ユーザー向けに公開承認しますか？\nこの操作後に一般ユーザー向け安定版へ同じexact SHAをデプロイする運用です。")) return;

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
          <p>①管理者確認 → ②指定した一般ユーザーテスター確認 → ③全一般ユーザー公開の3段階で進めます。</p>
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
          <span>候補版の確認段階</span>
          <strong>{candidate ? "v" + candidate.version : "なし"}</strong>
          <small>{candidate ? (snapshot?.channel.candidate_stage === "tester" ? "第2段階：指定テスター確認中" : "第1段階：管理者確認中") : "候補版を登録すると管理者だけで確認できます。"}</small>
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
          登録した時点では一般ユーザーへは反映されません。まず管理者だけで確認し、問題がなければ第2段階として指定テスターへ反映します。第2段階を通過するまで全体公開はDB側でも禁止します。
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

      <section className="release-admin-panel">
        <div className="admin-panel-heading">
          <div>
            <p className="eyebrow">TEST USERS</p>
            <h2>一般ユーザーテスター</h2>
          </div>
        </div>
        <p className="trial-admin-note">管理者権限へ変更せず、一般ユーザーのまま候補版を確認するアカウントです。現在の既定テスターは AAS-000002 です。</p>
        <div className="release-admin-form">
          <label className="editor-field">
            <span>AASユーザーID</span>
            <input value={testerAasId} onChange={(event) => setTesterAasId(event.target.value)} placeholder="AAS-000002" />
          </label>
        </div>
        <button type="button" disabled={busy || !testerAasId.trim()} onClick={() => void setTester(testerAasId.trim(), true)}>テスターに追加</button>
        <div className="release-history-list">
          {(snapshot?.testers ?? []).filter((tester) => tester.enabled).map((tester) => (
            <article key={tester.aas_user_id}>
              <div className="release-history-version"><strong>{tester.aas_user_id}</strong><span>一般ユーザー</span></div>
              <div><strong>候補版テスター</strong><small>指定更新: {formatDate(tester.updated_at)}</small></div>
              <div className="release-history-actions"><button type="button" disabled={busy} onClick={() => void setTester(tester.aas_user_id, false)}>指定解除</button></div>
            </article>
          ))}
        </div>
      </section>

      {candidate && (
        <section className="release-admin-panel candidate">
          <div>
            <p className="eyebrow">{snapshot?.channel.candidate_stage === "tester" ? "USER TEST PREVIEW" : "ADMIN PREVIEW"}</p>
            <h2>
              {snapshot?.channel.candidate_stage === "tester"
                ? `v${candidate.version} を指定テスター確認中`
                : `v${candidate.version} を管理者確認中`}
            </h2>
            <p>{candidate.title}</p>
            {candidate.notes && <pre>{candidate.notes}</pre>}
          </div>
          <div className="release-admin-publish">
            <span className={candidate.update_kind === "required" ? "required" : ""}>
              {candidate.update_kind === "required" ? "必須アップデート" : "任意アップデート"}
            </span>
            {snapshot?.channel.candidate_stage === "tester" ? (
              <button className="primary-action" type="button" disabled={busy} onClick={() => void publish(candidate)}>
                第3段階：全一般ユーザーへ公開承認
              </button>
            ) : (
              <button className="primary-action" type="button" disabled={busy || !(snapshot?.testers ?? []).some((tester) => tester.enabled)} onClick={() => void promoteToTesters(candidate)}>
                第2段階：指定テスターへ反映
              </button>
            )}
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
