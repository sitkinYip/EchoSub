# EchoSub 开发规范

这份文档面向日常开发。更完整的系统架构、事件流和文件位置见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 1. 技术栈

| 层级 | 选型 |
| --- | --- |
| 桌面 | Tauri v2 |
| Rust | tokio, reqwest, tauri plugins |
| 前端 | React 18 + TypeScript strict + Vite |
| 路由 | react-router-dom v6 HashRouter |
| 状态 | Zustand |
| 样式 | Tailwind CSS 3 + CSS variables |
| 存储 | tauri-plugin-store + Rust app data/cache files |
| 测试 | Vitest, cargo test |
| 质量 | ESLint, Prettier, cargo fmt, cargo clippy |

## 2. 常用命令

```bash
npm run tauri dev
npm run build
npm run test
npm run lint
npm run format:check
npm run format
cd src-tauri && cargo test
cd src-tauri && cargo fmt --check
cd src-tauri && cargo clippy -- -D warnings
npm run tauri -- build --no-bundle
```

提交前至少跑：

```bash
npm run lint
npm run format:check
npm run test
npm run build
cd src-tauri && cargo test
cd src-tauri && cargo clippy -- -D warnings
```

## 3. 目录结构

```text
src/
├── App.tsx
├── main.tsx
├── index.css
├── components/
├── config/
├── layouts/
├── pages/
│   ├── TranslatePage/
│   ├── HistoryPage/
│   └── PlayerPage/
├── services/
├── stores/
├── test/
├── types/
└── utils/

src-tauri/
├── Cargo.toml
├── tauri.conf.json
├── capabilities/default.json
└── src/
    ├── lib.rs
    ├── file_ops.rs
    ├── oss.rs
    ├── translate.rs
    ├── prompt.rs
    ├── state.rs
    └── types.rs
```

## 4. 前端分层

### 4.1 Pages

页面只负责用户交互和页面组合。

- `TranslatePage`：导入文件、选择语言/模式、展示处理进度和预览。
- `HistoryPage`：历史记录、编辑、导出、重新生成。
- `PlayerPage`：选择历史记录并播放原视频 + VTT 字幕。

页面不要直接实现长任务细节。涉及 FFmpeg、上传、翻译、历史落盘的逻辑放到 `services/` 和 `stores/`。

页面内文件拆分规则：

- 页面入口保留 `index.tsx`，只做页面级组合和少量状态解构。
- 页面专属展示组件放在该页面的 `components/` 目录，例如 `PlayerPage/components/VideoPlayer.tsx`。
- 页面专属 hook 放在该页面的 `hooks/` 目录，例如 `TranslatePage/hooks/useTranslatePageController.ts`。
- 页面专属小工具、局部类型放在该页面的 `utils/` 目录；跨页面复用后再提升到 `src/utils` 或 `src/types`。
- 不要把多个拆分文件平铺在页面根目录；根目录应优先保持可扫读。

### 4.2 Stores

| Store | 职责 |
| --- | --- |
| `settingsStore` | API Key、语言、上传模式、主题，负责加载/保存设置。 |
| `translationStore` | 当前翻译任务 UI 状态，暴露 `startPipeline/reset/cancel/updateSubtitleText`。 |
| `historyStore` | 历史记录、字幕编辑、删除、清空、保存历史。 |
| `modalStore` | 命令式弹窗队列和动画状态。 |
| `messageStore` | Toast 消息队列。 |

Store 规则：

- 组件通过 hook 读写 store。
- 异步状态更新尽量放在 store action 或 service 中。
- 历史记录保存失败必须反馈用户，不只写 console。
- `translationStore` 不直接调用 Rust command；长任务委托给 `translateService`。

### 4.3 Services

| Service | 职责 |
| --- | --- |
| `translateService` | 主翻译管线编排：探测、提取/压缩、上传、翻译、解析、保存历史。 |
| `pipelineSession` | 当前任务 session、`taskId`、取消、临时文件追踪、safe state update。 |
| `ffmpegService` | 调用 FFmpeg sidecar，并将 stderr 解析成进度文本。 |
| `mediaService` | 媒体 metadata 探测和压缩策略选择。 |
| `historyService` | `history.json` 读写和保存队列。 |

Service 规则：

- `pipelineSession` 是唯一维护当前任务生命周期的地方。
- 任何 Tauri event 都必须按 `taskId` 过滤，避免旧任务更新新任务 UI。
- 临时文件路径必须通过 `create_temp_media_path` 生成，不能写到用户原视频目录旁边。
- 模型输出解析失败时进入错误状态，不要生成 0 时长假字幕。

## 5. Rust 分层

| 文件 | 职责 |
| --- | --- |
| `lib.rs` | 初始化 Tauri、插件和 command 注册。 |
| `file_ops.rs` | 文件信息、API Key、临时文件、字幕缓存、打开目录、取消任务 command。 |
| `oss.rs` | DashScope OSS policy 获取和流式 multipart 上传。 |
| `translate.rs` | DashScope chat completions SSE 请求和事件转发。 |
| `prompt.rs` | 转录/翻译 prompt 构造。 |
| `state.rs` | AppState：取消任务集合、登记过的临时文件集合。 |
| `types.rs` | Rust command DTO 和 Tauri event payload。 |

Rust 规则：

- 自定义 command 不要对前端传入的任意路径直接执行删除。
- `delete_file` 只删除 `AppState` 登记过的临时文件。
- `delete_subtitle_file` 只删除 app subtitles 目录下的 `.srt`。
- 大媒体文件不要 `fs::read` 一次性读入内存；上传必须流式。
- 长任务必须检查 `AppState::is_cancelled(task_id)`。
- 新增 command 后要同步更新 `ARCHITECTURE.md` 的 command 清单。

## 6. Tauri Command 约定

前端通过 `invoke` 调 Rust command。命名保持 snake_case。

当前 command：

- `get_file_info`
- `reveal_in_folder`
- `write_subtitle_file`
- `delete_subtitle_file`
- `delete_file`
- `create_temp_media_path`
- `save_api_key`
- `load_api_key`
- `cancel_task`
- `upload_to_dashscope_oss`
- `stream_translate`
- `local_pipeline_translate`
- `list_whisper_models`
- `get_local_whisper_models`
- `download_whisper_model`
- `delete_whisper_model`
- `check_whisper_model_exists`
- `list_translate_models`
- `get_local_translate_models`
- `download_translate_model`
- `delete_translate_model`
- `check_translate_model_exists`
- `start_local_llm_server`
- `stop_local_llm_server`
- `get_local_llm_server_status`

新增 command 时必须说明：

- 参数结构。
- 返回值。
- 是否允许任意路径。
- 是否受 `taskId` 控制。
- 错误如何给前端展示。

### 6.1 本地 Whisper 开发注意

本地 Whisper 使用 `whisper-rs`，会编译 whisper.cpp 相关 C/C++ 代码。开发机需要可用的 C/C++ 编译链和 CMake：

- macOS：安装 Xcode Command Line Tools；Metal feature 默认启用。
- Windows/Linux：先保证 CMake、clang/gcc 可用；当前默认 CPU 构建。

音频输入必须由 FFmpeg sidecar 统一转为 16kHz、单声道、32-bit float PCM WAV：

```text
ffmpeg -i input -ar 16000 -ac 1 -c:a pcm_f32le output.wav
```

本地同语言识别不需要 API Key；本地跨语言会在 ASR 后调用 DashScope 纯文本翻译，因此仍需要 API Key。

字幕翻译模型使用 GGUF 文件，保存在 app data 的 `llm-models/` 下。

llama.cpp server 生命周期 command 已接入，sidecar 名称为 `binaries/llama-server`。需要本地字幕翻译或 `cloud-then-local` fallback 时，开发机必须准备 `llama-server` 可执行文件；只做云端翻译、Whisper ASR、模型下载管理时不需要。

### 6.2 FFmpeg sidecar 准备

FFmpeg 是核心开发依赖，不是可选项。音频提取、WAV 转换、媒体探测、视频压缩、播放器兼容副本都通过前端 `Command.sidecar("binaries/ffmpeg", args)` 调用。

FFmpeg 和 llama-server 的 sidecar 二进制都通过统一脚本准备（见 §6.3 开头），这里先说明 ffmpeg 的单独配置和手动备用方式。

#### 统一脚本（推荐）

```bash
npm run prepare:sidecars
```

脚本会自动判断平台，从官方源下载对应平台的 ffmpeg 静态编译版，解压并放到 `src-tauri/binaries/`。详细说明见 §6.3。

#### 手动准备（离线/调试备用）

实际文件必须按目标平台命名后放在 `src-tauri/binaries/` 下：

- macOS Apple Silicon：`src-tauri/binaries/ffmpeg-aarch64-apple-darwin`
- macOS Intel：`src-tauri/binaries/ffmpeg-x86_64-apple-darwin`
- Windows x64：`src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe`
- Linux x64：`src-tauri/binaries/ffmpeg-x86_64-unknown-linux-gnu`

Tauri 配置使用未带平台后缀的 sidecar 名称，`externalBin: ["binaries/ffmpeg", "binaries/llama-server"]`。Tauri 构建时会自动按目标平台补全后缀。

macOS Apple Silicon（从 evermeet.cx 下载静态编译版）：

```bash
mkdir -p src-tauri/binaries
curl -L "https://evermeet.cx/ffmpeg/getrelease/zip?build=arm64" -o /tmp/ffmpeg.zip
tar -xf /tmp/ffmpeg.zip -C /tmp
cp /tmp/ffmpeg src-tauri/binaries/ffmpeg-aarch64-apple-darwin
chmod +x src-tauri/binaries/ffmpeg-aarch64-apple-darwin
src-tauri/binaries/ffmpeg-aarch64-apple-darwin -version
```

也可用 Homebrew 安装后复制（`cp "$(which ffmpeg)" src-tauri/binaries/ffmpeg-aarch64-apple-darwin`），但 evermeet.cx 的静态版更干净（不依赖 Homebrew 路径）。

Windows x64（从 gyan.dev 下载 release essentials）：

```powershell
New-Item -ItemType Directory -Force .\src-tauri\binaries | Out-Null
curl.exe -L "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip" -o ffmpeg-essentials.zip
tar -xf ffmpeg-essentials.zip -C .\ffmpeg-pkg
Copy-Item .\ffmpeg-pkg\ffmpeg-*-essentials_build\bin\ffmpeg.exe .\src-tauri\binaries\ffmpeg-x86_64-pc-windows-msvc.exe
.\src-tauri\binaries\ffmpeg-x86_64-pc-windows-msvc.exe -version
```

Linux x64：使用发行版包管理器安装后复制，或下载静态 build（确认 glibc 兼容），目标文件名 `ffmpeg-x86_64-unknown-linux-gnu`，需 `chmod +x`。

如果从浏览器下载 macOS 二进制带 quarantine 标记：

```bash
xattr -dr com.apple.quarantine src-tauri/binaries/ffmpeg-*-apple-darwin
```

常见失败：

- `无法启动 FFmpeg: No such file or directory (os error 2)`：`ffmpeg-{target-triple}` 不存在，或文件放在了错误目录。
- Windows 下只复制成 `ffmpeg.exe`：Tauri 找不到；必须命名为 `ffmpeg-x86_64-pc-windows-msvc.exe`。
- macOS 下复制后没有执行权限：补 `chmod +x src-tauri/binaries/ffmpeg-*-apple-darwin`。
- `externalBin` 配置了 `binaries/ffmpeg` 但对应平台文件不存在：`npm run tauri dev` 或构建会失败。

### 6.3 llama-server sidecar 准备

本项目通过 Tauri sidecar 启动 llama.cpp 的 OpenAI-compatible server：

```text
binaries/llama-server --host 127.0.0.1 --port 39117 --model <app-data>/llm-models/*.gguf --ctx-size 4096
```

ffmpeg 和 llama-server 都在 `src-tauri/tauri.conf.json` 的 `bundle.externalBin` 里写死，双端都是必需 sidecar。二者配套的动态库通过平台特定配置文件声明为 resources：

- `src-tauri/tauri.conf.json`：主配置，`externalBin` 含 ffmpeg + llama-server，不含 resources。
- `src-tauri/tauri.macos.conf.json`：macOS 覆盖，`resources: ["binaries/*.dylib"]`。
- `src-tauri/tauri.windows.conf.json`：Windows 覆盖，`resources: ["binaries/*.dll"]`。

Tauri 在构建时按当前平台自动读取对应的覆盖文件并深合并。`src-tauri/build.rs` 还会在 dev 模式把动态库复制到 `target/<profile>/binaries/`，使 sidecar 进程能在自身目录找到依赖。

#### 统一准备脚本（推荐，ffmpeg + llama 一起搞定）

```bash
npm run prepare:sidecars
```

`scripts/prepare-sidecars.mjs` 自动判断当前平台（macOS arm64 / Windows x64），一次完成：

| 步骤 | macOS arm64 | Windows x64 |
|---|---|---|
| ffmpeg 下载源 | evermeet.cx 静态编译 arm64 版 | gyan.dev release-essentials |
| llama 下载源 | GitHub release `macos-arm64.tar.gz` | GitHub release `bin-win-cpu-x64.zip` |
| 路径修正 | 调用 `fix:macos-dylibs`（官方包通常是 no-op） | 无需（Windows DLL 无 rpath 问题） |

脚本会先清理旧文件（避免版本残留），再下载解压复制。不依赖开发机的 Homebrew 或任何本地工具，只需 Node.js 和 `tar`（macOS 和 Windows 10+ 都自带）。其他平台（macOS Intel / Linux）会明确报错退出。

幂等：可重复运行，每次先清理再重新下载。若中途中断会留下空 binaries 目录，重新运行即可恢复。

实际 sidecar 文件必须按目标平台命名后放在 `src-tauri/binaries/` 下：

- macOS Apple Silicon：`src-tauri/binaries/llama-server-aarch64-apple-darwin`
- macOS Intel：`src-tauri/binaries/llama-server-x86_64-apple-darwin`
- Windows x64：`src-tauri/binaries/llama-server-x86_64-pc-windows-msvc.exe`
- Linux x64：`src-tauri/binaries/llama-server-x86_64-unknown-linux-gnu`

#### Windows x64

1. 官方 release 包：打开 `https://github.com/ggml-org/llama.cpp/releases`。
2. 优先下载 CPU 通用包 `llama-*-bin-win-cpu-x64.zip`；只有确认显卡驱动、CUDA/Vulkan 运行库匹配时，再选择 CUDA/Vulkan 包。
3. 解压后复制 `llama-server.exe` 为 `src-tauri/binaries/llama-server-x86_64-pc-windows-msvc.exe`。
4. 同包里的 `*.dll` 也要放到 `src-tauri/binaries/`，否则启动时报 DLL 缺失。
5. 验证：

```powershell
.\src-tauri\binaries\llama-server-x86_64-pc-windows-msvc.exe --version
```

Windows 示例命令：

```powershell
Expand-Archive .\llama-*-bin-win-cpu-x64.zip -DestinationPath .\llama
Copy-Item .\llama\llama-*\llama-server.exe .\src-tauri\binaries\llama-server-x86_64-pc-windows-msvc.exe
Copy-Item .\llama\llama-*\*.dll .\src-tauri\binaries\
```

Windows 的 llama.cpp 官方包自带全套 DLL，依赖自包含，不需要额外处理。

#### macOS（Apple Silicon）

**推荐方式：一键脚本（不依赖任何本地环境）**

```bash
npm run prepare:macos-sidecars
```

脚本自动完成：查询 llama.cpp 最新 release → 下载 macOS arm64 官方包 → 解压 → 复制 `llama-server` + 全部 `lib*.dylib` 到 `src-tauri/binaries/` → 调用 `fix-macos-dylibs` 做路径检查。全程不依赖 Homebrew 或任何开发机工具，任何 Mac 上都能跑。

**为什么官方包可以直接用**

llama.cpp 官方 release 包（`llama-b<build号>-bin-macos-arm64.tar.gz`）是**静态链接、自包含**的：
- 所有动态库依赖用 `@rpath/<basename>` 形式（可移植）
- `llama-server` 自带 `@loader_path` rpath，dylib 放同目录就能加载
- 不依赖 openssl、不依赖 Homebrew

这与 ffmpeg 一样"放进去就能用"。`fix:macos-dylibs` 对官方包通常报告"0 处修正"（因为路径本来就对），保留它是为了：
- 兜底：万一某天 llama.cpp 版本回退导致路径问题
- 诊断：检测 binaries 里的 dylib 是否有不可移植的路径

**手动方式（备用，不推荐）**

如果无法用脚本（比如离线环境），可手动下载：

1. 打开 [https://github.com/ggml-org/llama.cpp/releases](https://github.com/ggml-org/llama.cpp/releases)
2. 下载 `llama-b<build号>-bin-macos-arm64.tar.gz`
3. 解压并复制：

```bash
mkdir -p /tmp/llama-pkg
tar -xzf ~/Downloads/llama-*-bin-macos-arm64.tar.gz -C /tmp/llama-pkg
cp /tmp/llama-pkg/llama-server src-tauri/binaries/llama-server-aarch64-apple-darwin
cp /tmp/llama-pkg/lib*.dylib src-tauri/binaries/
chmod +x src-tauri/binaries/llama-server-aarch64-apple-darwin
```

4. 跑一次检查（对官方包通常是 no-op，但确认无误）：

```bash
npm run fix:macos-dylibs
```

**不推荐：Homebrew 方式**

`brew install llama.cpp` 复制出来的二进制**不可移植**——它的 dylib 依赖路径硬编码了 `/opt/homebrew/opt/...`，换一台没装相同 Homebrew 包的 Mac 就无法加载。虽然 `fix:macos-dylibs` 能修复，但比官方包多此一举，且会引入 openssl 依赖。除非有特殊原因，否则用官方包。

**验证**

```bash
# 依赖应全部是 @rpath 或系统库，无绝对路径
otool -L src-tauri/binaries/llama-server-aarch64-apple-darwin | grep -E "homebrew|/Users/"
# 应无输出

# install_name 应是 @rpath/...
otool -D src-tauri/binaries/libllama.0.dylib
```

注意：本机若被公司安全策略拦截（退出码 137 / AMFI / Xprotect），换官方 release 包或在无拦截的机器上运行。

注意：本机若被公司安全策略拦截（退出码 137 / AMFI / Xprotect），换官方 release 包或本机编译版本。

#### 本地字幕翻译 fallback

已接入 `local_pipeline_translate`：

- `cloud-only`：只调用 DashScope 文本翻译。
- `cloud-then-local`：DashScope 返回 `DataInspectionFailed` 时切到本地 llama-server。
- `local-only`：跳过 DashScope，直接调用本地 llama-server。

#### 常见失败

- `启动 llama-server 失败: No such file or directory (os error 2)`：`src-tauri/binaries/llama-server-{target-triple}` 不存在。
- `Library not loaded`：只复制了 `llama-server`，没有复制配套 `.dylib` / `.dll`。
- macOS 报 `image not found` 且路径含 `/opt/homebrew`：dylib 未跑 `npm run fix:macos-dylibs`，依赖仍是 Homebrew 绝对路径。
- 进程立刻退出（退出码 137，macOS 日志出现 `AMFI`/`XprotectService`/`Gatekeeper`，或 Windows 安全软件拦截）：系统安全策略拦截，需换本机编译/官方 release 包，或按安全策略放行。

## 7. 事件约定

Rust 通过 Tauri event 向前端推送翻译过程。

事件名：

- `translate-progress`
- `translate-chunk`
- `translate-error`
- `translate-done`
- `model-download-progress`

payload 格式：

```ts
type TaskEvent<T> = {
  taskId: string;
  payload: T;
};
```

前端 listener 必须先判断 `payload.taskId === currentSession.taskId`，再更新 UI。

## 8. 组件规范

### 8.1 组件目录

共享组件使用独立文件夹：

```text
components/ComponentName/index.tsx
```

页面专属组件放在页面目录下：

```text
pages/HistoryPage/HistoryCard.tsx
pages/PlayerPage/components/VideoPlayer.tsx
```

### 8.2 Props 和导出

- 函数组件使用 `export default function ComponentName(...)`。
- Props 用局部 `interface Props`。
- 不使用 `React.FC`。
- 避免 `any`；需要擦除动态类型时用 `unknown` 或局部 type guard。

### 8.3 图标

统一使用：

```tsx
import Icon from "@/components/Icon";
<Icon name="download" className="w-4 h-4" />
```

新增图标时同步更新：

- `src/config/index.ts` 的 `IconName`
- `src/components/Icon/index.tsx` 的 `PATHS`

## 9. 样式规范

颜色使用 Tailwind `app-*` token，不在组件里硬编码具体颜色。

常用 token：

- `bg-app-bg`
- `bg-app-surface`
- `bg-app-surface-alt`
- `bg-app-elevated`
- `bg-app-hover`
- `text-app-text`
- `text-app-text-secondary`
- `text-app-text-tertiary`
- `border-app-border`
- `border-app-border-light`
- `text-app-accent`
- `text-app-success`
- `text-app-error`

动效：

```css
transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]
```

圆角约定：

- 面板/卡片：`rounded-2xl`
- 按钮/输入框：`rounded-xl`
- 大 dropzone：`rounded-3xl`

## 10. Modal 和 Toast

Modal 使用注册制：

- 注册表：`src/config/modals.ts`
- Store：`src/stores/modalStore.ts`
- 调用：`showModal(name, data, config)`
- Renderer：`src/components/Modal/index.tsx`

内容组件只渲染内容，不渲染遮罩和外层容器。

Toast 使用：

```ts
showMessage({
  type: "error",
  title: "保存失败",
  description: "请稍后重试",
});
```

## 11. 测试要求

优先测试纯逻辑和任务生命周期：

- `utils/srtParser.test.ts`
- `services/pipelineSession.test.ts`
- Rust `prompt.rs` tests
- Rust `file_ops.rs` tests
- Rust `whisper.rs` tests
- Rust `providers/text_translate.rs` tests

新增以下逻辑时应补测试：

- SRT/VTT 解析或序列化。
- 任务取消、临时文件清理、旧任务事件过滤。
- 历史记录保存和迁移。
- Rust 文件路径校验。
- Prompt 关键输出约束。

## 12. 格式化和 Lint

- JS/TS/JSON/CSS 使用 Prettier。
- Rust 使用 `cargo fmt`。
- JS/TS 使用 ESLint。
- Rust 使用 clippy 且要求 `-D warnings`。

提交前建议跑：

```bash
npm run build
npm test
cd src-tauri && cargo test
cd src-tauri && cargo clippy -- -D warnings
```

不要为了通过 lint 引入宽泛 `any` 或静默吞错。确实需要动态类型时，优先写局部类型、type guard 或 `unknown`。
