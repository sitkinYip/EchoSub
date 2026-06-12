import type { SubtitleItem } from "../types";

// ── 内部解析辅助 ──────────────────────────────────────

/** 标准 SRT 格式：序号 + 时间轴 + 文本，块间以空行分隔 */
const SRT_BLOCK_REGEX =
  /(\d+)\s*\n(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*\n([\s\S]*?)(?=\n\s*\n\d+\s*\n|\s*$)/g;

/** 方括号单行格式：[HH:MM:SS,mmm --> HH:MM:SS,mmm] 文本 */
const BRACKET_LINE_REGEX =
  /\[(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})\]\s*(.+)/g;

/** 统一时间分隔符为逗号（SRT 标准用逗号，部分模型可能输出句号） */
function normalizeTimestamp(ts: string): string {
  return ts.replace(".", ",");
}

/**
 * 从原始文本中解析字幕条目，自动检测格式（标准 SRT 或方括号单行）
 */
function parseRawToItems(rawText: string): SubtitleItem[] {
  // 先尝试标准 SRT 格式
  const srtItems = parseSrtBlocks(rawText);
  if (srtItems.length > 0) return srtItems;

  // 再尝试方括号格式
  return parseBracketLines(rawText);
}

function parseSrtBlocks(text: string): SubtitleItem[] {
  const items: SubtitleItem[] = [];
  const regex = new RegExp(SRT_BLOCK_REGEX.source, "g");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const content = match[4].trim();
    if (content) {
      items.push({
        index: parseInt(match[1], 10),
        start: normalizeTimestamp(match[2]),
        end: normalizeTimestamp(match[3]),
        text: content,
      });
    }
  }

  return items;
}

function parseBracketLines(text: string): SubtitleItem[] {
  const items: SubtitleItem[] = [];
  const regex = new RegExp(BRACKET_LINE_REGEX.source, "g");
  let match: RegExpExecArray | null;
  let index = 1;

  while ((match = regex.exec(text)) !== null) {
    items.push({
      index: index++,
      start: normalizeTimestamp(match[1]),
      end: normalizeTimestamp(match[2]),
      text: match[3].trim(),
    });
  }

  return items;
}

// ── 导出 API ──────────────────────────────────────────

/**
 * 解析大模型输出文本，转换为标准 SRT 格式字符串。
 * 同时支持标准 SRT 格式和方括号单行格式输入。
 */
export function parseToSrt(rawText: string): string {
  const items = parseRawToItems(rawText);
  return itemsToSrt(items);
}

/**
 * 将标准 SRT 字符串解析为 SubtitleItem 数组（用于预览编辑）
 */
export function parseSrtToItems(srtContent: string): SubtitleItem[] {
  return parseRawToItems(srtContent);
}

/**
 * 从模型流式输出的累积文本中提取所有已完成的字幕条目。
 * 返回序号大于 existingCount 的新条目，用于增量更新 UI。
 */
export function extractCompletedItems(
  accumulatedText: string,
  existingCount: number
): SubtitleItem[] {
  const allItems = parseRawToItems(accumulatedText);
  return allItems.filter((item) => item.index > existingCount);
}

/** 将 SubtitleItem[] 转换为标准 SRT 字符串 */
export function itemsToSrt(items: SubtitleItem[]): string {
  return items
    .map(
      (item, i) =>
        `${i + 1}\n${item.start} --> ${item.end}\n${item.text}\n`
    )
    .join("\n");
}
