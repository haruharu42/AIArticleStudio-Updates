"use client";

import { useEffect } from "react";

import { useSharedAccessState } from "@/components/access-state-provider";
import { loadActiveKnowledgeCatalog } from "@/lib/knowledge-catalog";
import { setRuntimeKnowledgeCatalog } from "@/lib/knowledge-engine";
import {
  loadActivePromptOptimizations,
  loadKnowledgeRuntimeState,
  setRuntimeKnowledgeState,
  setRuntimePromptOptimizations,
} from "@/lib/prompt-optimization";

export function KnowledgeRuntimeBootstrap() {
  const { state, client } = useSharedAccessState();

  useEffect(() => {
    if (state.kind !== "ready" || !client) {
      setRuntimeKnowledgeCatalog([]);
      setRuntimePromptOptimizations([]);
      return;
    }

    let active = true;
    const boot = async () => {
      try {
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
        if (active) {
          setRuntimeKnowledgeCatalog([]);
          setRuntimePromptOptimizations([]);
        }
      }
    };
    void boot();
    return () => { active = false; };
  }, [client, state]);

  return null;
}
