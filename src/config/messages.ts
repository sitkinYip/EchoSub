import type { IconName } from "@/config/index";

export type MessageType = "success" | "error" | "warning" | "info";

export interface MessageConfig {
  type: MessageType;
  title: string;
  description?: string;
  duration?: number; // ms, default 4000
}

export const MESSAGE_ICONS: Record<MessageType, IconName> = {
  success: "check",
  error: "close",
  warning: "warning",
  info: "chat",
};

export const MESSAGE_BG: Record<MessageType, string> = {
  success: "bg-app-success-bg ring-app-success-ring",
  error: "bg-app-error-bg ring-app-error-ring",
  warning: "bg-app-accent-bg ring-app-accent-ring",
  info: "bg-app-surface ring-app-border",
};

export const MESSAGE_TEXT: Record<MessageType, string> = {
  success: "text-app-success",
  error: "text-app-error",
  warning: "text-app-accent",
  info: "text-app-text",
};

export const MESSAGE_ICON_BG: Record<MessageType, string> = {
  success: "bg-app-success-bg",
  error: "bg-app-error-bg",
  warning: "bg-app-accent-bg",
  info: "bg-app-surface",
};
