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
    let activeClient: SupabaseClient;
    try {
      activeClient = getSupabaseClient();
    } catch {
      queueMicrotask(() => {
        if (active) setState({ kind: "unavailable" });
      });
      return;
    }

    queueMicrotask(() => {
      if (!active) return;
      setClient(activeClient);
      void loadAccessState(activeClient).then(
        (next) => {
          if (active) setState(next);
        },
        () => {
          if (active) setState({ kind: "unavailable" });
        },
      );
    });

    const { data } = activeClient.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => {
        if (!active) return;
        if (!session) {
          setState({ kind: "signed_out" });
          return;
        }
        void loadAccessState(activeClient).then(
          (next) => {
            if (active) setState(next);
          },
          () => {
            if (active) setState({ kind: "unavailable" });
          },
        );
      }, 0);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
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
