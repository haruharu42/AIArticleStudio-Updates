"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { getSupabaseClient } from "@/lib/supabase";

export function AdminHomeTopbar() {
  const pathname = usePathname();
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    if (pathname !== "/") {
      queueMicrotask(() => setAdmin(false));
      return;
    }

    let active = true;
    let client: ReturnType<typeof getSupabaseClient>;
    try {
      client = getSupabaseClient();
    } catch {
      return;
    }

    const sync = async () => {
      try {
        const { data: { user } } = await client.auth.getUser();
        if (!user) {
          if (active) setAdmin(false);
          return;
        }
        const { data } = await client.from("profiles").select("id,role,status").eq("id", user.id).single();
        if (active) setAdmin(Boolean(data && data.id === user.id && data.role === "admin" && data.status === "active"));
      } catch {
        if (active) setAdmin(false);
      }
    };

    void sync();
    const { data } = client.auth.onAuthStateChange(() => {
      window.setTimeout(() => { if (active) void sync(); }, 0);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [pathname]);

  if (pathname !== "/" || !admin) return null;

  return (
    <aside className="admin-home-topbar" aria-label="管理者専用ショートカット">
      <div><span>ADMIN</span><strong>管理者モード</strong><small>運用状況と販売プロモーションへすぐ移動できます。</small></div>
      <nav><a href="/admin">管理ダッシュボード</a><a href="/admin/promotion">販売・SNSプロモーション</a></nav>
    </aside>
  );
}
