"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useSharedAccessState } from "@/components/access-state-provider";
import {
  createDefaultWorkspacePresetPreference,
  loadWorkspacePresetPreference,
  saveWorkspacePresetPreference,
  setRuntimeWorkspacePresetPreference,
  type WorkspacePresetPreference,
} from "@/features/presets/workspace-presets";
import { getSupabaseClient } from "@/lib/supabase";

type WorkspacePresetContextValue = {
  preference: WorkspacePresetPreference | null;
  loading: boolean;
  saving: boolean;
  error: string;
  isAdmin: boolean;
  save: (next: WorkspacePresetPreference) => Promise<WorkspacePresetPreference>;
  replaceLocal: (next: WorkspacePresetPreference) => void;
};

const WorkspacePresetContext = createContext<WorkspacePresetContextValue | null>(null);

export function WorkspacePresetProvider({ children }: { children: ReactNode }) {
  const { state } = useSharedAccessState();
  const [preference, setPreference] = useState<WorkspacePresetPreference | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const ownerId = state.kind === "ready" ? state.profile.id : "";
  const isAdmin = state.kind === "ready"
    && state.profile.role === "admin"
    && state.profile.status === "active";

  useEffect(() => {
    let active = true;
    if (!ownerId) {
      queueMicrotask(() => {
        if (!active) return;
        setPreference(null);
        setRuntimeWorkspacePresetPreference(null);
        setLoading(false);
        setError("");
      });
      return () => { active = false; };
    }

    queueMicrotask(() => {
      if (!active) return;
      setLoading(true);
      setError("");
    });

    void loadWorkspacePresetPreference(getSupabaseClient(), ownerId, isAdmin).then(
      (next) => {
        if (!active) return;
        setPreference(next);
        setRuntimeWorkspacePresetPreference(next);
      },
      (loadError) => {
        if (!active) return;
        const fallback = createDefaultWorkspacePresetPreference(ownerId);
        setPreference(fallback);
        setRuntimeWorkspacePresetPreference(fallback);
        setError(loadError instanceof Error ? loadError.message : "共通プリセット設定を読み込めませんでした。");
      },
    ).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [ownerId, isAdmin]);

  const save = async (next: WorkspacePresetPreference) => {
    setSaving(true);
    setError("");
    try {
      const saved = await saveWorkspacePresetPreference(getSupabaseClient(), next, isAdmin);
      setPreference(saved);
      setRuntimeWorkspacePresetPreference(saved);
      return saved;
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "共通プリセット設定を保存できませんでした。";
      setError(message);
      throw saveError;
    } finally {
      setSaving(false);
    }
  };

  const replaceLocal = (next: WorkspacePresetPreference) => {
    setPreference(next);
    setRuntimeWorkspacePresetPreference(next);
  };

  const value = useMemo<WorkspacePresetContextValue>(
    () => ({ preference, loading, saving, error, isAdmin, save, replaceLocal }),
    [preference, loading, saving, error, isAdmin],
  );

  return <WorkspacePresetContext.Provider value={value}>{children}</WorkspacePresetContext.Provider>;
}

export function useWorkspacePreset(): WorkspacePresetContextValue {
  const value = useContext(WorkspacePresetContext);
  if (!value) throw new Error("useWorkspacePreset must be used inside WorkspacePresetProvider.");
  return value;
}
