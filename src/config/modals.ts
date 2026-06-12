import type React from "react";

export interface ModalContentProps<D = unknown> {
  close: () => void;
  data: D;
}

/** 弹窗内容组件类型 */
export type ModalComponent<D = unknown> = React.ComponentType<ModalContentProps<D>>;

/** 单个弹窗实例的运行时配置 */
export interface ModalConfig {
  /** 是否点击遮罩关闭 */
  maskClosable: boolean;
  /** 是否显示关闭按钮 */
  showClose: boolean;
  /** 宽度预设 */
  width: "sm" | "md" | "lg";
}

/** 默认配置 */
export const DEFAULT_MODAL_CONFIG: ModalConfig = {
  maskClosable: true,
  showClose: true,
  width: "sm",
};

/** 弹窗宽度映射 */
export const MODAL_WIDTHS: Record<ModalConfig["width"], string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

/** 弹窗注册名枚举 — 在此追加新弹窗 */
export enum ModalName {
  ApiKey = "ApiKey",
  HistoryEdit = "HistoryEdit",
  RegenerateConfirm = "RegenerateConfirm",
}

/**
 * 中央注册表：每个弹窗的默认配置 + 懒加载组件工厂。
 * 新增弹窗时在此追加一条。
 */
export const MODAL_REGISTRY: Record<
  ModalName,
  {
    defaults: Partial<ModalConfig>;
    /** 动态 import 避免循环依赖 */
    loader: () => Promise<{ default: ModalComponent<any> }>;
  }
> = {
  [ModalName.ApiKey]: {
    defaults: { maskClosable: false, showClose: false, width: "sm" },
    loader: () => import("../components/ApiKeyModal/index.tsx"),
  },
  [ModalName.HistoryEdit]: {
    defaults: { maskClosable: false, showClose: true, width: "lg" },
    loader: () => import("../pages/HistoryPage/HistoryEditModal.tsx"),
  },
  [ModalName.RegenerateConfirm]: {
    defaults: { maskClosable: true, showClose: true, width: "sm" },
    loader: () => import("../pages/HistoryPage/RegenerateConfirmModal.tsx"),
  },
};
