"use client";

import Link from "next/link";

import { useSharedAccessState } from "@/components/access-state-provider";

export function Phase9To11QuickNav() {
  const { state } = useSharedAccessState();

  const showInvite =
    state.kind === "pending" || state.kind === "entitlement_denied";
  const showCreate = state.kind === "ready";
  const showAdmin = state.kind === "ready" && state.profile.role === "admin";

  return (
    <nav className="phase-quick-nav" aria-label="追加機能">
      {showCreate && (
        <Link className="quick-primary" href="/create">
          <span>✦</span>
          記事を作る
        </Link>
      )}
      <Link href="/tools">
        <span>▦</span>
        機能
      </Link>
      {showInvite && (
        <Link href="/invite">
          <span>⌁</span>
          PWA招待
        </Link>
      )}
      {showAdmin && (
        <Link href="/admin">
          <span>⚙</span>
          管理
        </Link>
      )}
    </nav>
  );
}
