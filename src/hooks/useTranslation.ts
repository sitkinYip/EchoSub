import { useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { SubtitleItem, Language } from "../types";

/**
 * 解析模型输出的字幕文本，同时支持两种格式：
 *
 * 格式 1 - 标准 SRT：
 *   1
 *   00:00:02,645 --> 00:00:07,935
 *   See you never come my way
 *
 * 格式 2 - 方括号单行：
 *   [00:00:02,645 --> 00:00:07,935] See you never come my way
 */
function parseModelOutput(rawText: string): SubtitleItem[] {
  // 先尝试标准 SRT 格式
  const srtItems = parseSrtFormat(rawText);
  if (srtItems.length > 0) {
    return srtItems;
  }

  // 再尝试方括号格式
  return parseBracketFormat(rawText);
}

/** 解析标准 SRT 格式（序号 + 时间轴 + 文本，块之间以空行分隔） */
function parseSrtFormat(rawText: string): SubtitleItem[] {
  const items: SubtitleItem[] = [];
  const blockRegex =
    /(\d+)\s*\n(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*\n([\s\S]*?)(?=\n\s*\n\d+\s*\n|\s*$)/g;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(rawText)) !== null) {
    const start = match[2].replace(".", ",");
    const end = match[3].replace(".", ",");
    const text = match[4].trim();
    if (text) {
      items.push({ index: parseInt(match[1], 10), start, end, text });
    }
  }

  return items;
}

/** 解析方括号单行格式：[HH:MM:SS,mmm --> HH:MM:SS,mmm] 文本 */
function parseBracketFormat(rawText: string): SubtitleItem[] {
  const lineRegex =
    /\[(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})\]\s*(.+)/g;
  const items: SubtitleItem[] = [];
  let match: RegExpExecArray | null;
  let index = 1;

  while ((match = lineRegex.exec(rawText)) !== null) {
    const start = match[1].replace(".", ",");
    const end = match[2].replace(".", ",");
    items.push({ index, start, end, text: match[3].trim() });
    index++;
  }

  return items;
}

/**
 * Hook: 调用 Rust 后端进行流式翻译。
 *
 * Rust 端负责：读取文件 → base64 → POST DashScope → SSE 解析
 * 前端通过 Tauri 事件 `translate-chunk` / `translate-done` 接收结果。
 *
 * JS 内存中不再出现 base64 字符串，彻底避免 OOM。
 */
export function useTranslation() {
  const [subtitleItems, setSubtitleItems] = useState<SubtitleItem[]>([]);
  const [rawPreviewText, setRawPreviewText] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState("");
  const rawTextRef = useRef("");
  const unlistenRef = useRef<(() => void) | null>(null);

  /** 开始流式翻译（调用 Rust stream_translate_file） */
  const startTranslation = useCallback(
    async (
      apiKey: string,
      filePath: string,
      mediaType: "audio" | "video",
      sourceLang: Language,
      targetLang: Language
    ): Promise<void> => {
      setIsTranslating(true);
      setTranslationError(null);
      setSubtitleItems([]);
      setRawPreviewText("");
      rawTextRef.current = "";

      // 清理旧的监听器
      unlistenRef.current?.();
      unlistenRef.current = null;

      try {
        // 注册事件监听
        const unlistenProgress = await listen<string>("translate-progress", (event) => {
          setProgressMessage(event.payload);
        });

        const unlisten1 = await listen<string>("translate-chunk", (event) => {
          rawTextRef.current += event.payload;
          const preview =
            rawTextRef.current.length > 2000
              ? "..." + rawTextRef.current.slice(-2000)
              : rawTextRef.current;
          setRawPreviewText(preview);
        });

        const unlisten2 = await listen("translate-done", () => {
          unlistenProgress();
          unlisten1();
          unlisten2();
          unlistenRef.current = null;
          setProgressMessage("");

          const raw = rawTextRef.current;
          console.log("=====[翻译] 模型原始输出开始=====");
          console.log(raw);
          console.log("=====[翻译] 模型原始输出结束=====");

          const items = parseModelOutput(raw);
          console.log("[翻译] 解析到", items.length, "条字幕");

          if (items.length === 0 && raw.trim().length > 0) {
            console.warn("[翻译] 无法解析字幕格式，将原始文本作为单条字幕保留");
            setSubtitleItems([{
              index: 1,
              start: "00:00:00,000",
              end: "00:00:00,000",
              text: raw.trim(),
            }]);
          } else {
            setSubtitleItems(items);
          }

          setRawPreviewText("");
          setIsTranslating(false);
        });

        unlistenRef.current = () => {
          unlistenProgress();
          unlisten1();
          unlisten2();
        };

        // 调用 Rust 命令
        await invoke("stream_translate_file", {
          req: {
            filePath,
            apiKey,
            mediaType,
            sourceLang,
            targetLang,
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[翻译] 错误:", msg);
        setTranslationError(msg);
        setIsTranslating(false);
        unlistenRef.current?.();
        unlistenRef.current = null;
      }
    },
    []
  );

  const cancelTranslation = useCallback(() => {
    unlistenRef.current?.();
    unlistenRef.current = null;
    setIsTranslating(false);
  }, []);

  const updateSubtitleText = useCallback(
    (index: number, newText: string) => {
      setSubtitleItems((prev) =>
        prev.map((item) =>
          item.index === index ? { ...item, text: newText } : item
        )
      );
    },
    []
  );

  const resetTranslation = useCallback(() => {
    unlistenRef.current?.();
    unlistenRef.current = null;
    setSubtitleItems([]);
    setRawPreviewText("");
    setTranslationError(null);
    rawTextRef.current = "";
  }, []);

  return {
    subtitleItems,
    setSubtitleItems,
    rawPreviewText,
    isTranslating,
    translationError,
    progressMessage,
    startTranslation,
    cancelTranslation,
    updateSubtitleText,
    resetTranslation,
  };
}
