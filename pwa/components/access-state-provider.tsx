"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { loadAccessState, type AccessState } from "@/lib/phase6-access";
import { getSupabaseClient } from "@/lib/supabase";

export type SharedAccessState =
  | AccessState
  | { kind: "loading" }
  | { kind: "unavailable" };

type AccessStateContextValue = {
  state: SharedAccessState;
  client: SupabaseClient | null;
  refresh: () => Promise<void>;
};

const AccessStateContext = createContext<AccessStateContextValue | null>(null);
const BACKGROUND_RECHECK_MIN_INTERVAL_MS = 30_000;

export function AccessStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SharedAccessState>({ kind: "loading" });
  const [client, setClient] = useState<SupabaseClient | null>(null);

  const refresh = useCallback(async () => {
    let activeClient: SupabaseClient;
    try {
      activeClient = getSupabaseClient();
      setClient(activeClient);
      setState(await loadAccessState(activeClient));
    } catch {
      setState({ kind: "unavailable" });
    }
  }, []);

  useEffect(() => {
    let active = true;
    let lastBackgroundCheckAt = 0;
    let activeClient: SupabaseClient;
    try {
      activeClient = getSupabaseClient();
    } catch {
      queueMicrotask(() => {
        if (active) setState({ kind: "unavailable" });
      });
      return;
    }

    const applyAccessState = async (mode: "strict" | "background") => {
      try {
        const next = await loadAccessState(activeClient);
        if (active) {
          if (mode === "strict") lastBackgroundCheckAt = Date.now();
          setState(next);
        }
      } catch {
        if (!active) return;
        if (mode === "background") {
          setState((current) => current.kind === "ready" ? current : { kind: "unavailable" });
          return;
        }
        setState({ kind: "unavailable" });
      }
    };

    const recheckInBackground = () => {
      if (!active || document.visibilityState === "hidden") return;
      const now = Date.now();
      if (now - lastBackgroundCheckAt < BACKGROUND_RECHECK_MIN_INTERVAL_MS) return;
      lastBackgroundCheckAt = now;
      void applyAccessState("background");
    };

    queueMicrotask(() => {
      if (!active) return;
      setClient(activeClient);
      void applyAccessState("strict");
    });

    const { data } = activeClient.auth.onAuthStateChange((event, session) => {
      window.setTimeout(() => {
        if (!active) return;
        if (!session) {
          setState({ kind: "signed_out" });
          return;
        }
        if (event === "INITIAL_SESSION") return;
        void applyAccessState(event === "TOKEN_REFRESHED" ? "background" : "strict");
      }, 0);
    });

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") recheckInBackground();
    };
    window.addEventListener("focus", recheckInBackground);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      data.subscription.unsubscribe();
      window.removeEventListener("focus", recheckInBackground);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const value = useMemo<AccessStateContextValue>(
    () => ({ state, client, refresh }),
    [state, client, refresh],
  );

  return <AccessStateContext.Provider value={value}>{children}</AccessStateContext.Provider>;
}

export function useSharedAccessState(): AccessStateContextValue {
  const value = useContext(AccessStateContext);
  if (!value) {
    throw new Error("useSharedAccessState must be used inside AccessStateProvider.");
  }
  return value;
}
