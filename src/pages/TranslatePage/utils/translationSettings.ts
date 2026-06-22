import type { TranslateEngine, TranslationFallback } from "@/config";
import type { HistoryEntry, Language } from "@/types";

/**
 * 重新生成时用于覆盖全局设置的参数集合。
 * 所有字段可选：缺失的字段回退到 settingsStore 的全局值。
 *
 * 在 useTranslationStarter 里与全局设置合并，决定本次翻译实际使用的参数。
 * 重新生成场景下完全不写全局设置，只通过 overrides 传递本次会话独立值。
 */
export interface TranslationOverrides {
  engine?: TranslateEngine;
  translationFallback?: TranslationFallback;
  whisperModelId?: string;
  whisperModelPath?: string;
  translateModelId?: string;
  translateModelPath?: string;
  sourceLang?: Language;
  targetLang?: Language;
  uploadVideo?: boolean;
}

/**
 * 重新生成弹窗内部使用的完整设置快照。
 * 由 resolveRegenerateSettings 从历史记录推导，缺失字段降级全局。
 */
export interface ResolvedRegenerateSettings {
  engine: TranslateEngine;
  translationFallback: TranslationFallback;
  whisperModelId: string;
  whisperModelPath: string;
  translateModelId: string;
  translateModelPath: string;
  sourceLang: Language;
  targetLang: Language;
  uploadVideo: boolean;
}

/**
 * resolveRegenerateSettings 的全局设置输入。
 * 字段集合与 settingsStore 暴露的翻译相关设置对齐。
 */
export interface GlobalTranslationSettings {
  engine: TranslateEngine;
  translationFallback: TranslationFallback;
  whisperModelId: string;
  whisperModelPath: string;
  translateModelId: string;
  translateModelPath: string;
  uploadVideo: boolean;
}

export interface ResolvedRegenerateResult {
  settings: ResolvedRegenerateSettings;
  /**
   * 历史记录的 6 个引擎/模型字段是否全部存在。
   * false 时弹窗展示降级提示，告诉用户已用当前默认设置。
   */
  restored: boolean;
}

/**
 * 推导重新生成弹窗的初始设置。
 *
 * 规则：
 * - engine / fallback / 4 个模型字段：历史记录有值就用历史值，否则降级全局。
 * - sourceLang / targetLang：始终取历史记录（语言是翻译方向，必须和原记录一致）。
 * - uploadVideo：历史 mode==="video"，但推导出的 engine==="local" 时强制 false
 *   （本地引擎不支持视频模式，开关隐藏）。
 * - restored：6 个引擎/模型字段全部存在才为 true。
 */
export function resolveRegenerateSettings(
  history: Pick<
    HistoryEntry,
    | "mode"
    | "sourceLang"
    | "targetLang"
    | "engine"
    | "translationFallback"
    | "whisperModelId"
    | "whisperModelPath"
    | "translateModelId"
    | "translateModelPath"
  >,
  global: GlobalTranslationSettings,
): ResolvedRegenerateResult {
  const historyHasEngineSettings = Boolean(
    history.engine &&
    history.translationFallback &&
    history.whisperModelPath &&
    history.translateModelPath,
  );

  const engine = (history.engine ?? global.engine) as TranslateEngine;
  const translationFallback = (history.translationFallback ??
    global.translationFallback) as TranslationFallback;
  const whisperModelId = history.whisperModelId ?? global.whisperModelId;
  const whisperModelPath = history.whisperModelPath ?? global.whisperModelPath;
  const translateModelId = history.translateModelId ?? global.translateModelId;
  const translateModelPath = history.translateModelPath ?? global.translateModelPath;

  // 本地引擎不支持视频模式，强制走音频。
  const rawUploadVideo = history.mode === "video";
  const uploadVideo = engine === "cloud" ? rawUploadVideo : false;

  return {
    settings: {
      engine,
      translationFallback,
      whisperModelId,
      whisperModelPath,
      translateModelId,
      translateModelPath,
      sourceLang: history.sourceLang,
      targetLang: history.targetLang,
      uploadVideo,
    },
    restored: historyHasEngineSettings,
  };
}

export interface LocalModelGapResult {
  /**
   * 缺失的本地模型类型，决定 ModelManager 打开哪个 tab。
   * null 表示模型齐全，可以直接启动。
   */
  missing: "whisper" | "translate" | null;
  /** 跨语言 + local-only 才需要翻译模型，其它 fallback 走云端翻译。 */
  needsTranslateModel: boolean;
}

/**
 * 检查本地引擎下模型是否齐全。
 *
 * 从 useTranslationStarter 抽出的纯逻辑，新文件翻译和重新生成都复用。
 * 规则：
 * - whisper 模型缺失 → missing="whisper"
 * - 需要翻译模型（跨语言 + local-only）且翻译模型缺失 → missing="translate"
 * - 其它情况 → missing=null
 */
export function checkLocalModelGap(settings: {
  sourceLang: Language;
  targetLang: Language;
  translationFallback: TranslationFallback;
  whisperModelPath: string;
  translateModelPath: string;
}): LocalModelGapResult {
  const needsTranslateModel =
    settings.sourceLang !== settings.targetLang && settings.translationFallback === "local-only";

  if (!settings.whisperModelPath) {
    return { missing: "whisper", needsTranslateModel };
  }
  if (needsTranslateModel && !settings.translateModelPath) {
    return { missing: "translate", needsTranslateModel };
  }
  return { missing: null, needsTranslateModel };
}

/**
 * 将 ResolvedRegenerateSettings 转成 TranslationOverrides。
 * 弹窗确认时调用，传给 setRegenerate / startTranslation。
 */
export function toOverrides(settings: ResolvedRegenerateSettings): Required<TranslationOverrides> {
  return {
    engine: settings.engine,
    translationFallback: settings.translationFallback,
    whisperModelId: settings.whisperModelId,
    whisperModelPath: settings.whisperModelPath,
    translateModelId: settings.translateModelId,
    translateModelPath: settings.translateModelPath,
    sourceLang: settings.sourceLang,
    targetLang: settings.targetLang,
    uploadVideo: settings.uploadVideo,
  };
}
