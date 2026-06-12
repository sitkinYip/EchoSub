# EchoSub 前端开发规范

## 0. 技术栈

| 层级 | 选型 |
|------|------|
| 框架 | React 18 + TypeScript (strict) |
| 构建 | Vite 5 + Tauri v2 |
| 路由 | react-router-dom v6 (HashRouter) |
| 状态 | Zustand |
| 样式 | Tailwind CSS 3 + CSS 自定义属性 |
| 持久化 | `@tauri-apps/plugin-store` |

---

## 1. 目录结构

```
src/
├── main.tsx                  # ReactDOM 入口
├── App.tsx                   # Router 配置
├── index.css                 # 全局样式 + 主题变量
├── vite-env.d.ts
├── config/                   # 全局配置常量
│   ├── index.ts              # 语言、步骤、导航、文件扩展名等
│   └── theme.ts              # Theme 类型定义 & 标签
├── types/
│   └── index.ts              # 全项目共享类型
├── utils/
│   └── srtParser.ts          # 纯函数工具
├── stores/                   # Zustand stores
│   ├── settingsStore.ts      # 用户设置（含主题）
│   └── translationStore.ts   # 翻译全流程 + 历史记录
├── components/               # 全局共享组件
│   ├── Icon/
│   │   └── index.tsx         # 统一图标组件，<Icon name="..." />
│   ├── DropZone/
│   │   └── index.tsx
│   ├── ExportButton/
│   │   └── index.tsx
│   ├── SubtitlePreview/
│   │   └── index.tsx
│   ├── ProcessingPanel/
│   │   └── index.tsx
│   ├── ApiKeyModal/
│   │   └── index.tsx
│   ├── SettingsPopover/
│   │   └── index.tsx
│   ├── LangSelect/
│   │   └── index.tsx
│   └── FilePill/
│       └── index.tsx
├── layouts/
│   └── RootLayout.tsx        # 侧边栏 + Outlet
└── pages/                    # 路由页面
    ├── TranslatePage/
    │   └── index.tsx         # 翻译主页面
    ├── HistoryPage/
    │   └── index.tsx
    └── PlayerPage/
        └── index.tsx
```

## 2. 组件规范

### 2.1 每个组件独立文件夹

```
ComponentName/
└── index.tsx    # 入口文件，export default
```

- 后续可按需添加：`constants.ts`（组件专属常量）、`utils.ts`（组件专属工具）、`ComponentName.module.css`、`__tests__/`
- **不要**把多个不相关的组件放同一个文件
- **不要**在 tsx 里定义内联组件（除非是 10 行以内的纯 UI 辅助函数）

### 2.2 组件命名

- 文件夹：`PascalCase`
- 默认导出组件名 = 文件夹名
- Props interface 命名为 `Props`（局部）或导出为 `ComponentNameProps`

```tsx
// components/ExportButton/index.tsx
interface Props {
  items: SubtitleItem[];
  disabled?: boolean;
  videoFileName?: string;
}

export default function ExportButton({ items, disabled, videoFileName }: Props) {
  // ...
}
```

### 2.3 图标使用

```tsx
import Icon from "../components/Icon";
<Icon name="download" className="w-4 h-4" />
```

- 可用图标名见 `config/index.ts` → `IconName` 类型
- 新增图标：在 `components/Icon/index.tsx` 的 `PATHS` 对象中追加，同时在 `config/index.ts` 的 `IconName` 联合类型中注册
- **禁止**在组件里写 inline `<svg>`，全部走 Icon 组件

### 2.4 页面也走文件夹

```
pages/MyPage/index.tsx
```

页面目录可容纳专属子组件，例如：

```
pages/HistoryPage/
├── index.tsx
├── HistoryCard.tsx     # 未来
└── useHistoryFilter.ts # 未来
```

## 3. 样式规范

### 3.1 主题变量（禁止硬编码颜色）

所有颜色统一使用 Tailwind `app-*` token：

| Token | 用途 |
|-------|------|
| `bg-app-bg` | 页面最底层背景 |
| `bg-app-surface` | 卡片/输入框背景 |
| `bg-app-surface-alt` | 次要表面 |
| `bg-app-elevated` | 弹窗/浮层背景 |
| `bg-app-hover` | hover 态 |
| `bg-app-btn` | 按钮默认背景 |
| `bg-app-btn-hover` | 按钮 hover |
| `text-app-text` | 主要文字 |
| `text-app-text-secondary` | 次要文字 |
| `text-app-text-tertiary` | 辅助文字/placeholder |
| `border-app-border` | 默认边框 |
| `border-app-border-light` | 细边框 |
| `ring-app-border` | 等同边框 ring |
| `bg-app-accent-bg` | 强调色浅底 |
| `text-app-accent` | 强调色文字/图标 |
| `ring-app-accent-ring` | 强调色 ring |
| `bg-app-success-bg` | 成功浅底 |
| `text-app-success` | 成功文字/图标 |
| `ring-app-success-ring` | 成功 ring |
| `bg-app-error-bg` | 错误浅底 |
| `text-app-error` | 错误文字/图标 |
| `ring-app-error-ring` | 错误 ring |

**规则：**
- **绝不**在 className 里写 `white/`、`black/`、`blue-`、`red-`、`emerald-` 等颜色值
- **绝不**写硬编码 hex 色 `#0a0a0a`、`#121212` 等
- 修改主题只需改 `src/index.css` 的 CSS 变量

### 3.2 过渡 & 动效

```css
/* 统一 cubic-bezier */
transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]
```

- 按钮点击：`active:scale-[0.97]` 或 `active:scale-95`
- 不使用 `linear` 或 `ease-in-out`
- 状态切换必须过渡，不允许瞬间变化

### 3.3 圆角

- 卡片/面板：`rounded-2xl`
- 按钮/输入框：`rounded-xl`
- 大区域（dropzone）：`rounded-3xl`
- 弹窗模态框：`rounded-2xl`

### 3.4 字体

全局单一字体栈：`"Plus Jakarta Sans", system-ui, -apple-system, sans-serif`

## 4. 配置管理

### 4.1 config/index.ts

存放**不依赖 React 上下文**的常量和枚举：

- 语言列表、视频扩展名、文件大小上限
- 处理步骤定义
- 导航项配置
- IconName 类型

### 4.2 config/theme.ts

存放主题相关类型定义。

### 4.3 何时放 config vs types

| 放 `config/` | 放 `types/` |
|-------------|------------|
| 常量值、枚举值 | 纯类型/interface |
| 运行时会引用的数组/对象 | 只用于 TS 编译时 |

## 5. 状态管理

### 5.1 Store 划分

| Store | 职责 |
|-------|------|
| `settingsStore` | apiKey、语言、上传模式、**主题** — 持久化到 `config.json` |
| `translationStore` | 翻译全流程状态 + 历史记录 — 翻译结果持久化到 `history.json` |
| `modalStore` | 命令式弹窗队列，show / close / 动画编排 |

### 5.2 Store 编写规范

- 每个 store 一个文件，`create<State & Actions>((set, get) => ({}))`
- 异步操作（load、save、API 调用）放在 store 的 action 中
- 组件 **只通过 hook** 读写 store，不直接 import `Store.load()`
- Store 内部使用 `get()` 读取实时状态（避免闭包过期）
- 模块级私有变量（非 reactive）用 `let` 定义在 store 文件顶部

### 5.3 组件内使用

```tsx
const apiKey = useSettingsStore((s) => s.apiKey);       // 精确选择
const { apiKey, sourceLang, update } = useSettingsStore(); // 多字段解构
```

## 6. 路由

- 使用 `HashRouter`（Tauri 环境必需）
- 路由配置集中在 `App.tsx`
- 页面通过 `<Outlet />` 在 `RootLayout` 中渲染
- 新增页面路径时在 `config/index.ts` 的 `NAV_ITEMS` 中注册

## 7. 代码风格

### 7.1 Import 顺序

1. React / 第三方
2. Tauri 插件
3. 本地组件
4. Stores
5. Config / Types / Utils
6. 类型导入单独一行 `import type { ... }`

### 7.2 函数组件

- 一律 `export default function ComponentName()`
- 不使用 `React.FC` 类型标注
- Props 用解构 + interface

### 7.3 禁止事项

- 不在 tsx 中定义常量数组/对象（提取到 `config/` 或组件文件夹内的 constants）
- 不在组件文件中写 SVG path 字符串（走 Icon 组件）
- 不复制粘贴 parser/工具函数（统一引用 `utils/srtParser.ts`）
- 不保留未使用的 type/interface（已在 `types/index.ts` 中清除）
- 不留空的 hooks 目录

## 8. 命令式弹窗系统

所有弹窗通过**注册制 + 命令式调用**管理，无需在 JSX 中声明。

### 8.1 调用方式

```ts
import { showModal, closeModal } from "../components/Modal/create";

// 打开弹窗
showModal("ApiKey", { someData: 42 }, { maskClosable: true });

// 关闭顶层弹窗
closeModal();

// 关闭指定弹窗（传入实例 id）
closeModal("modal_3");
```

### 8.2 注册新弹窗

**Step 1:** 在 `config/modals.ts` → `ModalName` 枚举中新增名称。

**Step 2:** 在同文件 `MODAL_REGISTRY` 中注册默认配置 + 组件加载器：

```ts
[ModalName.MyModal]: {
  defaults: { maskClosable: true, showClose: true, width: "md" },
  loader: () => import("../components/MyModal/index.tsx"),
},
```

**Step 3:** 编写内容组件，接收 `ModalContentProps`：

```tsx
import type { ModalContentProps } from "../../config/modals";

interface MyData { title: string; }

export default function MyModal({ close, data }: ModalContentProps<MyData>) {
  return (
    <div>
      <h2>{data.title}</h2>
      <button onClick={close}>关闭</button>
    </div>
  );
}
```

### 8.3 关键规则

- 内容组件 **不渲染遮罩/容器**（由 Modal 组件统一处理）
- 内容组件通过 `close()` 关闭自己
- 内容组件可自由使用 Zustand stores
- Modal 名从 `ModalName` 枚举取值，确保类型安全
- 弹窗叠加：后打开的叠在上层，关闭上层后下层自动显示

### 8.4 配置项

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `maskClosable` | `true` | 点击遮罩是否关闭 |
| `showClose` | `true` | 是否显示右上角 X 按钮 |
| `width` | `"sm"` | 面板宽度：`sm` / `md` / `lg` |

### 8.5 动画

进入：遮罩 fade in + 面板 scale(0.95)→scale(1) + translateY(4px)→0 + opacity 0→1

退出：反向 300ms cubic-bezier(0.32, 0.72, 0, 1)

## 9. 类型管理

`src/types/index.ts` 定义全项目共享类型：

- `SubtitleItem` — 字幕条目
- `Language` — 语言
- `VideoFile` — 文件信息
- `HistoryEntry` — 历史记录

删除原则：TS 编译通过后，检查 types 中各类型是否有引用，未引用的立即删除。

## 10. 新功能 Checklist

开发新功能时的检查点：

- [ ] 新增的常量/枚举在 `config/` 中定义
- [ ] 新增的图标在 `Icon/index.tsx` + `IconName` 类型中注册
- [ ] 颜色全部使用 `app-*` token
- [ ] 组件独立文件夹，入口为 `index.tsx`
- [ ] 页面状态优先考虑放 store（如需跨 tab 保留）
- [ ] 类型放到 `types/index.ts` 或组件内 `interface Props`
- [ ] `npm run tauri build` 通过
