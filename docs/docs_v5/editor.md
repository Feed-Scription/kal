# Editor 模块

**状态：已接入 Engine API，并支持 Session 编辑**

Editor 是 KAL 项目的可视化审查工具。它的核心价值是把 agent 生成的 Flow / Session JSON 渲染成图，让人快速查看逻辑是否合理。

Editor 不是主要创作工具。在 agent 是第一公民的架构下，Flow 主要由 agent 生成 JSON，Editor 用于审查和轻量调整（改参数、调 prompt、改 session 跳转）。

## 架构

```text
浏览器 UI -> Engine HTTP API (http://localhost:3000) -> Core
```

Editor 不再直接读写本地文件，所有数据操作都通过 Engine 服务完成。用户需要先启动 Engine 服务，然后在 Editor 中点击"连接"。

## 使用方式

1. 启动 Engine：`kal serve <project-path>`
2. 启动 Editor：`cd apps/editor && pnpm dev`
3. 在浏览器中打开 Editor，点击"连接"按钮

## 已实现能力

### 1. Engine 连接

- 连接到 `http://localhost:3000` 的 Engine 服务
- 自动加载项目信息、Flow 列表、Flow 详情、Session、Node manifest
- 连接状态指示（状态栏绿点/红点）
- 断开连接 / 重载项目

### 2. Flow 列表管理

- 查看 Flow 列表（数据来自 `GET /api/flows`）
- 创建 Flow（通过 `PUT /api/flows/:id` 保存新 Flow）
- 切换当前 Flow

重命名和删除 Flow 当前 Engine API 不支持，需要在文件系统中操作后点击"重载项目"。

### 3. Flow 画布

- React Flow 画布渲染
- 基于 Node manifest 的通用节点渲染
- 节点右键菜单直接来自 Engine 返回的 manifest，而不是 editor 本地硬编码列表
- 拖拽节点、连线
- 右键菜单添加节点
- 小地图与控制面板

这意味着 editor 已和“内建节点列表”解耦：

- Core / 项目中的自定义节点只要能被 Engine 注册，就会自动出现在 editor 中
- `defaultConfig`、`inputs`、`outputs`、`configSchema` 都以 runtime manifest 为准

### 4. Session 画布

- 独立的 Session 视图
- 支持 `RunFlow` / `Prompt` / `Choice` / `Branch` / `End`
- 支持创建、保存、删除 `session.json`
- Session 定位为轻量交互壳，不承载复杂叙事内容

### 5. 保存

- 自动保存（1 秒防抖，调用 `PUT /api/flows/:id`）
- 手动保存（`Ctrl/Cmd + S`）
- 导出当前 Flow 为 JSON 文件
- 保存状态栏反馈

Engine 会对保存的 Flow 做完整校验；Session 保存则走单独的 Session 校验链路。

### 6. 单次调试执行

- 点击"运行"按钮弹出执行对话框
- 根据 `flow.meta.inputs` 动态生成输入字段
- 调用 `POST /api/executions` 执行 Flow
- 显示执行结果（JSON 格式化）或错误信息

### 7. Session Runtime 面板

- Session 视图提供一个轻量运行面板
- 点击“运行”后调用 `POST /api/runs` 创建 managed run
- Editor 通过 `GET /api/runs/:id/stream` 订阅 run 级别 SSE
- 输入提交走 `POST /api/runs/:id/advance`
- 面板展示：
  - 当前 `status` / `waiting_for`
  - 最近事件输出
  - `state_summary.preview`
  - 完整 state JSON

注意：Editor 只负责薄 UI 和输入采集，不负责自己维护 Session cursor、state snapshot 或恢复逻辑。

### 8. State 查看

- 只读展示项目 State 数据
- Engine 当前无 State 保存 API，修改需编辑 `initial_state.json` 后重载

### 9. Config 查看

- 只读展示项目配置
- Engine 当前无 Config 保存 API，修改需编辑 `kal_config.json` 后重载

## FlowDefinition 格式

Editor 的 `FlowDefinition` 类型已与 Core 对齐，采用 `{ meta, data }` 嵌套结构：

```typescript
type FlowDefinition = {
  meta: FlowMeta;    // { schemaVersion, name?, description?, inputs?, outputs? }
  data: FlowData;    // { nodes: NodeDefinition[], edges: EdgeDefinition[] }
};
```

## Engine API 依赖

| 方法 | 路径 | Editor 用途 |
|------|------|-------------|
| GET | `/api/project` | 连接时加载项目信息 |
| GET | `/api/flows` | 加载 Flow 列表 |
| GET | `/api/flows/:id` | 加载单个 Flow 详情 |
| PUT | `/api/flows/:id` | 保存 Flow（含校验） |
| POST | `/api/executions` | 运行 Flow |
| GET | `/api/nodes` | 获取 Node manifest，驱动 Flow 节点目录与表单 |
| GET | `/api/session` | 加载 Session |
| PUT | `/api/session` | 保存 Session |
| DELETE | `/api/session` | 删除 Session |
| POST | `/api/runs` | 创建 Session managed run |
| GET | `/api/runs` | 查询现有 runs |
| GET | `/api/runs/:id/state` | 获取 run state |
| POST | `/api/runs/:id/advance` | 提交输入并推进 run |
| POST | `/api/runs/:id/cancel` | 取消 run |
| GET | `/api/runs/:id/stream` | 订阅 run 的 SSE 更新 |
| POST | `/api/project/reload` | 热重载项目 |

## 当前限制

| 操作 | 状态 |
|------|------|
| 创建 Flow | 支持（通过 PUT 保存新 Flow） |
| 重命名 Flow | 不支持，需文件系统操作后重载 |
| 删除 Flow | 不支持，同上 |
| 编辑 State | 不支持（只读），需编辑文件后重载 |
| 编辑 Config | 不支持（只读），同上 |
| 直接在 editor 中运行 managed Session | 支持（run 级别，不暴露底层执行细节） |

以下能力不计划在 Editor 中实现（不属于审查工具的职责）：

- 节点级执行高亮 / 逐节点 trace 流
- 长期运行时 State 可视化编排
- Telemetry 面板
- 完整产品级多轮对话界面

## 定位说明

Editor 在整体架构中的角色：

```text
Engine API
  ├── Editor（审查工具）— 查看 Flow / Session 拓扑、轻量调整参数、薄 runtime 面板
  ├── 通用 TUI（已实现）— 交互式运行、多轮对话调试
  └── 用户自定义前端 — 最终产品形态（游戏 UI、聊天界面等）
```

Editor 不需要过多投入，当前功能已满足审查需求。

## 关键文件

| 文件 | 职责 |
|------|------|
| `src/api/engine-client.ts` | Engine HTTP API 客户端 |
| `src/store/projectStore.ts` | 项目状态管理（通过 API） |
| `src/types/project.ts` | 类型定义（与 Core 对齐） |
| `src/components/ProjectLoader.tsx` | Engine 连接页面 |
| `src/components/ExecutionDialog.tsx` | Flow 执行对话框 |
| `src/components/SessionRunDialog.tsx` | Session runtime 运行面板 |
| `src/Flow.tsx` | Flow 画布编辑器 |
| `src/SessionEditor.tsx` | Session 画布编辑器 |
| `src/nodes/ManifestNode.tsx` | 基于 Node manifest 的通用节点组件 |
| `src/AppSidebar.tsx` | 侧边栏导航 |
| `src/components/FlowToolbar.tsx` | Flow 工具栏 |
| `src/components/StatusBar.tsx` | 状态栏（含连接状态） |
| `src/components/StateManager.tsx` | State 只读展示 |
| `src/components/ConfigEditor.tsx` | Config 只读展示 |
