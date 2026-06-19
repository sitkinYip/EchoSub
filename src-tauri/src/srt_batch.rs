use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SrtBlock {
    pub index: usize,
    pub start: String,
    pub end: String,
    pub text: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationUnit {
    pub id: usize,
    pub text: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TranslationBatch {
    pub batch_index: usize,
    pub units: Vec<TranslationUnit>,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct TranslationItem {
    pub id: usize,
    pub translation: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TranslationMerge {
    pub srt: String,
    pub warnings: Vec<String>,
}

fn normalize_newlines(input: &str) -> String {
    input
        .trim_start_matches('\u{feff}')
        .replace("\r\n", "\n")
        .replace('\r', "\n")
}

fn normalize_time(input: &str) -> String {
    let trimmed = input.trim().replace('.', ",");
    let Some((head, frac)) = trimmed.split_once(',') else {
        return trimmed;
    };
    let mut millis = frac.chars().take(3).collect::<String>();
    while millis.len() < 3 {
        millis.push('0');
    }
    format!("{head},{millis}")
}

fn parse_timing_line(line: &str) -> Option<(String, String)> {
    let (start, end_with_settings) = line.split_once("-->")?;
    let end = end_with_settings.split_whitespace().next()?;
    Some((normalize_time(start), normalize_time(end)))
}

pub fn parse_srt_blocks(srt: &str) -> Result<Vec<SrtBlock>, String> {
    let normalized = normalize_newlines(srt);
    let mut blocks = Vec::new();

    for raw_block in normalized.split("\n\n") {
        let lines = raw_block
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .collect::<Vec<_>>();
        if lines.is_empty() {
            continue;
        }

        let timing_pos = lines
            .iter()
            .position(|line| line.contains("-->"))
            .ok_or_else(|| format!("SRT 字幕块缺少时间轴: {raw_block}"))?;
        let (start, end) = parse_timing_line(lines[timing_pos])
            .ok_or_else(|| format!("SRT 时间轴格式无效: {}", lines[timing_pos]))?;
        let text = lines[timing_pos + 1..].join("\n").trim().to_string();
        if text.is_empty() {
            continue;
        }

        let index = if timing_pos > 0 {
            lines[timing_pos - 1]
                .parse::<usize>()
                .unwrap_or(blocks.len() + 1)
        } else {
            blocks.len() + 1
        };

        blocks.push(SrtBlock {
            index,
            start,
            end,
            text,
        });
    }

    if blocks.is_empty() {
        return Err("未解析到任何 SRT 字幕块".to_string());
    }
    Ok(blocks)
}

pub fn build_translation_batches(
    blocks: &[SrtBlock],
    max_items_per_batch: usize,
    max_chars_per_batch: usize,
) -> Vec<TranslationBatch> {
    let max_items = max_items_per_batch.max(1);
    let max_chars = max_chars_per_batch.max(1);
    let mut batches = Vec::new();
    let mut current = Vec::new();
    let mut current_chars = 0_usize;

    for block in blocks {
        let text_chars = block.text.chars().count();
        let would_exceed_items = current.len() >= max_items;
        let would_exceed_chars = !current.is_empty() && current_chars + text_chars > max_chars;
        if would_exceed_items || would_exceed_chars {
            batches.push(TranslationBatch {
                batch_index: batches.len(),
                units: current,
            });
            current = Vec::new();
            current_chars = 0;
        }

        current.push(TranslationUnit {
            id: block.index,
            text: block.text.clone(),
        });
        current_chars += text_chars;
    }

    if !current.is_empty() {
        batches.push(TranslationBatch {
            batch_index: batches.len(),
            units: current,
        });
    }
    batches
}

pub fn parse_translation_items(raw_json: &str) -> Result<Vec<TranslationItem>, String> {
    let mut trimmed = raw_json.trim();
    if trimmed.is_empty() {
        return Err("翻译模型返回为空".to_string());
    }

    if let Some(stripped) = trimmed.strip_prefix("```json") {
        trimmed = stripped.trim();
    } else if let Some(stripped) = trimmed.strip_prefix("```") {
        trimmed = stripped.trim();
    }
    if let Some(stripped) = trimmed.strip_suffix("```") {
        trimmed = stripped.trim();
    }

    if !trimmed.starts_with('[') && !trimmed.starts_with('{') {
        let first_array = trimmed.find('[');
        let first_object = trimmed.find('{');
        let start = match (first_array, first_object) {
            (Some(a), Some(o)) => Some(a.min(o)),
            (Some(a), None) => Some(a),
            (None, Some(o)) => Some(o),
            (None, None) => None,
        };
        if let Some(start) = start {
            trimmed = &trimmed[start..];
        }
    }
    if trimmed.starts_with('[') {
        if let Some(end) = trimmed.rfind(']') {
            trimmed = &trimmed[..=end];
        }
    } else if trimmed.starts_with('{') {
        if let Some(end) = trimmed.rfind('}') {
            trimmed = &trimmed[..=end];
        }
    }

    if let Ok(items) = serde_json::from_str::<Vec<TranslationItem>>(trimmed) {
        return Ok(items);
    }

    if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
        if let Some(items) = value.get("items").or_else(|| value.get("translations")) {
            return serde_json::from_value::<Vec<TranslationItem>>(items.clone())
                .map_err(|e| format!("翻译模型 JSON 字段格式无效: {e}"));
        }
    }

    // 兜底：尝试修复模型常见的输出错误（如漏掉字符串闭合引号）后再解析。
    let repaired = repair_model_json(trimmed);
    if repaired != trimmed {
        if let Ok(items) = serde_json::from_str::<Vec<TranslationItem>>(&repaired) {
            return Ok(items);
        }
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&repaired) {
            if let Some(items) = value.get("items").or_else(|| value.get("translations")) {
                if let Ok(items) = serde_json::from_value::<Vec<TranslationItem>>(items.clone()) {
                    return Ok(items);
                }
            }
        }
    }

    // 修复后仍失败，给出最终报错（带原始错误，便于上层重试或诊断）
    let err = serde_json::from_str::<serde_json::Value>(trimmed)
        .err()
        .map(|e| e.to_string())
        .unwrap_or_else(|| "结构无法识别".to_string());
    Err(format!("翻译模型返回不是合法 JSON: {err}"))
}

/// 启发式修复模型输出的 JSON。专治常见坏 case：
/// - 字符串值漏掉闭合引号（本次现场：`{"translation":"(伦：嗯……)}` 缺末尾 `"`）。
///
/// 难点：漏闭合引号后，后续字符（含 `}` `,`）会被当成字符串内容，因此不能用
/// 「跟踪 in_string」的状态机直接定位。这里用定向模式扫描：检测 `":"`（键值分隔
/// 后的字符串值起始），从值起始引号向后扫描，若在遇到结构边界（`}` / `,` / `]`）
/// 之前没有闭合 `"`，则判定漏引号，在边界前补一个 `"`。
///
/// 仅在 serde 解析失败时作为兜底调用，不影响正常路径。不依赖 regex。
fn repair_model_json(input: &str) -> String {
    let chars: Vec<char> = input.chars().collect();
    let n = chars.len();
    let mut out = String::with_capacity(n + 16);
    let mut i = 0;

    while i < n {
        // 检测 `":"` 模式：键名闭合引号 + 冒号 + 值起始引号。
        // 注意要确保这是一个值字符串而非键名内部——`":"` 三连出现即可判定
        // （键名总是以 `"` 结尾紧跟 `:`，值再以 `"` 开头）。
        if i + 2 < n && chars[i] == '"' && chars[i + 1] == ':' && chars[i + 2] == '"' {
            out.push('"');
            out.push(':');
            out.push('"');
            let value_start = i + 3;
            let mut k = value_start;
            let mut found_closing = false;
            let mut esc = false;
            while k < n {
                let c = chars[k];
                if esc {
                    esc = false;
                    k += 1;
                    continue;
                }
                if c == '\\' {
                    esc = true;
                    k += 1;
                    continue;
                }
                if c == '"' {
                    found_closing = true;
                    break;
                }
                if c == '}' || c == ',' || c == ']' {
                    // 到达结构边界仍未见闭合引号 → 漏引号
                    break;
                }
                k += 1;
            }
            // 值内容 [value_start..k) 原样输出
            out.extend(&chars[value_start..k]);
            out.push('"'); // 正常情况输出闭合引号；漏引号情况补一个
            i = if found_closing { k + 1 } else { k };
            continue;
        }
        out.push(chars[i]);
        i += 1;
    }

    out
}

pub fn rebuild_srt_with_translations(
    blocks: &[SrtBlock],
    translated_items: &[TranslationItem],
) -> TranslationMerge {
    let translations = translated_items
        .iter()
        .map(|item| (item.id, item.translation.trim().to_string()))
        .collect::<HashMap<_, _>>();
    let mut warnings = Vec::new();
    let mut srt = String::new();

    for (position, block) in blocks.iter().enumerate() {
        let text = match translations.get(&block.index) {
            Some(translation) if !translation.is_empty() => translation.as_str(),
            Some(_) => {
                warnings.push(format!("字幕 {} 的翻译为空，已保留原文", block.index));
                block.text.as_str()
            }
            None => {
                warnings.push(format!("字幕 {} 缺少翻译，已保留原文", block.index));
                block.text.as_str()
            }
        };

        srt.push_str(&format!(
            "{}\n{} --> {}\n{}\n",
            position + 1,
            block.start,
            block.end,
            text
        ));
        if position + 1 < blocks.len() {
            srt.push('\n');
        }
    }

    for item in translated_items {
        if !blocks.iter().any(|block| block.index == item.id) {
            warnings.push(format!("翻译结果包含未知字幕 id {}", item.id));
        }
    }

    TranslationMerge { srt, warnings }
}

#[cfg(test)]
mod tests {
    use super::{
        build_translation_batches, parse_srt_blocks, parse_translation_items,
        rebuild_srt_with_translations, TranslationItem,
    };

    const SAMPLE_SRT: &str = "1\n00:00:01.0 --> 00:00:02.50\nこんにちは\n\n2\n00:00:03,000 --> 00:00:04,000\n世界\n\n3\n00:00:05,000 --> 00:00:06,000\nありがとう\n";

    #[test]
    fn parses_srt_blocks_and_normalizes_time() {
        let blocks = parse_srt_blocks(SAMPLE_SRT).unwrap();

        assert_eq!(blocks.len(), 3);
        assert_eq!(blocks[0].index, 1);
        assert_eq!(blocks[0].start, "00:00:01,000");
        assert_eq!(blocks[0].end, "00:00:02,500");
        assert_eq!(blocks[0].text, "こんにちは");
    }

    #[test]
    fn builds_batches_by_item_count() {
        let blocks = parse_srt_blocks(SAMPLE_SRT).unwrap();
        let batches = build_translation_batches(&blocks, 2, 10_000);

        assert_eq!(batches.len(), 2);
        assert_eq!(batches[0].batch_index, 0);
        assert_eq!(
            batches[0].units.iter().map(|u| u.id).collect::<Vec<_>>(),
            vec![1, 2]
        );
        assert_eq!(
            batches[1].units.iter().map(|u| u.id).collect::<Vec<_>>(),
            vec![3]
        );
    }

    #[test]
    fn builds_batches_by_character_budget() {
        let blocks = parse_srt_blocks(SAMPLE_SRT).unwrap();
        let batches = build_translation_batches(&blocks, 10, 6);

        assert_eq!(batches.len(), 3);
    }

    #[test]
    fn parses_translation_json_array_or_wrapped_items() {
        let array = parse_translation_items(r#"[{"id":1,"translation":"你好"}]"#).unwrap();
        let wrapped =
            parse_translation_items(r#"{"translations":[{"id":2,"translation":"世界"}]}"#).unwrap();
        let fenced =
            parse_translation_items("```json\n[{\"id\":3,\"translation\":\"谢谢\"}]\n```").unwrap();
        let noisy =
            parse_translation_items("结果如下：\n[{\"id\":4,\"translation\":\"好的\"}]\n完成。")
                .unwrap();

        assert_eq!(array[0].id, 1);
        assert_eq!(wrapped[0].translation, "世界");
        assert_eq!(fenced[0].id, 3);
        assert_eq!(noisy[0].translation, "好的");
    }

    #[test]
    fn repairs_missing_closing_quote_in_translation_values() {
        // 现场模式：模型系统性漏掉字符串值的闭合引号
        // （每个对象的 translation 值都以 `"` 开头但缺末尾 `"`，直接跟 `}`）
        let broken = r#"[{"id":181,"translation":"(伦：嗯……)},{"id":182,"translation":"(伦：嗯……)}]"#;
        let items = parse_translation_items(broken).unwrap();

        assert_eq!(items.len(), 2);
        assert_eq!(items[0].id, 181);
        assert_eq!(items[0].translation, "(伦：嗯……)");
        assert_eq!(items[1].id, 182);
    }

    #[test]
    fn repair_does_not_corrupt_well_formed_json() {
        // 合法 JSON（含转义双引号）经修复后仍应正确解析，不被误改
        let well_formed = r#"[{"id":1,"translation":"他说\"你好\""}]"#;
        let items = parse_translation_items(well_formed).unwrap();
        assert_eq!(items[0].translation, "他说\"你好\"");
    }

    #[test]
    fn rebuilds_srt_and_preserves_original_when_missing() {
        let blocks = parse_srt_blocks(SAMPLE_SRT).unwrap();
        let merge = rebuild_srt_with_translations(
            &blocks,
            &[
                TranslationItem {
                    id: 1,
                    translation: "你好".to_string(),
                },
                TranslationItem {
                    id: 3,
                    translation: "谢谢".to_string(),
                },
                TranslationItem {
                    id: 99,
                    translation: "多余".to_string(),
                },
            ],
        );

        assert!(merge.srt.contains("你好"));
        assert!(merge.srt.contains("世界"));
        assert!(merge.srt.contains("谢谢"));
        assert!(merge.warnings.iter().any(|w| w.contains("字幕 2 缺少翻译")));
        assert!(merge.warnings.iter().any(|w| w.contains("未知字幕 id 99")));
    }
}
