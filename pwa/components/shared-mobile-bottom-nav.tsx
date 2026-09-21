"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import {
  DEFAULT_MOBILE_NAV_ITEMS,
  MOBILE_NAV_ITEMS_EVENT,
  MOBILE_NAV_ITEMS_KEY,
  mobileNavItemFor,
  mobileNavItemsStorageKey,
  readMobileNavItems,
  type MobileNavItemKey,
  type MobileNavItemsPreferenceEventDetail,
} from "@/lib/mobile-nav-preference";
import { getSupabaseClient } from "@/lib/supabase";

type SharedMobileBottomNavProps = {
  activeKey?: "home" | MobileNavItemKey | "";
  onLibrary?: () => void;
  className?: string;
};

function routeMatches(pathname: string, href: string): boolean {
  const path = href.split("?")[0] || "/";
  if (path === "/") return pathname === "/";
  if (path === "/admin") return pathname === "/admin";
  return pathname === path || pathname.startsWith(path + "/");
}

export function SharedMobileBottomNav({
  activeKey = "",
  onLibrary,
  className = "",
}: SharedMobileBottomNavProps) {
  const pathname = usePathname();
  const [userId, setUserId] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [items, setItems] = useState<MobileNavItemKey[]>([...DEFAULT_MOBILE_NAV_ITEMS]);

  useEffect(() => {
    let active = true;
    let client: ReturnType<typeof getSupabaseClient>;
    try {
      client = getSupabaseClient();
    } catch {
      return;
    }

    const syncAccount = async (session: Awaited<ReturnType<typeof client.auth.getSession>>["data"]["session"]) => {
      if (!active) return;
      const nextUserId = session?.user.id ?? "";
      setUserId(nextUserId);
      setIsAdmin(false);
      if (!nextUserId) return;

      try {
        const { data } = await client
          .from("profiles")
          .select("id,role,status")
          .eq("id", nextUserId)
          .single();
        if (active) {
          setIsAdmin(Boolean(
            data &&
            data.id === nextUserId &&
            data.role === "admin" &&
            data.status === "active"
          ));
        }
      } catch {
        if (active) setIsAdmin(false);
      }
    };

    void client.auth.getSession().then(({ data }) => syncAccount(data.session));
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => {
        if (active) void syncAccount(session);
      }, 0);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const sync = () => setItems(readMobileNavItems(userId, isAdmin));
    const onPreference = (event: Event) => {
      const custom = event as CustomEvent<MobileNavItemsPreferenceEventDetail>;
      const detail = custom.detail;
      if (!detail || detail.userId !== userId || !Array.isArray(detail.items)) return;
      setItems(detail.items);
    };
    const onStorage = (event: StorageEvent) => {
      const scopedKey = mobileNavItemsStorageKey(userId);
      if (event.key === scopedKey || (!userId && event.key === MOBILE_NAV_ITEMS_KEY)) sync();
    };

    queueMicrotask(sync);
    window.addEventListener(MOBILE_NAV_ITEMS_EVENT, onPreference);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(MOBILE_NAV_ITEMS_EVENT, onPreference);
      window.removeEventListener("storage", onStorage);
    };
  }, [userId, isAdmin]);

  const homeActive = activeKey ? activeKey === "home" : pathname === "/";
  const navClass = ["aas-reference-bottom-nav", className].filter(Boolean).join(" ");

  return (
    <nav className={navClass} aria-label="メインナビゲーション">
      <Link className={homeActive ? "active" : ""} href="/" aria-current={homeActive ? "page" : undefined}>
        <span aria-hidden="true">⌂</span>
        ホーム
      </Link>

      {items.map((key) => {
        const item = mobileNavItemFor(key);
        const selectedActive = activeKey ? activeKey === key : routeMatches(pathname, item.href);
        if (key === "library" && onLibrary) {
          return (
            <button
              key={key}
              className={selectedActive ? "active" : ""}
              type="button"
              aria-current={selectedActive ? "page" : undefined}
              onClick={onLibrary}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          );
        }
        return (
          <Link
            key={key}
            className={selectedActive ? "active" : ""}
            href={item.href}
            aria-current={selectedActive ? "page" : undefined}
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
