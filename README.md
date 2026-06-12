# 🎬 EchoSub

> 拖进视频，吐出字幕。就这么简单。

EchoSub 是一个用 Tauri v2 打造的桌面端 AI 字幕翻译工具。丢一个视频进去——本地提取音频、上传云端识别翻译、实时流式生成字幕——你只需要双击改几个错别字，导出 SRT，齐活。

---

## ✨ 它能做什么

- **拖拽即用** — 把视频拖进窗口，剩下的交给它
- **FFmpeg 本地提取** — 内置 FFmpeg sidecar，64kbps 单声道，速度快体积小
- **云端 OSS 上传** — 用 DashScope 临时存储（48h 自动清理），不限本地网络
- **画面 + 语音混合识别** — 可选视频直传模式，利用画面字幕辅助识别
- **多语言自由选** — 中文 / 日语 / 韩语 / 英语，源语言和目标语言随便组合
- **流式实时预览** — 字幕一个字一个字蹦出来，不用干等
- **双击改错别字** — 翻译不对？双击就能改
- **标准 SRT 导出** — 导出后直接拖进播放器

---

## 🛠 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Tauri v2 (Rust) |
| 前端 | React 18 + TypeScript + Vite |
| 样式 | Tailwind CSS 3 |
| 媒体处理 | FFmpeg (Tauri Sidecar) |
| HTTP / 文件 | Rust 原生 reqwest + tokio，零 JS base64 |
| AI 引擎 | 阿里云 DashScope (qwen3-omni-flash) |
| 本地存储 | tauri-plugin-store |

---

## 🚀 快速开始

### 你需要

- **Rust** (1.70+)
- **Node.js** (18+)
- **FFmpeg** 静态二进制（放到 `src-tauri/binaries/`）
- **DashScope API Key** ([点这里申请](https://dashscope.aliyun.com/))

### 安装 FFmpeg sidecar

```bash
# macOS (推荐)
brew install ffmpeg
cp $(which ffmpeg) src-tauri/binaries/ffmpeg-aarch64-apple-darwin
chmod +x src-tauri/binaries/ffmpeg-aarch64-apple-darwin

# 如果 brew 装的太瘦（只有几百KB），从 evermeet 下载完整版：
# curl -L -o ffmpeg.zip "https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip"
# unzip ffmpeg.zip
# mv ffmpeg src-tauri/binaries/ffmpeg-aarch64-apple-darwin
# chmod +x src-tauri/binaries/ffmpeg-aarch64-apple-darwin
```

> 不同平台的命名规则见 `src-tauri/binaries/.gitkeep`

### 启动

```bash
npm install
npm run tauri dev
```

第一次编译 Rust 依赖（reqwest、tokio 等）会慢一些，喝杯咖啡。

---

## 🧠 它是怎么工作的

```
[视频文件]
    │  拖进窗口
    ▼
[FFmpeg 提取音频]  ← sidecar 本地执行
    │  64kbps / 单声道 / mp3
    ▼
[DashScope OSS 上传]  ← Rust 后端直接传
    │  oss:// 临时 URL
    ▼
[Qwen Omni API]  ← 流式识别+翻译
    │  SSE chunk by chunk
    ▼
[React 实时渲染]  ← 翻译一条显示一条
    │
    ▼
[SRT 导出]  ← 双击改完就保存
```

全程 JS 内存里不出现一个 base64 字符。

---

## 📂 项目结构

```
EchoSub/
├── src/                         # React 前端
│   ├── App.tsx                  # 主状态机 (idle → processing → preview)
│   ├── components/
│   │   ├── Header.tsx           # 顶部栏
│   │   ├── SettingsModal.tsx    # API Key + 语言 + 模式设置
│   │   ├── DropZone.tsx         # 拖拽/选择视频
│   │   ├── ProcessingPanel.tsx  # 四步进度条
│   │   ├── SubtitlePreview.tsx  # 字幕列表（双击编辑）
│   │   └── ExportButton.tsx     # 导出 SRT
│   ├── hooks/
│   │   ├── useAudioExtraction.ts   # FFmpeg 提取调用
│   │   └── useTranslation.ts       # 流式翻译 + 字幕解析
│   ├── utils/srtParser.ts      # SRT 解析/格式化
│   └── types/index.ts           # 类型定义
│
└── src-tauri/                   # Rust 后端
    ├── Cargo.toml               # reqwest + tokio + base64
    ├── tauri.conf.json          # sidecar 配置 + 窗口设置
    ├── capabilities/default.json # 权限清单
    ├── binaries/
    │   ├── .gitkeep
    │   └── ffmpeg-*             # ← 你的 FFmpeg 放这里
    └── src/
        ├── main.rs
        └── lib.rs               # 三个 command：
                                 #   get_file_info
                                 #   read_audio_base64
                                 #   stream_translate_file (OSS上传+HTTP+SSE)
```

---

## ⚠️ 注意事项

- DashScope API Key 存在本地 `config.json` 里（`tauri-plugin-store`），不会离开你的电脑
- OSS 上传的文件 48 小时后自动删除
- 视频直传模式仅适用于 ≤500MB 的文件（超过自动切换音频模式）
- 大文件（10 分钟以上）首次 AI 响应需要 30-60 秒，耐心等

---

## 📄 License

MIT — 随便改，随便用。
