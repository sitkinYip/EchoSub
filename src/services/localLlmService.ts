import { invoke } from "@tauri-apps/api/core";

export type LocalLlmServerStatus = {
  running: boolean;
  pid?: number | null;
  modelPath?: string | null;
  host: string;
  port: number;
  url: string;
};

export type StartLocalLlmOptions = {
  modelPath: string;
  port?: number;
  ctxSize?: number;
};

export async function startLocalLlmServer(
  options: StartLocalLlmOptions,
): Promise<LocalLlmServerStatus> {
  return (await invoke("start_local_llm_server", {
    req: {
      modelPath: options.modelPath,
      port: options.port ?? null,
      ctxSize: options.ctxSize ?? null,
    },
  })) as LocalLlmServerStatus;
}

export async function stopLocalLlmServer(): Promise<void> {
  await invoke("stop_local_llm_server");
}

export async function getLocalLlmServerStatus(): Promise<LocalLlmServerStatus> {
  return (await invoke("get_local_llm_server_status")) as LocalLlmServerStatus;
}
