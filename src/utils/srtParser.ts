import type { SubtitleItem } from "@/types";

export interface ParseResult {
  items: SubtitleItem[];
  warnings: string[];
}

/** Normalize time to SRT format: HH:MM:SS,mmm */
function normTime(ts: string): string {
  // Replace period with comma
  let t = ts.replace(".", ",");
  // Ensure exactly 3 decimal digits
  const parts = t.split(",");
  if (parts.length === 2 && parts[1].length < 3) {
    t = parts[0] + "," + parts[1].padEnd(3, "0");
  }
  return t;
}

/** Parse model output with maximum tolerance for format variation */
export function parseModelOutput(rawText: string, _collectWarnings?: boolean): SubtitleItem[] {
  const result = tryParse(rawText);
  return result.items;
}

export function parseModelOutputWithWarnings(rawText: string): ParseResult {
  return tryParse(rawText);
}

/** Internal: try multiple parsing strategies and collect warnings */
function tryParse(rawText: string): ParseResult {
  const warnings: string[] = [];

  // Step 0: aggressive normalization
  let text = rawText
    .replace(/^\uFEFF/, "") // BOM
    .replace(/\r\n/g, "\n") // CRLF → LF
    .replace(/\r/g, "\n") // CR → LF
    .replace(/\n{3,}/g, "\n\n") // Collapse 3+ blank lines → 2
    .trim();

  // Strip markdown code fences that AI sometimes wraps output in
  text = text.replace(/^```(?:srt|SRT)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");

  // Step 1: standard SRT block parser (most reliable)
  const srtItems = trySrtBlocks(text);
  if (srtItems.length > 0) {
    return { items: srtItems, warnings };
  }

  // Step 2: bracket line format
  const bracketItems = tryBracketLines(text);
  if (bracketItems.length > 0) {
    return { items: bracketItems, warnings };
  }

  // Step 3: loose line-by-line fallback — find timestamps anywhere
  const looseItems = tryLooseTimestamps(text);
  if (looseItems.length > 0) {
    warnings.push("使用宽松格式解析，部分时间戳可能不精确");
    return { items: looseItems, warnings };
  }

  return { items: [], warnings: [...warnings, "无法识别任何字幕格式"] };
}

// ── Strategy 1: Standard SRT blocks ──

function trySrtBlocks(text: string): SubtitleItem[] {
  const items: SubtitleItem[] = [];
  // More lenient: allow optional index, flexible spacing
  const re =
    /(?:^\d+\s*\n)?(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})\s*\n([\s\S]*?)(?=\n\s*(?:\d+\s*\n)?\d{1,2}:\d{2}:\d{2}|\n*$)/gm;
  let m: RegExpExecArray | null;
  let index = 1;

  while ((m = re.exec(text)) !== null) {
    const body = m[3]
      .split("\n")
      .filter((line) => line.trim())
      .join("\n")
      .trim();
    if (body) {
      items.push({ index: index++, start: normTime(m[1]), end: normTime(m[2]), text: body });
    }
  }

  return items;
}

// ── Strategy 2: Bracket lines ──

function tryBracketLines(text: string): SubtitleItem[] {
  const items: SubtitleItem[] = [];
  const re =
    /\[(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})\]\s*(.+)/g;
  let m: RegExpExecArray | null;
  let index = 1;

  while ((m = re.exec(text)) !== null) {
    const body = m[3].trim();
    if (body) {
      items.push({ index: index++, start: normTime(m[1]), end: normTime(m[2]), text: body });
    }
  }

  return items;
}

// ── Strategy 3: Loose timestamp detection ──

function tryLooseTimestamps(text: string): SubtitleItem[] {
  const items: SubtitleItem[] = [];
  const lines = text.split("\n");

  // Find lines containing "-->"
  let index = 1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const tsMatch = line.match(
      /(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})/,
    );
    if (!tsMatch) continue;

    // The text is either the next non-empty line, or the rest of this line after the timestamp
    let body = line.replace(tsMatch[0], "").trim();
    if (!body && i + 1 < lines.length) {
      // Collect subsequent non-timestamp lines
      const textLines: string[] = [];
      let j = i + 1;
      while (j < lines.length && !lines[j].includes("-->")) {
        const l = lines[j].trim();
        if (l) textLines.push(l);
        j++;
      }
      body = textLines.join("\n");
    }

    if (body) {
      items.push({
        index: index++,
        start: normTime(tsMatch[1]),
        end: normTime(tsMatch[2]),
        text: body,
      });
    }
  }

  return items;
}

// ── Export utilities ──

export function itemsToSrt(items: SubtitleItem[]): string {
  return items
    .map((item, i) => `${i + 1}\n${item.start} --> ${item.end}\n${item.text}\n`)
    .join("\n");
}

export function parseToSrt(rawText: string): string {
  return itemsToSrt(parseModelOutput(rawText));
}

export function itemsToVtt(items: SubtitleItem[]): string {
  const lines = ["WEBVTT", ""];
  for (const item of items) {
    lines.push(`${srtToVttTime(item.start)} --> ${srtToVttTime(item.end)}`);
    lines.push(item.text);
    lines.push("");
  }
  return lines.join("\n");
}

function srtToVttTime(srtTime: string): string {
  return srtTime.replace(",", ".");
}
