import { create } from "zustand";
import type { MessageConfig } from "@/config/messages";

export interface ToastEntry {
  id: string;
  config: MessageConfig;
  leaving: boolean;
}

interface MessageState {
  toasts: ToastEntry[];
  show: (config: MessageConfig) => void;
  dismiss: (id: string) => void;
}

let counter = 0;

export const useMessageStore = create<MessageState>((set) => ({
  toasts: [],

  show: (config) => {
    const id = `msg_${++counter}`;
    set((s) => ({ toasts: [...s.toasts, { id, config, leaving: false }] }));

    const duration = config.duration ?? 4000;
    setTimeout(() => {
      set((s) => ({
        toasts: s.toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
      }));
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      }, 300);
    }, duration);
  },

  dismiss: (id) => {
    set((s) => ({
      toasts: s.toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
    }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 300);
  },
}));
