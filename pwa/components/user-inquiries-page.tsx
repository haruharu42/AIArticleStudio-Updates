"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useSharedAccessState } from "@/components/access-state-provider";
import {
  SUPPORT_CATEGORY_OPTIONS,
  SUPPORT_STATUS_LABELS,
  closeOwnSupportRequest,
  createSupportRequest,
  hasUnreadAdminReply,
  listMySupportRequests,
  listSupportMessages,
  markSupportRequestSeen,
  replySupportRequest,
  supportCategoryLabel,
  supportTicketCode,
  type SupportCategory,
  type SupportMessage,
  type SupportRequest,
} from "@/lib/support-center";
import { getSupabaseClient } from "@/lib/supabase";


function formatDate(value: string): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function UserInquiriesPage() {
  const { state } = useSharedAccessState();
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [category, setCategory] = useState<SupportCategory>("feature_request");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [listBusy, setListBusy] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const [message, setMessage] = useState("");

  const selected = useMemo(
    () => requests.find((request) => request.id === selectedId) ?? null,
    [requests, selectedId],
  );

  const loadRequests = async (userId: string) => {
    const client = getSupabaseClient();
    const next = await listMySupportRequests(client, userId);
    setRequests(next);
    if (selectedId && !next.some((request) => request.id === selectedId)) setSelectedId("");
    return next;
  };

  useEffect(() => {
    if (state.kind !== "ready") return;
    let active = true;
    queueMicrotask(() => {
      if (active) setListBusy(true);
    });
    void listMySupportRequests(getSupabaseClient(), state.profile.id).then(
      (items) => {
        if (active) {
          setRequests(items);
          setMessage("");
        }
      },
      (error) => {
        if (active) setMessage(error instanceof Error ? error.message : "問い合わせ履歴を読み込めませんでした。");
      },
    ).finally(() => {
      if (active) setListBusy(false);
    });
    return () => { active = false; };
  }, [state]);

  useEffect(() => {
    if (!selectedId || state.kind !== "ready") return;
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setDetailBusy(true);
        setMessage("");
      }
    });
    const loadDetail = async () => {
      try {
        const client = getSupabaseClient();
        await markSupportRequestSeen(client, selectedId);
        const nextMessages = await listSupportMessages(client, selectedId);
        const nextRequests = await listMySupportRequests(client, state.profile.id);
        if (!active) return;
        setMessages(nextMessages);
        setRequests(nextRequests);
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : "問い合わせを読み込めませんでした。");
      } finally {
        if (active) setDetailBusy(false);
      }
    };
    void loadDetail();
    return () => { active = false; };
  }, [selectedId, state]);

  const submit = async () => {
    if (state.kind !== "ready") return;
    setBusy(true);
    setMessage("");
    try {
      const client = getSupabaseClient();
      const id = await createSupportRequest(client, { category, subject, message: body });
      setSubject("");
      setBody("");
      const next = await listMySupportRequests(client, state.profile.id);
      setRequests(next);
      setSelectedId(id);
      setMessage(`問い合わせを受け付けました。受付番号: ${supportTicketCode(id)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "問い合わせを送信できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async () => {
    if (!selected || state.kind !== "ready") return;
    setBusy(true);
    setMessage("");
    try {
      const client = getSupabaseClient();
      await replySupportRequest(client, selected.id, reply);
      setReply("");
      const [nextMessages, nextRequests] = await Promise.all([
        listSupportMessages(client, selected.id),
        listMySupportRequests(client, state.profile.id),
      ]);
      setMessages(nextMessages);
      setRequests(nextRequests);
      setMessage("追記を送信しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "追記を送信できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const closeRequest = async () => {
    if (!selected || state.kind !== "ready") return;
    if (!window.confirm("この問い合わせを終了しますか？ 終了後は追記できません。")) return;
    setBusy(true);
    setMessage("");
    try {
      const client = getSupabaseClient();
      await closeOwnSupportRequest(client, selected.id);
      await loadRequests(state.profile.id);
      setMessage("問い合わせを終了しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "問い合わせを終了できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="creator-page support-center-page">
      <header className="creator-head support-page-head">
        <div>
          <p className="eyebrow">SUPPORT</p>
          <h1>お問い合わせ</h1>
          <p>追加機能の要望、不具合、使い方、アカウント・購入関連などをAAS運営へ送信できます。</p>
        </div>
        <Link className="route-back" href="/">← ホーム</Link>
      </header>

      {state.kind === "loading" && <div className="route-notice">アカウントを確認しています…</div>}
      {state.kind === "unavailable" && <div className="route-notice error">問い合わせ機能へ接続できませんでした。</div>}
      {state.kind === "signed_out" && <div className="route-notice">ログインするとAAS内の問い合わせ機能を利用できます。</div>}
      {(state.kind === "pending" || state.kind === "entitlement_denied") && (
        <div className="route-notice">
          AAS内問い合わせを利用できる状態ではありません。アカウント承認・利用権を確認するか、
          <Link className="route-inline-link" href="/support">公開お問い合わせ案内</Link>
          をご確認ください。
        </div>
      )}
      {(state.kind === "suspended" || state.kind === "disabled") && (
        <div className="route-notice error">
          現在のアカウント状態ではAAS内問い合わせを利用できません。購入元の問い合わせ手段または
          <Link className="route-inline-link" href="/support">公開お問い合わせ案内</Link>
          をご確認ください。
        </div>
      )}

      {state.kind === "ready" && (
        <div className="support-layout">
          <section className="support-panel support-compose" aria-labelledby="support-compose-title">
            <div className="support-heading">
              <div><span>NEW REQUEST</span><h2 id="support-compose-title">新しい問い合わせ</h2></div>
              <small>問い合わせ内容は必須です</small>
            </div>

            <label className="support-field">
              <span>問い合わせ種類 <b>必須</b></span>
              <select value={category} onChange={(event) => setCategory(event.target.value as SupportCategory)}>
                {SUPPORT_CATEGORY_OPTIONS.map((option) => (
                  <option value={option.value} key={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="support-field">
              <span>件名 <small>任意・120文字まで</small></span>
              <input
                value={subject}
                maxLength={120}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="例: 記事作成画面で保存できない"
              />
            </label>

            <label className="support-field">
              <span>問い合わせ内容 <b>必須</b></span>
              <textarea
                value={body}
                maxLength={5000}
                onChange={(event) => setBody(event.target.value)}
                placeholder="発生したこと、期待していた動作、追加してほしい機能などを具体的に入力してください。"
              />
              <small>{body.length} / 5000</small>
            </label>

            <div className="support-safety-note">
              <strong>送信しないもの</strong>
              <span>パスワード、認証コード、アクセストークン、秘密鍵、カード番号、不要な第三者の個人情報。</span>
            </div>

            <button
              className="primary-action support-submit"
              type="button"
              disabled={busy || body.trim().length < 5}
              onClick={() => void submit()}
            >
              {busy ? "送信しています…" : "問い合わせを送信"}
            </button>
            <p className="support-limit-note">迷惑送信防止のため、新規問い合わせは1日10件までです。</p>
          </section>

          <section className="support-panel support-history" aria-labelledby="support-history-title">
            <div className="support-heading">
              <div><span>HISTORY</span><h2 id="support-history-title">問い合わせ履歴</h2></div>
              <small>{requests.length}件</small>
            </div>

            {listBusy ? (
              <p className="support-empty">履歴を読み込んでいます…</p>
            ) : requests.length === 0 ? (
              <p className="support-empty">まだ問い合わせはありません。</p>
            ) : (
              <div className="support-ticket-list">
                {requests.map((request) => (
                  <button
                    key={request.id}
                    className={selectedId === request.id ? "active" : ""}
                    type="button"
                    onClick={() => setSelectedId(request.id)}
                  >
                    <span className="support-ticket-top">
                      <b>{supportCategoryLabel(request.category)}</b>
                      {hasUnreadAdminReply(request) && <i>未読返信</i>}
                    </span>
                    <strong>{request.subject || "件名なし"}</strong>
                    <small>#{supportTicketCode(request.id)} ・ {SUPPORT_STATUS_LABELS[request.status]} ・ {formatDate(request.updatedAt)}</small>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="support-panel support-thread" aria-labelledby="support-thread-title">
            {!selected ? (
              <p className="support-empty">履歴から問い合わせを選ぶと、返信内容と対応状況を確認できます。</p>
            ) : (
              <>
                <div className="support-heading">
                  <div>
                    <span>#{supportTicketCode(selected.id)}</span>
                    <h2 id="support-thread-title">{selected.subject || supportCategoryLabel(selected.category)}</h2>
                  </div>
                  <strong className={`support-status ${selected.status}`}>{SUPPORT_STATUS_LABELS[selected.status]}</strong>
                </div>

                {detailBusy ? (
                  <p className="support-empty">会話履歴を読み込んでいます…</p>
                ) : (
                  <div className="support-messages">
                    {messages.map((item) => (
                      <article key={item.id} className={item.senderRole === "admin" ? "admin" : "user"}>
                        <header>
                          <strong>{item.senderRole === "admin" ? "AAS運営" : "あなた"}</strong>
                          <time>{formatDate(item.createdAt)}</time>
                        </header>
                        <p>{item.body}</p>
                      </article>
                    ))}
                  </div>
                )}

                {selected.status !== "closed" && (
                  <div className="support-reply">
                    <label className="support-field">
                      <span>追加メッセージ</span>
                      <textarea
                        value={reply}
                        maxLength={5000}
                        onChange={(event) => setReply(event.target.value)}
                        placeholder="管理者から確認事項が届いた場合や、追加情報がある場合に入力してください。"
                      />
                    </label>
                    <div className="support-actions">
                      <button type="button" disabled={busy || !reply.trim()} onClick={() => void sendReply()}>
                        追記を送信
                      </button>
                      <button className="danger" type="button" disabled={busy} onClick={() => void closeRequest()}>
                        問い合わせを終了
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {message && <div className="route-notice support-global-message" role="status">{message}</div>}
    </main>
  );
}
