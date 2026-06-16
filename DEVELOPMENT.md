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

新增 command 时必须说明：

- 参数结构。
- 返回值。
- 是否允许任意路径。
- 是否受 `taskId` 控制。
- 错误如何给前端展示。

## 7. 事件约定

Rust 通过 Tauri event 向前端推送翻译过程。

事件名：

- `translate-progress`
- `translate-chunk`
- `translate-error`
- `translate-done`

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

不要为了通过 lint 引入宽泛 `any` 或静默吞错。确实需要动态类型时，优先写局部类型、type guard 或 `unknown`。
