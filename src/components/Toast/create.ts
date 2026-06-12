import { useMessageStore } from "@/stores/messageStore";
import type { MessageConfig } from "@/config/messages";

export function showMessage(config: MessageConfig) {
  useMessageStore.getState().show(config);
}
