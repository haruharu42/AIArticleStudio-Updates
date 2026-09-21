"use client";

import { useEffect, useMemo, useState } from "react";

import {
  SUPPORT_CATEGORY_OPTIONS,
  SUPPORT_PRIORITY_LABELS,
  SUPPORT_STATUS_LABELS,
  adminSetSupportRequest,
  hasUnreadUserMessage,
  listAdminSupportRequests,
  listSupportMessages,
  loadSupportUsers,
  markSupportRequestSeen,
  replySupportRequest,
  supportCategoryLabel,
  supportTicketCode,
  type SupportMessage,
  type SupportPriority,
  type SupportRequest,
  type SupportStatus,
  type SupportUserSummary,
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

export function AdminInquiriesPage() {
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [users, setUsers] = useState<Record<string, SupportUserSummary>>({});
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | SupportStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | SupportRequest["category"]>("all");
  const [search, setSearch] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailBusy, setDetailBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const selected = useMemo(
    () => requests.find((request) => request.id === selectedId) ?? null,
    [requests, selectedId],
  );
  const selectedUser = selected ? users[selected.userId] : undefined;

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return requests.filter((request) => {
      if (statusFilter !== "all" && request.status !== statusFilter) return false;
      if (categoryFilter !== "all" && request.category !== categoryFilter) return false;
      if (!needle) return true;
      const user = users[request.userId];
      const haystack = [
        request.subject,
        supportTicketCode(request.id),
        supportCategoryLabel(request.category),
        user?.aasUserId,
        user?.displayName,
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [requests, users, search, statusFilter, categoryFilter]);

  const unreadCount = useMemo(() => requests.filter(hasUnreadUserMessage).length, [requests]);
  const openCount = useMemo(
    () => requests.filter((request) => !["resolved", "closed"].includes(request.status)).length,
    [requests],
  );

  const reload = async () => {
    const client = getSupabaseClient();
    const next = await listAdminSupportRequests(client);
    const userMap = await loadSupportUsers(client, next.map((request) => request.userId));
    setRequests(next);
    setUsers(userMap);
    if (selectedId && !next.some((request) => request.id === selectedId)) setSelectedId("");
    return next;
  };

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        const client = getSupabaseClient();
        const next = await listAdminSupportRequests(client);
        const userMap = await loadSupportUsers(client, next.map((request) => request.userId));
        if (!active) return;
        setRequests(next);
        setUsers(userMap);
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : "問い合わせ一覧を読み込めませんでした。");
      } finally {
        if (active) setLoading(false);
      }
    };
    void boot();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    const loadDetail = async () => {
      setDetailBusy(true);
      setMessage("");
      try {
        const client = getSupabaseClient();
        await markSupportRequestSeen(client, selectedId);
        const [nextMessages, nextRequests] = await Promise.all([
          listSupportMessages(client, selectedId),
          listAdminSupportRequests(client),
        ]);
        if (!active) return;
        setMessages(nextMessages);
        setRequests(nextRequests);
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : "問い合わせ詳細を読み込めませんでした。");
      } finally {
        if (active) setDetailBusy(false);
      }
    };
    void loadDetail();
    return () => { active = false; };
  }, [selectedId]);

  const updateWorkflow = async (status: SupportStatus, priority: SupportPriority) => {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      await adminSetSupportRequest(getSupabaseClient(), selected.id, status, priority);
      await reload();
      setMessage("対応状況を更新しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "対応状況を更新できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const client = getSupabaseClient();
      await replySupportRequest(client, selected.id, reply);
      setReply("");
      const [nextMessages] = await Promise.all([
        listSupportMessages(client, selected.id),
        reload(),
      ]);
      setMessages(nextMessages);
      setMessage("ユーザーへ返信しました。状態を「ユーザー回答待ち」に更新しています。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "返信を送信できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="admin-page admin-support-page">
      <header className="admin-head admin-dashboard-head">
        <div>
          <p className="eyebrow">SUPPORT INBOX</p>
          <h1>問い合わせ確認</h1>
          <p>ユーザーから届いた要望・不具合・質問を確認し、返信と対応状況を管理します。</p>
        </div>
        <div className="admin-head-actions">
          <a className="route-back" href="/admin">← 管理ダッシュボード</a>
        </div>
      </header>

      <section className="admin-support-summary" aria-label="問い合わせ件数">
        <div><span>未確認</span><strong>{unreadCount}</strong><small>ユーザーからの新着・追記</small></div>
        <div><span>対応中</span><strong>{openCount}</strong><small>解決・終了以外</small></div>
        <div><span>全件</span><strong>{requests.length}</strong><small>直近200件を表示</small></div>
      </section>

      <section className="admin-support-toolbar">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="受付番号・AAS ID・表示名・件名で検索"
          aria-label="問い合わせ検索"
        />
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | SupportStatus)}>
          <option value="all">すべての状態</option>
          {(Object.keys(SUPPORT_STATUS_LABELS) as SupportStatus[]).map((status) => (
            <option key={status} value={status}>{SUPPORT_STATUS_LABELS[status]}</option>
          ))}
        </select>
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as "all" | SupportRequest["category"])}>
          <option value="all">すべての種類</option>
          {SUPPORT_CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <button type="button" disabled={loading || busy} onClick={() => void reload()}>再読み込み</button>
      </section>

      {message && <div className="route-notice admin-support-message" role="status">{message}</div>}

      <div className="admin-support-layout">
        <section className="admin-panel admin-support-list-panel" aria-label="問い合わせ一覧">
          {loading ? (
            <p className="support-empty">問い合わせを読み込んでいます…</p>
          ) : filtered.length === 0 ? (
            <p className="support-empty">条件に一致する問い合わせはありません。</p>
          ) : (
            <div className="admin-support-list">
              {filtered.map((request) => {
                const user = users[request.userId];
                return (
                  <button
                    key={request.id}
                    type="button"
                    className={selectedId === request.id ? "active" : ""}
                    onClick={() => setSelectedId(request.id)}
                  >
                    <span className="admin-support-list-top">
                      <b>{supportCategoryLabel(request.category)}</b>
                      {hasUnreadUserMessage(request) && <i>未確認</i>}
                      {request.priority !== "normal" && <em>{SUPPORT_PRIORITY_LABELS[request.priority]}</em>}
                    </span>
                    <strong>{request.subject || "件名なし"}</strong>
                    <span>{user?.displayName || "ユーザー"} ・ {user?.aasUserId || "AAS ID取得中"}</span>
                    <small>#{supportTicketCode(request.id)} ・ {SUPPORT_STATUS_LABELS[request.status]} ・ {formatDate(request.updatedAt)}</small>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="admin-panel admin-support-detail" aria-label="問い合わせ詳細">
          {!selected ? (
            <p className="support-empty">左の一覧から問い合わせを選択してください。</p>
          ) : (
            <>
              <div className="admin-support-detail-head">
                <div>
                  <span>#{supportTicketCode(selected.id)}</span>
                  <h2>{selected.subject || supportCategoryLabel(selected.category)}</h2>
                  <p>{selectedUser?.displayName || "ユーザー"} ・ {selectedUser?.aasUserId || "AAS ID取得中"} ・ {supportCategoryLabel(selected.category)}</p>
                </div>
                <strong className={`support-status ${selected.status}`}>{SUPPORT_STATUS_LABELS[selected.status]}</strong>
              </div>

              <div className="admin-support-controls">
                <label>
                  <span>対応状況</span>
                  <select
                    value={selected.status}
                    disabled={busy}
                    onChange={(event) => void updateWorkflow(event.target.value as SupportStatus, selected.priority)}
                  >
                    {(Object.keys(SUPPORT_STATUS_LABELS) as SupportStatus[]).map((status) => (
                      <option key={status} value={status}>{SUPPORT_STATUS_LABELS[status]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>優先度</span>
                  <select
                    value={selected.priority}
                    disabled={busy}
                    onChange={(event) => void updateWorkflow(selected.status, event.target.value as SupportPriority)}
                  >
                    {(Object.keys(SUPPORT_PRIORITY_LABELS) as SupportPriority[]).map((priority) => (
                      <option key={priority} value={priority}>{SUPPORT_PRIORITY_LABELS[priority]}</option>
                    ))}
                  </select>
                </label>
                <div><span>受付日時</span><strong>{formatDate(selected.createdAt)}</strong></div>
                <div><span>最終更新</span><strong>{formatDate(selected.updatedAt)}</strong></div>
              </div>

              {detailBusy ? (
                <p className="support-empty">会話履歴を読み込んでいます…</p>
              ) : (
                <div className="support-messages admin-support-messages">
                  {messages.map((item) => (
                    <article key={item.id} className={item.senderRole === "admin" ? "admin" : "user"}>
                      <header>
                        <strong>{item.senderRole === "admin" ? "AAS運営" : selectedUser?.displayName || "ユーザー"}</strong>
                        <time>{formatDate(item.createdAt)}</time>
                      </header>
                      <p>{item.body}</p>
                    </article>
                  ))}
                </div>
              )}

              {selected.status !== "closed" && (
                <div className="admin-support-reply">
                  <label className="support-field">
                    <span>ユーザーへ返信</span>
                    <textarea
                      value={reply}
                      maxLength={5000}
                      onChange={(event) => setReply(event.target.value)}
                      placeholder="確認結果、追加で必要な情報、対応予定などを入力してください。"
                    />
                    <small>{reply.length} / 5000</small>
                  </label>
                  <button className="primary-action" type="button" disabled={busy || !reply.trim()} onClick={() => void sendReply()}>
                    {busy ? "送信中…" : "返信を送信"}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <section className="admin-panel admin-support-safety">
        <h2>問い合わせ運用メモ</h2>
        <p>ユーザーへパスワード、認証コード、秘密鍵、カード番号の送信を求めないでください。不具合対応で追加情報が必要な場合も、必要最小限の画面名・操作手順・エラー表示に限定してください。</p>
      </section>
    </main>
  );
}
