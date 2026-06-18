/**
 * HLS seek 判定的纯函数。
 *
 * 实时转码场景下，已生成的分片覆盖 [seekableStart, seekableEnd] 区间。
 * 用户拖动进度条到 seekableEnd 之后（尚未转码的区域）时，需要判定是否
 * 触发 session 重启（stop → 用 -ss 重启 → hls.js timelineOffset）。
 *
 * 这些函数不依赖 DOM/React，便于单测。
 */

/** 容差（秒）：允许略微越过 seekable 边界，避免分片边界抖动导致误判。 */
export const SEEK_TOLERANCE = 0.5;

/**
 * 判定一个 seek 目标是否落在已转码区间之外（需要 session 重启）。
 *
 * @param target        用户拖动到的目标时间（源视频绝对时间）
 * @param seekableEnd   已转码区间末尾（video.seekable.end(0)）
 * @param tolerance     容差，默认 SEEK_TOLERANCE
 * @returns true 表示越过边界，需重启；false 表示在已转码区内，放行原生 seek
 */
export function shouldSeekBeyondBuffer(
  target: number,
  seekableEnd: number,
  tolerance: number = SEEK_TOLERANCE,
): boolean {
  if (!Number.isFinite(target) || !Number.isFinite(seekableEnd)) {
    return false;
  }
  return target > seekableEnd + tolerance;
}

/**
 * 获取当前 seekable 区间的末尾，无 seekable 信息时回退到 duration。
 * 用于键盘 seek 的 clamp 上界——避免键盘小步 seek 越过已转码区。
 */
export function getSeekClampEnd(
  seekable: TimeRanges | null | undefined,
  duration: number,
): number {
  if (seekable && seekable.length > 0) {
    const end = seekable.end(seekable.length - 1);
    if (Number.isFinite(end) && end > 0) {
      // 若 seekable 末尾明显小于 duration，说明是受限窗口（实时转码）
      // 取 seekableEnd 作为 clamp 上界
      if (Number.isFinite(duration) && duration > 0 && end < duration - SEEK_TOLERANCE) {
        return end;
      }
    }
  }
  return Number.isFinite(duration) && duration > 0 ? duration : Number.POSITIVE_INFINITY;
}
