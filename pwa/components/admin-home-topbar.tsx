"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

import { useSharedAccessState } from "@/components/access-state-provider";

import { ADMIN_HOME_SHORTCUT_IDS, ADMIN_SECTIONS } from "@/lib/admin-sections";

export function AdminHomeTopbar() {
  const pathname = usePathname();
  const { state } = useSharedAccessState();
  const admin = state.kind === "ready" && state.profile.role === "admin" && state.profile.status === "active";
  const shortcuts = useMemo(
    () => ADMIN_HOME_SHORTCUT_IDS.map((id) => ADMIN_SECTIONS.find((section) => section.id === id)).filter(Boolean),
    [],
  );

  if (pathname !== "/" || !admin) return null;

  return (
    <aside className="admin-home-topbar" aria-label="管理者専用ショートカット">
      <div><span>ADMIN</span><strong>管理者モード</strong><small>問い合わせ・ユーザー・無料利用・販売・セキュリティを機能別に管理できます。</small></div>
      <nav>
        <Link href="/admin">管理ダッシュボード</Link>
        {shortcuts.map((section) => section && <Link key={section.id} href={section.href}>{section.shortTitle}</Link>)}
      </nav>
    </aside>
  );
}
