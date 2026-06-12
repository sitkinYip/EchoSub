import { useState, useCallback } from "react";
import { Command } from "@tauri-apps/plugin-shell";
import { invoke } from "@tauri-apps/api/core";

const MAX_DIRECT_UPLOAD_BYTES = 500 * 1024 * 1024; // 500MB，超过则回退音频模式

/**
 * Hook: 准备媒体文件。
 *
 * audio 模式：FFmpeg 提取音频 → 返回临时 mp3 路径
 * video 模式：检查文件大小 → 返回原视频路径（或过大时回退 audio）
 *
 * 不再返回 base64——由 Rust 后端 stream_translate_file 负责读取和编码。
 */
export function useAudioExtraction() {
  const [progress, setProgress] = useState<string>("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const extractAudio = useCallback(
    async (
      videoPath: string,
      mode: "audio" | "video"
    ): Promise<{
      filePath: string;
      mediaType: "audio" | "video";
    } | null> => {
      setIsExtracting(true);
      setLastError(null);

      try {
        if (mode === "video") {
          const info = await invoke<{ size: number }>("get_file_info", {
            path: videoPath,
          }).catch(() => ({ size: 0 }));

          if (info.size > MAX_DIRECT_UPLOAD_BYTES) {
            const sizeMB = (info.size / 1024 / 1024).toFixed(1);
            console.log(`[提取] 视频 ${sizeMB} MB 超限，回退音频模式`);
            setProgress(
              `文件过大 (${sizeMB} MB)，自动切换为音频提取...`
            );
            mode = "audio";
          } else {
            setProgress("视频文件已就绪（画面+语音混合识别）");
            return { filePath: videoPath, mediaType: "video" };
          }
        }

        // ── audio 模式 ──
        setProgress("正在提取音频...");
        const timestamp = Date.now();
        const audioPath =
          videoPath.replace(/\.[^.]+$/, "") + `_audio_${timestamp}.mp3`;

        let command;
        try {
          command = Command.sidecar("binaries/ffmpeg", [
            "-i",
            videoPath,
            "-b:a",
            "64k",
            "-ac",
            "1",
            "-y",
            audioPath,
          ]);
        } catch (sidecarErr) {
          const msg =
            sidecarErr instanceof Error
              ? sidecarErr.message
              : String(sidecarErr);
          setLastError(`无法启动 FFmpeg: ${msg}`);
          setProgress("无法启动 FFmpeg");
          return null;
        }

        let stderrBuf = "";
        command.stderr.on("data", (data: string) => {
          stderrBuf += data;
          const timeMatch = data.match(/time=(\d+:\d+:\d+\.\d+)/);
          if (timeMatch) {
            setProgress(`提取音频中... (${timeMatch[1]})`);
          }
        });

        const result = await command.execute();

        if (result.code !== 0) {
          const errMsg = stderrBuf.slice(-500) || "未知错误";
          setLastError(`FFmpeg 退出码 ${result.code}: ${errMsg}`);
          setProgress(`FFmpeg 执行失败 (退出码 ${result.code})`);
          return null;
        }

        setProgress("音频已就绪");
        return { filePath: audioPath, mediaType: "audio" };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[提取] 错误:", msg);
        setLastError(msg);
        setProgress(`错误: ${msg}`);
        return null;
      } finally {
        setIsExtracting(false);
      }
    },
    []
  );

  return { extractAudio, progress, isExtracting, lastError };
}
