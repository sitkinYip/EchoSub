# EchoSub

> 拖进视频，生成可编辑字幕。

EchoSub 是一个基于 Tauri v2 的桌面端 AI 字幕工具。它在本地用 FFmpeg 处理音视频，通过 Rust 后端流式上传到 DashScope OSS，再调用 Qwen Omni API 识别和翻译，最后在 React 前端实时预览、编辑并导出 SRT 字幕。

## 功能

- 拖拽或点击导入视频/音频文件。
- 音频模式：从视频提取音频，或直接上传音频文件。
- 视频模式：直接上传视频，必要时压缩或切换为音频模式。
- DashScope SSE 流式返回，前端实时预览。
- SRT 解析、编辑、缓存和导出。
- 历史记录、重新生成、内置播放器字幕回看。
- 本地保存 API Key、主题、语言、上传模式等设置。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 桌面框架 | Tauri v2 |
| 后端 | Rust, tokio, reqwest |
| 前端 | React 18, TypeScript, Vite |
| 路由 | react-router-dom HashRouter |
| 状态 | Zustand |
| 样式 | Tailwind CSS + CSS variables |
| 媒体处理 | FFmpeg sidecar |
| 本地存储 | tauri-plugin-store + Rust app data files |
| 测试/质量 | Vitest, ESLint, Prettier, cargo test, cargo clippy |

## 快速开始

### 环境要求

- Node.js 18+
- Rust stable
- DashScope API Key
- FFmpeg sidecar binary

### 安装依赖

```bash
npm install
```

### 安装 FFmpeg sidecar

macOS Apple Silicon 示例：

```bash
brew install ffmpeg
cp $(which ffmpeg) src-tauri/binaries/ffmpeg-aarch64-apple-darwin
chmod +x src-tauri/binaries/ffmpeg-aarch64-apple-darwin
```

不同平台需要放置对应命名的 sidecar。Tauri 配置中使用的是：

```json
"externalBin": ["binaries/ffmpeg"]
```

### 开发启动

```bash
npm run tauri dev
```

### 常用命令

```bash
npm run build
npm run test
npm run lint
npm run format:check
cd src-tauri && cargo test
cd src-tauri && cargo clippy -- -D warnings
```

## 工作流

```text
用户导入媒体
  -> TranslatePage 校验格式/API Key
  -> translationStore.startPipeline
  -> translateService 编排任务
  -> pipelineSession 创建 taskId、管理取消和临时文件
  -> FFmpeg sidecar 提取/压缩媒体
  -> Rust upload_to_dashscope_oss 流式上传到 DashScope OSS
  -> Rust stream_translate 请求 Qwen Omni SSE
  -> Tauri event: translate-progress / translate-chunk / translate-done / translate-error
  -> 前端按 taskId 过滤事件，累积 raw text
  -> srtParser 解析模型输出
  -> write_subtitle_file 写入本地字幕缓存
  -> historyStore 持久化历史记录
  -> SubtitlePreview 编辑，ExportButton 导出 SRT
```

更多架构细节见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 项目结构

```text
src/
├── App.tsx                         # Router + 全局 renderer
├── main.tsx                        # React 入口
├── components/                     # 全局组件
├── config/                         # 常量、modal/message/theme 配置
├── layouts/RootLayout.tsx          # 侧边栏布局
├── pages/
│   ├── TranslatePage/              # 主翻译链路
│   ├── HistoryPage/                # 历史、编辑、重新生成
│   └── PlayerPage/                 # 视频播放器和字幕回看
├── services/
│   ├── translateService.ts         # 翻译管线编排
│   ├── pipelineSession.ts          # taskId、取消、临时文件、safe state update
│   ├── ffmpegService.ts            # FFmpeg sidecar 调用
│   ├── mediaService.ts             # 媒体探测
│   └── historyService.ts           # history.json 读写
├── stores/                         # Zustand stores
├── types/                          # 共享类型
└── utils/srtParser.ts              # SRT/VTT 解析和序列化

src-tauri/
├── Cargo.toml
├── tauri.conf.json
├── capabilities/default.json
├── binaries/                       # FFmpeg sidecar
└── src/
    ├── lib.rs                      # Tauri app + command 注册
    ├── file_ops.rs                 # 文件、API Key、临时文件、字幕缓存
    ├── oss.rs                      # DashScope OSS 流式上传
    ├── translate.rs                # DashScope SSE 翻译
    ├── prompt.rs                   # Prompt 构造
    ├── state.rs                    # 任务取消和临时文件登记
    └── types.rs                    # Rust DTO
```

## 本地文件和隐私

- API Key 写入 Tauri app data 下的 `conf/api_key` 文件，Unix 下设置为 `0600`。
- 非敏感配置写入 `config.json`，由 `tauri-plugin-store` 管理。
- 历史记录写入 `history.json`，由 `tauri-plugin-store` 管理。
- 字幕缓存写入 app data 下的 `subtitles/{historyId}.srt`。
- 临时音频/压缩视频写入 app cache 下的 `media-temp/`，任务完成或取消后清理。
- 上传到 DashScope OSS 的媒体文件按 DashScope 上传策略作为临时资源使用。

## 注意事项

- 视频模式对网络和模型等待时间要求更高；纯语音内容优先用音频模式。
- 大文件会先检查大小，超过直接上传限制时提示压缩或切换音频。
- 取消任务会停止 FFmpeg，并通知 Rust 上传/翻译任务取消。
- 如果模型输出无法解析为 SRT，应用会保留 raw text 并显示解析失败，不会生成假字幕。

## License

MIT
