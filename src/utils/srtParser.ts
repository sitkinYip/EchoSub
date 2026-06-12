import type { SubtitleItem } from "@/types";

const SRT_BLOCK = /(\d+)\s*\n(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*\n([\s\S]*?)(?=\n\s*\n\d+\s*\n|\s*$)/g;
const BRACKET_LINE = /\[(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})\]\s*(.+)/g;

function norm(ts: string) { return ts.replace(".", ","); }

export function parseModelOutput(rawText: string): SubtitleItem[] {
  const items = parseSrt(rawText);
  if (items.length > 0) return items;
  return parseBracket(rawText);
}

function parseSrt(text: string): SubtitleItem[] {
  const items: SubtitleItem[] = [];
  const re = new RegExp(SRT_BLOCK.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const text = m[4].trim();
    if (text) items.push({ index: parseInt(m[1], 10), start: norm(m[2]), end: norm(m[3]), text });
  }
  return items;
}

function parseBracket(text: string): SubtitleItem[] {
  const items: SubtitleItem[] = [];
  const re = new RegExp(BRACKET_LINE.source, "g");
  let m: RegExpExecArray | null;
  let i = 1;
  while ((m = re.exec(text)) !== null) {
    items.push({ index: i++, start: norm(m[1]), end: norm(m[2]), text: m[3].trim() });
  }
  return items;
}

export function itemsToSrt(items: SubtitleItem[]): string {
  return items.map((item, i) => `${i + 1}\n${item.start} --> ${item.end}\n${item.text}\n`).join("\n");
}

export function parseToSrt(rawText: string): string {
  return itemsToSrt(parseModelOutput(rawText));
}
