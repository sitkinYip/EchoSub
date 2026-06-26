import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { showMessage } from "@/components/Toast/create";
import { useSettingsStore } from "@/stores/settingsStore";
import type { ModalContentProps } from "@/config/modals";
import {
  deleteTranslateModel,
  deleteWhisperModel,
  downloadTranslateModel,
  downloadVadModel,
  downloadWhisperModel,
  getLocalTranslateModels,
  getLocalWhisperModels,
  listTranslateModels,
  listWhisperModels,
  onModelDownloadProgress,
  VAD_MODEL_ID,
  checkVadModelExists,
  type LocalTranslateModel,
  type LocalWhisperModel,
  type ModelDownloadProgress,
  type TranslateModel,
  type WhisperModel,
} from "@/services/whisperService";

type ModelManagerData = {
  initialTab?: "whisper" | "translate";
  selectedId?: string;
  selectedPath?: string;
  onSelected?: (model: LocalWhisperModel) => void | Promise<void>;
  selectedTranslateId?: string;
  selectedTranslatePath?: string;
  onTranslateSelected?: (model: LocalTranslateModel) => void | Promise<void>;
};

type BusyKey = `whisper:${string}` | `translate:${string}` | "vad";

function formatMB(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function ModelManagerModal({ close, data }: ModalContentProps<ModelManagerData>) {
  const [activeTab, setActiveTab] = useState<"whisper" | "translate">(
    data?.initialTab || "whisper",
  );
  const [models, setModels] = useState<WhisperModel[]>([]);
  const [localModels, setLocalModels] = useState<LocalWhisperModel[]>([]);
  const [translateModels, setTranslateModels] = useState<TranslateModel[]>([]);
  const [localTranslateModels, setLocalTranslateModels] = useState<LocalTranslateModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<BusyKey | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, ModelDownloadProgress>>({});
  const [selectedWhisper, setSelectedWhisper] = useState({
    id: data?.selectedId || "",
    path: data?.selectedPath || "",
  });
  const [selectedTranslate, setSelectedTranslate] = useState({
    id: data?.selectedTranslateId || "",
    path: data?.selectedTranslatePath || "",
  });
  const [vadInstalled, setVadInstalled] = useState(false);
  const [vadBusy, setVadBusy] = useState(false);
  const [vadError, setVadError] = useState<string | null>(null);
  const validateLocalModels = useSettingsStore((s) => s.validateLocalModels);

  const localById = useMemo(() => {
    const map = new Map<string, LocalWhisperModel>();
    for (const model of localModels) map.set(model.id, model);
    return map;
  }, [localModels]);

  const localTranslateById = useMemo(() => {
    const map = new Map<string, LocalTranslateModel>();
    for (const model of localTranslateModels) map.set(model.id, model);
    return map;
  }, [localTranslateModels]);

  const refresh = async () => {
    const [remote, local, translateRemote, translateLocal, vadExists] = await Promise.all([
      listWhisperModels(),
      getLocalWhisperModels(),
      listTranslateModels(),
      getLocalTranslateModels(),
      checkVadModelExists(),
    ]);
    setModels(remote);
    setLocalModels(local);
    setTranslateModels(translateRemote);
    setLocalTranslateModels(translateLocal);
    setVadInstalled(vadExists);
  };

  useEffect(() => {
    let mounted = true;
    refresh()
      .catch((err) => {
        showMessage({
          type: "error",
          title: "模型列表加载失败",
          description: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setSelectedWhisper({
      id: data?.selectedId || "",
      path: data?.selectedPath || "",
    });
    setSelectedTranslate({
      id: data?.selectedTranslateId || "",
      path: data?.selectedTranslatePath || "",
    });
  }, [
    data?.selectedId,
    data?.selectedPath,
    data?.selectedTranslateId,
    data?.selectedTranslatePath,
  ]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    onModelDownloadProgress((p) => {
      setProgress((current) => ({ ...current, [p.id]: p }));
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  const selectLocal = async (model: LocalWhisperModel) => {
    setSelectedWhisper({ id: model.id, path: model.path });
    await data?.onSelected?.(model);
    close();
  };

  const selectTranslateLocal = async (model: LocalTranslateModel) => {
    setSelectedTranslate({ id: model.id, path: model.path });
    await data?.onTranslateSelected?.(model);
    close();
  };

  const download = async (model: WhisperModel) => {
    setBusyKey(`whisper:${model.id}`);
    setInlineError(null);
    try {
      const path = await downloadWhisperModel(model.id);
      await refresh();
      const localModel = {
        id: model.id,
        label: model.label,
        fileName: model.fileName,
        path,
        size: model.sizeMb * 1024 * 1024,
      };
      setSelectedWhisper({ id: localModel.id, path: localModel.path });
      await data?.onSelected?.(localModel);
      showMessage({ type: "success", title: "模型已下载", description: model.label });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setInlineError(message);
      showMessage({
        type: "error",
        title: "模型下载失败",
        description: message,
        duration: 8000,
      });
    } finally {
      setBusyKey(null);
    }
  };

  const downloadTranslate = async (model: TranslateModel) => {
    setBusyKey(`translate:${model.id}`);
    setInlineError(null);
    try {
      const path = await downloadTranslateModel(model.id);
      await refresh();
      const localModel = {
        id: model.id,
        label: model.label,
        fileName: model.fileName,
        path,
        size: model.sizeMb * 1024 * 1024,
      };
      setSelectedTranslate({ id: localModel.id, path: localModel.path });
      await data?.onTranslateSelected?.(localModel);
      showMessage({ type: "success", title: "翻译模型已下载", description: model.label });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setInlineError(message);
      showMessage({
        type: "error",
        title: "翻译模型下载失败",
        description: message,
        duration: 8000,
      });
    } finally {
      setBusyKey(null);
    }
  };

  const remove = async (model: LocalWhisperModel) => {
    setBusyKey(`whisper:${model.id}`);
    setInlineError(null);
    try {
      await deleteWhisperModel(model.path);
      await refresh();
      const validation = await validateLocalModels();
      if (
        selectedWhisper.path === model.path ||
        selectedWhisper.id === model.id ||
        validation.whisperCleared
      ) {
        setSelectedWhisper({ id: "", path: "" });
      }
      showMessage({ type: "success", title: "模型已删除", description: model.label });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setInlineError(message);
      showMessage({
        type: "error",
        title: "模型删除失败",
        description: message,
      });
    } finally {
      setBusyKey(null);
    }
  };

  const removeTranslate = async (model: LocalTranslateModel) => {
    setBusyKey(`translate:${model.id}`);
    setInlineError(null);
    try {
      await deleteTranslateModel(model.path);
      await refresh();
      const validation = await validateLocalModels();
      if (
        selectedTranslate.path === model.path ||
        selectedTranslate.id === model.id ||
        validation.translateCleared
      ) {
        setSelectedTranslate({ id: "", path: "" });
      }
      showMessage({ type: "success", title: "翻译模型已删除", description: model.label });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setInlineError(message);
      showMessage({
        type: "error",
        title: "翻译模型删除失败",
        description: message,
      });
    } finally {
      setBusyKey(null);
    }
  };

  const downloadVad = async () => {
    setVadBusy(true);
    setVadError(null);
    try {
      await downloadVadModel();
      await refresh();
      showMessage({
        type: "success",
        title: "VAD 降噪模型已下载",
        description: "本地转录将自动启用语音活动检测，过滤纯音乐/无人声段。",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setVadError(message);
      showMessage({
        type: "error",
        title: "VAD 模型下载失败",
        description: message,
        duration: 8000,
      });
    } finally {
      setVadBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-app-text">本地模型管理</h3>
        <p className="mt-1 text-xs text-app-text-tertiary">
          识别模型用于音频转字幕，翻译模型用于后续本地字幕翻译。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-xl bg-app-surface p-1 ring-1 ring-app-border-light">
        {(
          [
            ["whisper", "语音识别"],
            ["translate", "字幕翻译"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              activeTab === key
                ? "bg-app-elevated text-app-text ring-1 ring-app-border"
                : "text-app-text-tertiary hover:text-app-text-secondary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {inlineError && (
        <div className="rounded-lg bg-app-error-bg ring-1 ring-app-error-ring px-3 py-2 text-xs text-app-error leading-relaxed break-words">
          {inlineError}
        </div>
      )}

      {/* VAD 降噪模型（辅助模型，服务于识别与翻译：过滤纯音乐/无人声段，去除 [音乐] 等非语音内容） */}
      {(() => {
        const p = progress[VAD_MODEL_ID];
        return (
          <div
            className={`rounded-lg ring-1 p-3 transition-colors ${
              vadInstalled
                ? "bg-app-success-bg ring-app-success-ring"
                : "bg-app-surface ring-app-border"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-app-surface-alt ring-1 ring-app-border-light flex items-center justify-center flex-shrink-0">
                <Icon name="waveform" className="w-4 h-4 text-app-text-secondary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-app-text">VAD 降噪模型</span>
                  {vadInstalled ? (
                    <span className="text-[10px] text-app-success bg-app-success-bg ring-1 ring-app-success-ring rounded px-1.5 py-0.5">
                      已启用
                    </span>
                  ) : (
                    <span className="text-[10px] text-app-text-tertiary bg-app-surface ring-1 ring-app-border-light rounded px-1.5 py-0.5">
                      可选
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-app-text-tertiary">
                  语音活动检测 · 约 2 MB · 过滤纯音乐、静音、无人声段，自动去除 [音乐] 等非语音字幕。
                  未下载不影响使用，仅少一层音频级过滤。
                </p>
                {vadBusy && p?.percent !== undefined && p.percent !== null && (
                  <div className="mt-3 space-y-1">
                    <div className="h-1.5 rounded-full bg-app-border overflow-hidden">
                      <div
                        className="h-full bg-app-accent transition-all"
                        style={{ width: `${p.percent}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-app-text-tertiary">下载中 {p.percent}%</p>
                  </div>
                )}
                {vadBusy && (p?.percent === undefined || p.percent === null) && (
                  <p className="mt-2 text-[10px] text-app-text-tertiary">正在连接下载源...</p>
                )}
                {vadError && (
                  <p className="mt-2 text-[10px] text-app-error leading-relaxed break-words">
                    {vadError}
                  </p>
                )}
              </div>
              {!vadInstalled && (
                <button
                  onClick={downloadVad}
                  className="w-8 h-8 rounded-lg bg-app-surface hover:bg-app-hover ring-1 ring-app-border-light flex items-center justify-center text-app-text-secondary transition-colors disabled:opacity-50 flex-shrink-0"
                  disabled={vadBusy || !!busyKey}
                  title="下载 VAD 降噪模型"
                >
                  <Icon
                    name={vadBusy ? "spinner" : "download-cloud"}
                    className={`w-3.5 h-3.5 ${vadBusy ? "animate-spin" : ""}`}
                  />
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-app-text-tertiary py-8">
          <Icon name="spinner" className="w-4 h-4 animate-spin" />
          读取模型列表中...
        </div>
      ) : activeTab === "whisper" ? (
        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {models.map((model) => {
            const local = localById.get(model.id);
            const isSelected =
              selectedWhisper.path === local?.path ||
              (!selectedWhisper.path && selectedWhisper.id === model.id);
            const p = progress[model.id];
            const isBusy = busyKey === `whisper:${model.id}`;
            return (
              <div
                key={model.id}
                className={`rounded-lg ring-1 p-3 transition-colors ${
                  isSelected
                    ? "bg-app-accent-bg ring-app-accent-ring"
                    : "bg-app-surface ring-app-border"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-app-surface-alt ring-1 ring-app-border-light flex items-center justify-center flex-shrink-0">
                    <Icon name="cpu" className="w-4 h-4 text-app-text-secondary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-app-text">{model.label}</span>
                      {model.recommended && (
                        <span className="text-[10px] text-app-accent bg-app-accent-bg ring-1 ring-app-accent-ring rounded px-1.5 py-0.5">
                          推荐
                        </span>
                      )}
                      {local && (
                        <span className="text-[10px] text-app-success bg-app-success-bg ring-1 ring-app-success-ring rounded px-1.5 py-0.5">
                          已下载
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-app-text-tertiary">
                      {model.language} · 约 {model.sizeMb} MB
                      {local ? ` · 本地 ${formatMB(local.size)}` : ""}
                    </p>
                    {isBusy && p?.percent !== undefined && p.percent !== null && (
                      <div className="mt-3 space-y-1">
                        <div className="h-1.5 rounded-full bg-app-border overflow-hidden">
                          <div
                            className="h-full bg-app-accent transition-all"
                            style={{ width: `${p.percent}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-app-text-tertiary">下载中 {p.percent}%</p>
                      </div>
                    )}
                    {isBusy && (p?.percent === undefined || p.percent === null) && (
                      <p className="mt-2 text-[10px] text-app-text-tertiary">正在连接下载源...</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {local ? (
                      <>
                        <button
                          onClick={() => selectLocal(local)}
                          className="px-2.5 py-1.5 rounded-lg bg-app-accent text-white text-[11px] font-medium disabled:opacity-50"
                          disabled={isSelected}
                        >
                          {isSelected ? "已选用" : "选用"}
                        </button>
                        <button
                          onClick={() => remove(local)}
                          className="w-8 h-8 rounded-lg bg-app-surface hover:bg-app-hover ring-1 ring-app-border-light flex items-center justify-center text-app-text-tertiary hover:text-app-error transition-colors"
                          disabled={isBusy}
                          title="删除模型"
                        >
                          <Icon name="trash" className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => download(model)}
                        className="w-8 h-8 rounded-lg bg-app-surface hover:bg-app-hover ring-1 ring-app-border-light flex items-center justify-center text-app-text-secondary transition-colors disabled:opacity-50"
                        disabled={isBusy || !!busyKey}
                        title="下载模型"
                      >
                        <Icon
                          name={isBusy ? "spinner" : "download-cloud"}
                          className={`w-3.5 h-3.5 ${isBusy ? "animate-spin" : ""}`}
                        />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {translateModels.map((model) => {
            const local = localTranslateById.get(model.id);
            const isSelected =
              selectedTranslate.path === local?.path ||
              (!selectedTranslate.path && selectedTranslate.id === model.id);
            const p = progress[model.id];
            const isBusy = busyKey === `translate:${model.id}`;
            return (
              <div
                key={model.id}
                className={`rounded-lg ring-1 p-3 transition-colors ${
                  isSelected
                    ? "bg-app-accent-bg ring-app-accent-ring"
                    : "bg-app-surface ring-app-border"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-app-surface-alt ring-1 ring-app-border-light flex items-center justify-center flex-shrink-0">
                    <Icon name="chat" className="w-4 h-4 text-app-text-secondary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-app-text">{model.label}</span>
                      {model.recommended && (
                        <span className="text-[10px] text-app-accent bg-app-accent-bg ring-1 ring-app-accent-ring rounded px-1.5 py-0.5">
                          推荐
                        </span>
                      )}
                      {local && (
                        <span className="text-[10px] text-app-success bg-app-success-bg ring-1 ring-app-success-ring rounded px-1.5 py-0.5">
                          已下载
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-app-text-tertiary">
                      {model.language} · 约 {model.sizeMb} MB
                      {local ? ` · 本地 ${formatMB(local.size)}` : ""}
                    </p>
                    <p className="mt-1 text-[11px] text-app-text-tertiary">{model.note}</p>
                    {isBusy && p?.percent !== undefined && p.percent !== null && (
                      <div className="mt-3 space-y-1">
                        <div className="h-1.5 rounded-full bg-app-border overflow-hidden">
                          <div
                            className="h-full bg-app-accent transition-all"
                            style={{ width: `${p.percent}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-app-text-tertiary">下载中 {p.percent}%</p>
                      </div>
                    )}
                    {isBusy && (p?.percent === undefined || p.percent === null) && (
                      <p className="mt-2 text-[10px] text-app-text-tertiary">正在连接下载源...</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {local ? (
                      <>
                        <button
                          onClick={() => selectTranslateLocal(local)}
                          className="px-2.5 py-1.5 rounded-lg bg-app-accent text-white text-[11px] font-medium disabled:opacity-50"
                          disabled={isSelected}
                        >
                          {isSelected ? "已选用" : "选用"}
                        </button>
                        <button
                          onClick={() => removeTranslate(local)}
                          className="w-8 h-8 rounded-lg bg-app-surface hover:bg-app-hover ring-1 ring-app-border-light flex items-center justify-center text-app-text-tertiary hover:text-app-error transition-colors"
                          disabled={isBusy}
                          title="删除翻译模型"
                        >
                          <Icon name="trash" className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => downloadTranslate(model)}
                        className="w-8 h-8 rounded-lg bg-app-surface hover:bg-app-hover ring-1 ring-app-border-light flex items-center justify-center text-app-text-secondary transition-colors disabled:opacity-50"
                        disabled={isBusy || !!busyKey}
                        title="下载翻译模型"
                      >
                        <Icon
                          name={isBusy ? "spinner" : "download-cloud"}
                          className={`w-3.5 h-3.5 ${isBusy ? "animate-spin" : ""}`}
                        />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
