import { invoke } from "@tauri-apps/api/core";
import type { TranslationState } from "@/stores/translationStore";
import { killFfmpeg } from "./ffmpegService";

export type PipelineSession = {
  id: number;
  taskId: string;
  unlisten: (() => void) | null;
  rawText: string;
  tempFiles: string[];
};

let session: PipelineSession | null = null;
let nextId = 1;

function makeTaskId(): string {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function newSession(): PipelineSession {
  killSession();
  const s: PipelineSession = {
    id: nextId++,
    taskId: makeTaskId(),
    unlisten: null,
    rawText: "",
    tempFiles: [],
  };
  session = s;
  return s;
}

export function killSession() {
  if (!session) return;
  if (session.unlisten) {
    session.unlisten();
    session.unlisten = null;
  }
  invoke("cancel_task", { taskId: session.taskId }).catch(() => {});
  killFfmpeg();
  for (const p of session.tempFiles) {
    invoke("delete_file", { path: p }).catch(() => {});
  }
  session = null;
}

export function isAlive(s: PipelineSession): boolean {
  return session !== null && session.id === s.id;
}

export function requireSession(sessionId: number): PipelineSession | null {
  return session && session.id === sessionId ? session : null;
}

export function safeSet(
  ss: PipelineSession,
  rawSet: (s: Partial<TranslationState>) => void,
): (s: Partial<TranslationState>) => void {
  return (s) => {
    if (isAlive(ss)) rawSet(s);
  };
}

export function trackTemp(ss: PipelineSession, path: string) {
  ss.tempFiles.push(path);
}

export async function createTempPath(ext: string): Promise<string> {
  return (await invoke("create_temp_media_path", { ext })) as string;
}
