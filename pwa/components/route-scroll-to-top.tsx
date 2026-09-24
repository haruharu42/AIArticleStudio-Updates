"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function scrollWindowToTop(): void {
  const scrollingElement = document.scrollingElement;
  if (scrollingElement) {
    scrollingElement.scrollTop = 0;
    scrollingElement.scrollLeft = 0;
  }
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

export function RouteScrollToTop() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const previousRouteKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    const previousRouteKey = previousRouteKeyRef.current;
    previousRouteKeyRef.current = routeKey;

    if (previousRouteKey === routeKey) return;

    scrollWindowToTop();
    const frame = window.requestAnimationFrame(scrollWindowToTop);
    return () => window.cancelAnimationFrame(frame);
  }, [routeKey]);

  return null;
}
