import { invoke } from "@tauri-apps/api/core";
import type { TranslationState } from "@/stores/translationStore";

type PipelineSession = {
  id: number;
  unlisten: (() => void) | null;
  rawText: string;
  tempFiles: string[];
};

let session: PipelineSession | null = null;
let nextId = 1;

export function newSession(): PipelineSession {
  killSession();
  const s: PipelineSession = { id: nextId++, unlisten: null, rawText: "", tempFiles: [] };
  session = s;
  return s;
}

export function killSession() {
  if (!session) return;
  if (session.unlisten) { session.unlisten(); session.unlisten = null; }
  for (const p of session.tempFiles) {
    invoke("delete_file", { path: p }).catch(() => {});
  }
  session = null;
}

export function isAlive(s: PipelineSession): boolean {
  return session !== null && session.id === s.id;
}

export function safeSet(
  ss: PipelineSession,
  rawSet: (s: Partial<TranslationState>) => void,
): (s: Partial<TranslationState>) => void {
  return (s) => { if (isAlive(ss)) rawSet(s); };
}
