"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import {
  DEFAULT_MOBILE_NAV_ITEMS,
  MOBILE_NAV_ITEMS_EVENT,
  MOBILE_NAV_ITEMS_KEY,
  mobileNavItemFor,
  readMobileNavItems,
  type MobileNavItemKey,
} from "@/lib/mobile-nav-preference";

type SharedMobileBottomNavProps = {
  activeKey?: "home" | MobileNavItemKey | "";
  onLibrary?: () => void;
  className?: string;
};

function routeMatches(pathname: string, href: string): boolean {
  const path = href.split("?")[0] || "/";
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(path + "/");
}

export function SharedMobileBottomNav({
  activeKey = "",
  onLibrary,
  className = "",
}: SharedMobileBottomNavProps) {
  const pathname = usePathname();
  const [items, setItems] = useState<MobileNavItemKey[]>([...DEFAULT_MOBILE_NAV_ITEMS]);

  useEffect(() => {
    const sync = () => setItems(readMobileNavItems());
    const onPreference = (event: Event) => {
      const custom = event as CustomEvent<MobileNavItemKey[]>;
      setItems(Array.isArray(custom.detail) ? custom.detail : readMobileNavItems());
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === MOBILE_NAV_ITEMS_KEY) sync();
    };

    queueMicrotask(sync);
    window.addEventListener(MOBILE_NAV_ITEMS_EVENT, onPreference);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(MOBILE_NAV_ITEMS_EVENT, onPreference);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

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
