"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  NOTE_SCHEDULE_TYPE_LABELS,
  isNoteArticleScheduleItem,
  listNoteSchedule,
  setNoteScheduleStatus,
  todayJstDateKey,
  type NoteScheduleItem,
} from "@/lib/note-operations";

export function NoteTodayPanel({ client, ownerId }: { client: SupabaseClient; ownerId: string }) {
  const [items, setItems] = useState<NoteScheduleItem[] | null>(null);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    const today = todayJstDateKey();
    void listNoteSchedule(client, ownerId, today, today).then(
      (value) => {
        if (!active) return;
        setItems(value.filter((item) => isNoteArticleScheduleItem(item)));
        setError(false);
      },
      () => {
        if (!active) return;
        setItems([]);
        setError(true);
      },
    );
    return () => { active = false; };
  }, [client, ownerId]);

  const complete = async (item: NoteScheduleItem) => {
    if (!item.id || busyId) return;
    setBusyId(item.id);
    try {
      await setNoteScheduleStatus(client, ownerId, item.id, item.status === "done" ? "planned" : "done");
      setItems((current) => current?.map((value) => value.id === item.id
        ? { ...value, status: item.status === "done" ? "planned" : "done" }
        : value) ?? []);
    } catch {
      setError(true);
    } finally {
      setBusyId("");
    }
  };

  return (
    <section className="reference-home-section note-today-home">
      <div className="reference-section-heading">
        <h2>🗓 今日のnote作成</h2>
        <Link href="/note-operations">運営を開く ›</Link>
      </div>
      {error ? (
        <p className="beginner-right-muted" role="alert">note運営予定を取得できませんでした。</p>
      ) : items === null ? (
        <p className="beginner-right-muted">今日の予定を確認しています…</p>
      ) : items.length === 0 ? (
        <div className="note-today-empty">
          <div><strong>今日の無料note・有料note作成予定はありません</strong><small>AASのAI運用プランから、無料note・有料noteの作成予定を組んでもらえます。</small></div>
          <Link href="/note-operations">note運営を設定する</Link>
        </div>
      ) : (
        <div className="note-today-list">
          {items.slice(0, 5).map((item) => (
            <article key={item.id ?? item.scheduledTime + item.title} className={item.status === "done" ? "done" : ""}>
              <span>{item.scheduledTime}</span>
              <div>
                <strong>{NOTE_SCHEDULE_TYPE_LABELS[item.itemType]}：{item.title}</strong>
                {item.theme && <small>{item.theme}</small>}
              </div>
              {item.id && (
                <button type="button" disabled={busyId === item.id} onClick={() => void complete(item)}>
                  {item.status === "done" ? "✓ 完了" : "完了にする"}
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
