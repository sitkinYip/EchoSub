import { create } from "zustand";
import type { ModalConfig, ModalComponent } from "@/config/modals";
import { DEFAULT_MODAL_CONFIG, MODAL_REGISTRY } from "@/config/modals";

export interface ModalEntry {
  id: string;
  name: string;
  data: unknown;
  config: ModalConfig;
  Component: ModalComponent<unknown> | null;
  /** 是否正在关闭（播放退场动画） */
  leaving: boolean;
}

interface ModalState {
  stack: ModalEntry[];
  /** 入队并显示 */
  show: <D>(name: string, data?: D, config?: Partial<ModalConfig>) => void;
  /** 关闭顶层弹窗 */
  closeTop: () => void;
  /** 关闭指定弹窗（不传关闭全部） */
  close: (id?: string) => void;
  /** 标记 leaving 为 true（动画结束后真正移除） */
  markLeaving: (id: string) => void;
}

let idCounter = 0;

export const useModalStore = create<ModalState>((set, get) => ({
  stack: [],

  show: async <D>(name: string, data?: D, config?: Partial<ModalConfig>) => {
    const entry = MODAL_REGISTRY[name as keyof typeof MODAL_REGISTRY];
    if (!entry) {
      console.warn(`[Modal] 未注册的弹窗: ${name}`);
      return;
    }

    const resolved: ModalConfig = { ...DEFAULT_MODAL_CONFIG, ...entry.defaults, ...config };
    const id = `modal_${++idCounter}`;

    // 先入队占位（Component 为 null），同时触发展示遮罩/骨架
    set((s) => ({
      stack: [
        ...s.stack,
        { id, name, data: data ?? {}, config: resolved, Component: null, leaving: false },
      ],
    }));

    // 异步加载组件
    try {
      const mod = await entry.loader();
      set((s) => ({
        stack: s.stack.map((m) => (m.id === id ? { ...m, Component: mod.default } : m)),
      }));
    } catch (err) {
      console.error(`[Modal] 加载弹窗组件失败: ${name}`, err);
      get().close(id);
    }
  },

  closeTop: () => {
    const { stack } = get();
    if (stack.length === 0) return;
    const top = stack[stack.length - 1];
    get().markLeaving(top.id);
  },

  close: (id) => {
    const { stack } = get();
    if (!id) {
      // 关闭全部
      stack.forEach((m) => get().markLeaving(m.id));
      return;
    }
    get().markLeaving(id);
  },

  markLeaving: (id) => {
    set((s) => ({
      stack: s.stack.map((m) => (m.id === id ? { ...m, leaving: true } : m)),
    }));
    // 动画结束后移除
    setTimeout(() => {
      set((s) => ({ stack: s.stack.filter((m) => m.id !== id) }));
    }, 300);
  },
}));
