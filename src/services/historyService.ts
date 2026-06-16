import { Store } from "@tauri-apps/plugin-store";
import type { HistoryEntry } from "@/types";

const STORE_VERSION = 1;

let saving = false;
let pendingEntries: HistoryEntry[] | null = null;

export async function loadHistory(): Promise<HistoryEntry[]> {
  try {
    const store = await Store.load("history.json");
    const version = await store.get<number>("_version");
    if (version !== STORE_VERSION) {
      await store.set("_version", STORE_VERSION);
      await store.save();
    }
    return (await store.get<HistoryEntry[]>("entries")) || [];
  } catch {
    console.warn("加载历史记录失败");
    return [];
  }
}

export async function saveHistory(entries: HistoryEntry[]): Promise<void> {
  pendingEntries = entries;
  if (saving) return;
  saving = true;
  while (pendingEntries) {
    const batch = pendingEntries;
    pendingEntries = null;
    try {
      const store = await Store.load("history.json");
      await store.set("_version", STORE_VERSION);
      await store.set("entries", batch);
      await store.save();
    } catch (err) { console.error("保存历史记录失败:", err); }
  }
  saving = false;
}
