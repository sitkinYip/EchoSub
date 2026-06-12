import { useModalStore } from "@/stores/modalStore";
import type { ModalConfig } from "@/config/modals";

/**
 * 命令式打开弹窗。
 * @param name  弹窗名（需在 MODAL_REGISTRY 中注册）
 * @param data  透传给弹窗内容组件的数据
 * @param config 可覆盖注册时默认配置
 */
export function showModal<D = unknown>(
  name: string,
  data?: D,
  config?: Partial<ModalConfig>
) {
  useModalStore.getState().show(name, data, config);
}

/**
 * 命令式关闭弹窗。
 * @param id 弹窗实例 id，不传则关闭全部
 */
export function closeModal(id?: string) {
  useModalStore.getState().close(id);
}
