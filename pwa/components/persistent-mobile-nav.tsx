"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import {
  MOBILE_NAV_PREFERENCE_EVENT,
  MOBILE_NAV_PREFERENCE_KEY,
  readMobileNavAlways,
} from "@/lib/mobile-nav-preference";
import { getSupabaseClient } from "@/lib/supabase";

const HIDDEN_PREFIXES = ["/auth", "/invite", "/terms", "/privacy", "/ai-terms"];
const TOOL_PREFIXES = ["/tools", "/images", "/sidejob", "/sns-plan", "/publish", "/analytics", "/export", "/admin"];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function PersistentMobileNav() {
  const pathname = usePathname();
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

    void client.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(Boolean(data.session));
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (active) setSignedIn(Boolean(session));
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const sync = () => setAlwaysShow(readMobileNavAlways());
    const onPreference = (event: Event) => {
      const custom = event as CustomEvent<boolean>;
      setAlwaysShow(typeof custom.detail === "boolean" ? custom.detail : readMobileNavAlways());
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === MOBILE_NAV_PREFERENCE_KEY) sync();
    };

    queueMicrotask(sync);
    window.addEventListener(MOBILE_NAV_PREFERENCE_EVENT, onPreference);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(MOBILE_NAV_PREFERENCE_EVENT, onPreference);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const hiddenRoute = HIDDEN_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
  const visible = signedIn && !hiddenRoute && (alwaysShow || pathname === "/" || pathname === "/settings");
  const activeKey = useMemo(() => {
    if (pathname === "/") return "home";
    if (matchesPrefix(pathname, "/create")) return "create";
    if (matchesPrefix(pathname, "/sns")) return "sns";
    if (matchesPrefix(pathname, "/settings")) return "settings";
    if (TOOL_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))) return "tools";
    return "";
  }, [pathname]);

  if (!visible) return null;

  const go = (href: string) => window.location.assign(href);
  const needsSpacer = pathname !== "/" && pathname !== "/settings";

  return (
    <>
      {needsSpacer && <div className="persistent-mobile-nav-spacer" aria-hidden="true" />}
      <nav className="beginner-bottom-nav beginner-mobile-nav persistent-mobile-nav" aria-label="メインナビゲーション">
        <button className={activeKey === "home" ? "active" : ""} type="button" aria-current={activeKey === "home" ? "page" : undefined} onClick={() => go("/")}><span aria-hidden="true">⌂</span>ホーム</button>
        <button className={activeKey === "create" ? "active" : ""} type="button" aria-current={activeKey === "create" ? "page" : undefined} onClick={() => go("/create")}><span aria-hidden="true">✎</span>作成</button>
        <button className={activeKey === "tools" ? "active" : ""} type="button" aria-current={activeKey === "tools" ? "page" : undefined} onClick={() => go("/tools")}><span aria-hidden="true">▦</span>機能</button>
        <button className={activeKey === "sns" ? "active" : ""} type="button" aria-current={activeKey === "sns" ? "page" : undefined} onClick={() => go("/sns")}><span aria-hidden="true">↗</span>SNS</button>
        <button className={activeKey === "settings" ? "active" : ""} type="button" aria-current={activeKey === "settings" ? "page" : undefined} onClick={() => go("/settings")}><span aria-hidden="true">⚙</span>設定</button>
      </nav>
    </>
  );
}
