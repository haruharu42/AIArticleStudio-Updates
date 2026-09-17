"use client";

import { useEffect } from "react";

import { loadActiveKnowledgeCatalog } from "@/lib/knowledge-catalog";
import { setRuntimeKnowledgeCatalog } from "@/lib/knowledge-engine";
import { getSupabaseClient } from "@/lib/supabase";

export function KnowledgeRuntimeBootstrap() {
  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        const client = getSupabaseClient();
        const { data: { user } } = await client.auth.getUser();
        if (!active || !user) {
          if (active) setRuntimeKnowledgeCatalog([]);
          return;
        }
        const rules = await loadActiveKnowledgeCatalog(client);
        if (active) setRuntimeKnowledgeCatalog(rules);
      } catch {
        if (active) setRuntimeKnowledgeCatalog([]);
      }
    };
    void boot();
    return () => { active = false; };
  }, []);
  return null;
}
