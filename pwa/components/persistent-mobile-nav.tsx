"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  MOBILE_NAV_PREFERENCE_EVENT,
  MOBILE_NAV_PREFERENCE_KEY,
  readMobileNavAlways,
} from "@/lib/mobile-nav-preference";
import { getSupabaseClient } from "@/lib/supabase";

const HIDDEN_PREFIXES = ["/auth", "/invite", "/terms", "/privacy", "/ai-terms"];
const REFERENCE_SHELL_ROUTES = new Set(["/", "/create", "/ranking", "/profile"]);

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

type CanonicalNavKey = "home" | "create" | "library" | "ranking" | "profile";

const CANONICAL_NAV_ITEMS: ReadonlyArray<{ key: CanonicalNavKey; label: string; icon: string; href: string }> = [
  { key: "home", label: "ホーム", icon: "⌂", href: "/" },
  { key: "create", label: "作成", icon: "＋", href: "/create" },
  { key: "library", label: "ライブラリ", icon: "▤", href: "/?section=library" },
  { key: "ranking", label: "ランキング", icon: "♛", href: "/ranking" },
  { key: "profile", label: "プロフィール", icon: "♙", href: "/profile" },
];

export function PersistentMobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [alwaysShow, setAlwaysShow] = useState(true);

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
      setSignedIn(Boolean(session));
    };

    void client.auth.getSession().then(({ data }) => syncAccount(data.session));
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => { if (active) void syncAccount(session); }, 0);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const syncVisibility = () => setAlwaysShow(readMobileNavAlways());
    const onVisibilityPreference = (event: Event) => {
      const custom = event as CustomEvent<boolean>;
      setAlwaysShow(typeof custom.detail === "boolean" ? custom.detail : readMobileNavAlways());
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === MOBILE_NAV_PREFERENCE_KEY) syncVisibility();
    };

    queueMicrotask(syncVisibility);
    window.addEventListener(MOBILE_NAV_PREFERENCE_EVENT, onVisibilityPreference);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(MOBILE_NAV_PREFERENCE_EVENT, onVisibilityPreference);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const hiddenRoute = HIDDEN_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
  const referenceShellRoute = REFERENCE_SHELL_ROUTES.has(pathname);
  const visible = signedIn && !hiddenRoute && !referenceShellRoute && (alwaysShow || pathname === "/settings");

  const activeKey = useMemo<CanonicalNavKey | "">(() => {
    if (pathname === "/") return "home";
    if (matchesPrefix(pathname, "/create")) return "create";
    if (matchesPrefix(pathname, "/ranking")) return "ranking";
    if (matchesPrefix(pathname, "/profile")) return "profile";
    return "";
  }, [pathname]);

  if (!visible) return null;

  const go = (href: string) => router.push(href);
  const needsSpacer = pathname !== "/settings";

  return (
    <>
      {needsSpacer && <div className="persistent-mobile-nav-spacer" aria-hidden="true" />}
      <nav className="aas-reference-bottom-nav persistent-mobile-nav unified-reference-mobile-nav" aria-label="メインナビゲーション">
        {CANONICAL_NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            className={activeKey === item.key ? "active" : ""}
            type="button"
            aria-current={activeKey === item.key ? "page" : undefined}
            onClick={() => go(item.href)}
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
    </>
  );
}
