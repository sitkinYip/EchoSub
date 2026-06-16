# EchoSub Architecture

本文描述 EchoSub 当前架构：前端 store/service、Rust command、事件流、文件存储位置和任务生命周期。

## 1. 总览

EchoSub 是一个 Tauri v2 桌面应用：

- 前端负责交互、状态展示、字幕编辑、历史和播放器。
- Rust 负责本地文件操作、API Key 文件、DashScope OSS 上传、DashScope SSE 翻译。
- FFmpeg 作为 Tauri sidecar 由前端通过 `@tauri-apps/plugin-shell` 调用。
- 长任务使用 `taskId` 贯穿前端、Rust 上传、Rust 翻译和 Tauri event。

```text
React UI
  -> Zustand stores
  -> services/translateService
  -> services/pipelineSession
  -> FFmpeg sidecar
  -> Tauri invoke commands
  -> Rust file_ops / oss / translate
  -> DashScope OSS + Qwen Omni API
  -> Tauri events with taskId
  -> React preview/history/player
```

## 2. 前端路由

路由入口：`src/App.tsx`

使用 `HashRouter`，根布局是 `RootLayout`。

| Route      | Page            | 用途                                 |
| ---------- | --------------- | ------------------------------------ |
| `/`        | `TranslatePage` | 导入媒体、启动翻译、实时预览、导出。 |
| `/history` | `HistoryPage`   | 查看历史、编辑字幕、导出、重新生成。 |
| `/player`  | `PlayerPage`    | 播放历史视频并加载字幕。             |

全局 renderer：

- `ModalRenderer`
- `ToastRenderer`
- `ErrorBoundary`

## 3. 前端 Stores

### `settingsStore`

文件：`src/stores/settingsStore.ts`

职责：

- `apiKey`
- `hasApiKey`
- `sourceLang`
- `targetLang`
- `uploadVideo`
- `theme`
- `loaded`

存储：

- API Key 通过 Rust command `save_api_key` / `load_api_key` 存在 app data 文件。
- 语言、模式、主题通过 `tauri-plugin-store` 写入 `config.json`。

### `translationStore`

文件：`src/stores/translationStore.ts`

职责：

- 当前翻译 UI 状态。
- 当前文件信息。
- pipeline phase。
- 实时 raw text。
- 解析后的字幕。
- 历史重新生成入口。

关键 action：

- `startPipeline(...)`
- `cancel()`
- `reset()`
- `updateSubtitleText(...)`
- `setRegenerate(...)`

`translationStore` 本身不实现管线细节，实际编排委托给 `translateService`。

### `historyStore`

文件：`src/stores/historyStore.ts`

职责：

- 加载历史。
- 新增历史。
- 删除历史。
- 清空历史。
- 更新历史字幕。

数据闭环：

- 历史主体写入 `history.json`。
- 完成翻译时先写字幕缓存，再把 `subtitleFilePath` 回填到 `HistoryEntry`。
- 编辑历史字幕时同步重写缓存 `.srt`。
- 删除或清空历史时同步删除缓存 `.srt`。

### `modalStore`

文件：`src/stores/modalStore.ts`

职责：

- 命令式弹窗栈。
- 弹窗异步加载。
- leaving 动画状态。

弹窗注册表：`src/config/modals.ts`

### `messageStore`

文件：`src/stores/messageStore.ts`

职责：

- Toast 队列。
- 自动 dismiss。
- 手动 dismiss。

## 4. 前端 Services

### `translateService`

文件：`src/services/translateService.ts`

主翻译管线编排：

1. 创建 `PipelineSession`。
2. 设置 UI 为 processing。
3. `probe(filePath)` 探测媒体大小、时长、分辨率。
4. 根据模式选择：
   - 音频文件：直接上传。
   - 视频 + 音频模式：提取 mp3。
   - 视频 + 视频模式：直接上传或弹窗选择压缩/切音频。
5. `upload_to_dashscope_oss` 上传。
6. 删除已上传的临时文件。
7. 注册 Tauri event listener。
8. `stream_translate` 开始 SSE 翻译。
9. 累积 `translate-chunk` raw text。
10. `translate-done` 后解析 SRT。
11. `write_subtitle_file` 写字幕缓存。
12. `historyStore.prepend` 保存历史。
13. UI 进入 preview。

解析失败策略：

- 不生成 `00:00:00,000` 假字幕。
- 保留 raw text。
- 设置明确错误：模型返回内容无法解析为 SRT。

### `pipelineSession`

文件：`src/services/pipelineSession.ts`

职责：

- 当前 session。
- `taskId` 生成。
- `unlisten` 清理。
- `tempFiles` 追踪。
- `killSession()` 取消 Rust task、停止 FFmpeg、删除登记过的临时文件。
- `safeSet()` 防止旧任务更新新 UI。
- `createTempPath(ext)` 调 Rust `create_temp_media_path`。

核心原则：

- 只有当前 session 能写 UI。
- 新 session 会自动 kill 旧 session。
- 所有 Tauri event 必须通过 `taskId` 过滤。

### `ffmpegService`

文件：`src/services/ffmpegService.ts`

职责：

- `Command.sidecar("binaries/ffmpeg", args)`。
- 追踪 active child process。
- `killFfmpeg()` 停止当前 FFmpeg。
- 从 stderr 解析 frame/time/speed，更新进度文本。

### `mediaService`

文件：`src/services/mediaService.ts`

职责：

- 调 `get_file_info` 获取文件大小。
- 用 `ffmpeg -i` stderr 粗略探测时长、分辨率。
- `picks(height)` 选择压缩策略。

### `historyService`

文件：`src/services/historyService.ts`

职责：

- `Store.load("history.json")`
- `_version`
- `entries`
- 保存队列，避免并发保存互相覆盖。

## 5. Rust 模块

### `lib.rs`

职责：

- 注册 Tauri plugins。
- 管理 `AppState`。
- 注册所有 command。

### `state.rs`

`AppState` 保存：

- `cancelled_tasks: HashSet<String>`
- `temp_files: HashSet<PathBuf>`

用途：

- Rust 上传/翻译检查任务是否取消。
- `delete_file` 只允许删除登记过的临时文件。

### `file_ops.rs`

职责：

- API Key 文件读写。
- 文件 metadata。
- Finder/Explorer reveal。
- 临时媒体路径生成。
- 字幕缓存写入/删除。
- 临时文件受限删除。
- 任务取消。

安全边界：

- `write_subtitle_file` 校验 id，只允许 ASCII 字母、数字、`-`、`_`。
- `delete_file` 只删除 `AppState` 登记过的临时文件。
- `delete_subtitle_file` 只删除 app subtitles 目录内 `.srt`。

### `oss.rs`

职责：

- 获取 DashScope upload policy。
- 用 `tokio::fs::File` + `ReaderStream` + `reqwest::Body::wrap_stream` 流式上传。
- 上传过程中检查 `taskId` 是否取消。
- 发送 `translate-progress`。

### `translate.rs`

职责：

- 构造 DashScope chat completions 请求。
- 请求 Qwen Omni SSE。
- 读取 bytes stream。
- 解析 `data:` 行。
- 转发 `translate-progress` / `translate-chunk` / `translate-error` / `translate-done`。
- 读取过程中检查 `taskId` 是否取消。

### `prompt.rs`

职责：

- 根据源语言、目标语言、媒体类型构造 prompt。
- 同语言时走转录 prompt。
- 不同语言时走直接翻译 prompt。

### `types.rs`

职责：

- `FileInfo`
- `TaskEvent<T>`
- `TranslateRequest`
- `UploadPolicyData`
- `UploadPolicyResponse`

## 6. Rust Commands

| Command                   | 参数                           | 返回        | 用途                                  |
| ------------------------- | ------------------------------ | ----------- | ------------------------------------- |
| `get_file_info`           | `{ path }`                     | `{ size }`  | 获取文件大小。                        |
| `reveal_in_folder`        | `{ path }`                     | `()`        | 在系统文件管理器中定位原文件。        |
| `write_subtitle_file`     | `{ id, content }`              | `string`    | 写 app data subtitles 缓存。          |
| `delete_subtitle_file`    | `{ path }`                     | `()`        | 删除 app subtitles 下的 `.srt`。      |
| `delete_file`             | `{ path }`                     | `()`        | 删除登记过的临时文件。                |
| `create_temp_media_path`  | `{ ext }`                      | `string`    | 在 app cache 创建临时媒体路径并登记。 |
| `save_api_key`            | `{ key }`                      | `()`        | 保存或清空 API Key。                  |
| `load_api_key`            | `{}`                           | `string`    | 读取 API Key。                        |
| `cancel_task`             | `{ taskId }`                   | `()`        | 标记任务取消。                        |
| `upload_to_dashscope_oss` | `{ taskId, filePath, apiKey }` | `oss://...` | 流式上传媒体。                        |
| `stream_translate`        | `{ req }`                      | `()`        | 调用 DashScope SSE 并发事件。         |

`stream_translate` 的 `req`：

```ts
type TranslateRequest = {
  taskId: string;
  ossUrl: string;
  apiKey: string;
  mediaType: "audio" | "video";
  sourceLang: string;
  targetLang: string;
};
```

## 7. Tauri Events

所有事件 payload 都带 `taskId`。

```ts
type TaskEvent<T> = {
  taskId: string;
  payload: T;
};
```

| Event                | Payload             | 说明                |
| -------------------- | ------------------- | ------------------- |
| `translate-progress` | `TaskEvent<string>` | 上传/翻译进度文字。 |
| `translate-chunk`    | `TaskEvent<string>` | SSE 增量文本。      |
| `translate-error`    | `TaskEvent<string>` | 任务错误或取消。    |
| `translate-done`     | `TaskEvent<null>`   | SSE 完成。          |

前端监听位置：`src/services/translateService.ts`

规则：

```ts
if (event.payload.taskId !== currentSession.taskId) return;
```

## 8. 文件存储位置

### App data

通过 Rust：

```rust
app.path().app_data_dir()
```

用途：

- `conf/api_key`
- `subtitles/{historyId}.srt`

通过 `tauri-plugin-store`：

- `config.json`
- `history.json`

### App cache

通过 Rust：

```rust
app.path().app_cache_dir()
```

用途：

- `media-temp/{pid}_{timestamp}.mp3`
- `media-temp/{pid}_{timestamp}.mp4`

临时文件会被登记到 `AppState.temp_files`，只允许通过 `delete_file` 删除登记过的路径。

### 用户选择的媒体文件

保存于 history：

```ts
HistoryEntry.videoPath;
```

用途：

- 重新生成。
- PlayerPage 播放。
- reveal in folder。

应用不会在原媒体目录旁边创建临时文件。

## 9. 翻译任务生命周期

```text
startPipeline
  -> newSession()
      taskId = random id
      kill old session
  -> probe media
  -> maybe FFmpeg extract/compress
      temp path from create_temp_media_path
      temp path tracked in session
  -> register task event listeners
  -> upload_to_dashscope_oss(taskId)
      Rust checks AppState.is_cancelled(taskId)
      emit translate-progress
  -> cleanup uploaded temp files
  -> stream_translate(taskId)
      Rust checks AppState.is_cancelled(taskId)
      emit translate-chunk
  -> translate-done
  -> parse SRT
  -> write_subtitle_file
  -> historyStore.prepend
  -> preview
```

取消：

```text
cancel/reset/new task
  -> killSession
  -> cancel_task(taskId)
  -> killFfmpeg
  -> delete registered temp files
  -> remove event listeners
  -> stale safeSet ignored
```

## 10. HistoryEntry

文件：`src/types/index.ts`

```ts
interface HistoryEntry {
  id: string;
  createdAt: number;
  videoName: string;
  videoPath: string;
  sourceLang: Language;
  targetLang: Language;
  mode: "audio" | "video";
  subtitles: SubtitleItem[];
  status: "completed" | "error";
  error?: string;
  subtitleFilePath?: string;
}
```

`subtitleFilePath` 指向 app data subtitles 缓存。导出到用户选择路径时不会覆盖这个缓存。

## 11. 权限和安全边界

Tauri 配置：

- CSP 已启用。
- HTTP 仅允许 DashScope 域名。
- FFmpeg 只通过 sidecar allow-list 执行。
- 前端 fs 权限不包含 `$HOME/**` 全局写入。
- asset protocol 允许读取 app 目录和常见用户媒体位置，用于播放器 `convertFileSrc`。

Rust 边界：

- 自定义 command 对删除操作做路径约束。
- API Key 文件不进 store，不进 history。
- 上传使用 streaming，避免大文件读入 JS 或 Rust 内存。

## 12. 测试覆盖

前端：

- `src/utils/srtParser.test.ts`
- `src/services/pipelineSession.test.ts`

Rust：

- `prompt.rs` prompt 分支。
- `file_ops.rs` 字幕 ID 校验。

建议后续补充：

- `historyService` 保存队列和迁移测试。
- `translateService` task event 过滤集成测试。
- Rust SSE parser 纯函数化后测试。
- 媒体探测 fixture 测试。
