"use client";

import { useEffect } from "react";

import { loadActiveKnowledgeCatalog } from "@/lib/knowledge-catalog";
import { setRuntimeKnowledgeCatalog } from "@/lib/knowledge-engine";
import {
  loadActivePromptOptimizations,
  loadKnowledgeRuntimeState,
  setRuntimeKnowledgeState,
  setRuntimePromptOptimizations,
} from "@/lib/prompt-optimization";
import { getSupabaseClient } from "@/lib/supabase";

export function KnowledgeRuntimeBootstrap() {
  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        const client = getSupabaseClient();
        const { data: { user } } = await client.auth.getUser();
        if (!active || !user) {
          if (active) {
          setRuntimeKnowledgeCatalog([]);
          setRuntimePromptOptimizations([]);
        }
          return;
        }
        const [rules, promptRules, runtimeState] = await Promise.all([
          loadActiveKnowledgeCatalog(client),
          loadActivePromptOptimizations(client),
          loadKnowledgeRuntimeState(client),
        ]);
        if (active) {
          setRuntimeKnowledgeCatalog(rules);
          setRuntimePromptOptimizations(promptRules);
          setRuntimeKnowledgeState(runtimeState);
        }
      } catch {
        if (active) setRuntimeKnowledgeCatalog([]);
      }
    };
    void boot();
    return () => { active = false; };
  }, []);
  return null;
}
