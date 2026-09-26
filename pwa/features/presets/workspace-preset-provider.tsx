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

import { useSharedAccessState } from "@/components/access-state-provider";
import {
  createDefaultWorkspacePresetPreference,
  loadWorkspacePresetPreference,
  saveWorkspacePresetPreference,
  setRuntimeWorkspacePresetPreference,
  type WorkspacePresetPreference,
} from "@/features/presets/workspace-presets";
import {
  deletePlatformAccountPreset,
  listPlatformAccountPresets,
  savePlatformAccountPreset,
  setRuntimePlatformAccountPresets,
  type PlatformAccountPreset,
  type PlatformAccountPresetDraft,
} from "@/features/presets/platform-account-presets";
import { getSupabaseClient } from "@/lib/supabase";

type WorkspacePresetContextValue = {
  preference: WorkspacePresetPreference | null;
  loading: boolean;
  saving: boolean;
  error: string;
  isAdmin: boolean;
  save: (next: WorkspacePresetPreference) => Promise<WorkspacePresetPreference>;
  replaceLocal: (next: WorkspacePresetPreference) => void;
  accountPresets: PlatformAccountPreset[];
  accountPresetsLoading: boolean;
  accountPresetError: string;
  saveAccountPreset: (draft: PlatformAccountPresetDraft) => Promise<PlatformAccountPreset>;
  deleteAccountPreset: (id: string) => Promise<void>;
  refreshAccountPresets: () => Promise<PlatformAccountPreset[]>;
};

const WorkspacePresetContext = createContext<WorkspacePresetContextValue | null>(null);

export function WorkspacePresetProvider({ children }: { children: ReactNode }) {
  const { state } = useSharedAccessState();
  const [preference, setPreference] = useState<WorkspacePresetPreference | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [accountPresets, setAccountPresets] = useState<PlatformAccountPreset[]>([]);
  const [accountPresetsLoading, setAccountPresetsLoading] = useState(false);
  const [accountPresetError, setAccountPresetError] = useState("");

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

  useEffect(() => {
    let active = true;
    if (!ownerId) {
      queueMicrotask(() => {
        if (!active) return;
        setAccountPresets([]);
        setRuntimePlatformAccountPresets(null);
        setAccountPresetsLoading(false);
        setAccountPresetError("");
      });
      return () => { active = false; };
    }

    queueMicrotask(() => {
      if (!active) return;
      setAccountPresetsLoading(true);
      setAccountPresetError("");
    });

    void listPlatformAccountPresets(getSupabaseClient(), ownerId).then(
      (items) => {
        if (!active) return;
        setAccountPresets(items);
        setRuntimePlatformAccountPresets(items);
      },
      (loadError) => {
        if (!active) return;
        setAccountPresets([]);
        setRuntimePlatformAccountPresets(null);
        setAccountPresetError(loadError instanceof Error ? loadError.message : "アカウント別プリセットを読み込めませんでした。");
      },
    ).finally(() => {
      if (active) setAccountPresetsLoading(false);
    });

    return () => { active = false; };
  }, [ownerId]);

  const save = useCallback(async (next: WorkspacePresetPreference) => {
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
  }, [isAdmin]);

  const replaceLocal = useCallback((next: WorkspacePresetPreference) => {
    setPreference(next);
    setRuntimeWorkspacePresetPreference(next);
  }, []);

  const refreshAccountPresets = useCallback(async () => {
    if (!ownerId) return [];
    const items = await listPlatformAccountPresets(getSupabaseClient(), ownerId);
    setAccountPresets(items);
    setRuntimePlatformAccountPresets(items);
    setAccountPresetError("");
    return items;
  }, [ownerId]);

  const saveAccountPreset = useCallback(async (draft: PlatformAccountPresetDraft) => {
    setAccountPresetError("");
    const saved = await savePlatformAccountPreset(getSupabaseClient(), draft);
    await refreshAccountPresets();
    return saved;
  }, [refreshAccountPresets]);

  const deleteAccountPreset = useCallback(async (id: string) => {
    if (!ownerId) throw new Error("ログイン状態を確認できませんでした。");
    setAccountPresetError("");
    await deletePlatformAccountPreset(getSupabaseClient(), ownerId, id);
    await refreshAccountPresets();
  }, [ownerId, refreshAccountPresets]);

  const value = useMemo<WorkspacePresetContextValue>(
    () => ({
      preference,
      loading,
      saving,
      error,
      isAdmin,
      save,
      replaceLocal,
      accountPresets,
      accountPresetsLoading,
      accountPresetError,
      saveAccountPreset,
      deleteAccountPreset,
      refreshAccountPresets,
    }),
    [
      preference,
      loading,
      saving,
      error,
      isAdmin,
      save,
      replaceLocal,
      accountPresets,
      accountPresetsLoading,
      accountPresetError,
      saveAccountPreset,
      deleteAccountPreset,
      refreshAccountPresets,
    ],
  );

  return <WorkspacePresetContext.Provider value={value}>{children}</WorkspacePresetContext.Provider>;
}

export function useWorkspacePreset(): WorkspacePresetContextValue {
  const value = useContext(WorkspacePresetContext);
  if (!value) throw new Error("useWorkspacePreset must be used inside WorkspacePresetProvider.");
  return value;
}
