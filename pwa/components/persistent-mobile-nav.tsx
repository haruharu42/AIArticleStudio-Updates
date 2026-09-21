"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { SharedMobileBottomNav } from "@/components/shared-mobile-bottom-nav";
import {
  MOBILE_NAV_PREFERENCE_EVENT,
  MOBILE_NAV_PREFERENCE_KEY,
  readMobileNavAlways,
} from "@/features/navigation";
import { getSupabaseClient } from "@/lib/supabase";

const HIDDEN_PREFIXES = ["/auth", "/invite", "/terms", "/privacy", "/ai-terms"];
const REFERENCE_SHELL_ROUTES = new Set(["/", "/create", "/ranking", "/profile"]);

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

  if (!visible) return null;

  const needsSpacer = pathname !== "/settings";

  return (
    <>
      {needsSpacer && <div className="persistent-mobile-nav-spacer" aria-hidden="true" />}
      <SharedMobileBottomNav className="persistent-mobile-nav unified-reference-mobile-nav" />
    </>
  );
}
