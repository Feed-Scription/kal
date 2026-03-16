# Engine 模块

**状态：已完成（最小落地范围）**

相关后续设计：`kal debug` 的 Agent 友好调试方案见 [agent-debug.md](./agent-debug.md)。

Engine 是把 Core 变成"可运行产品能力"的宿主层。当前 `apps/engine` 模块已经落地，覆盖了项目加载、CLI、HTTP API、Session 运行和统一错误模型。

## Engine 在架构中的职责

Engine 负责：

1. 加载项目目录
2. 读取配置、Flow、初始 State 和自定义 Node
3. 创建并持有 Core 实例
4. 提供 CLI
5. 提供 HTTP API
6. 为 TUI、当前 Editor 和未来 Studio Kernel / 官方扩展提供统一服务入口

## 当前已实现能力

### 1. 项目加载

`ProjectLoader`（`src/project-loader.ts`）已实现：

- 读取 `kal_config.json`（通过 Core 的 `ConfigLoader.parse` 解析，支持环境变量替换）
- 读取可选的 `initial_state.json`
- 扫描 `flow/*.json` 并通过 `FlowLoader` 校验和加载所有 Flow
- 读取可选的 `session.json`
- 解析项目根目录下的 `node/` 自定义节点目录路径
- 构建 `EngineProject` 数据结构，包含 flowsById、flowTextsById、flowFileMap

缺失文件会抛出带有明确错误码的 `EngineHttpError`（如 `PROJECT_CONFIG_NOT_FOUND`、`FLOW_DIR_NOT_FOUND`）。

### 2. EngineRuntime

`EngineRuntime`（`src/runtime.ts`）是 Engine 的核心运行时类，已实现：

- `EngineRuntime.create(projectRoot)` — 静态工厂方法，加载项目并创建 Core 实例
- `reload()` — 重新加载项目和 Core（重置运行时状态）
- `getProjectInfo()` — 返回项目名、版本、Flow 列表、自定义节点列表、State key 列表
- `listFlows()` — 返回 Flow 列表及其 meta 信息
- `getFlow(flowId)` — 获取单个 Flow 定义
- `saveFlow(flowId, flow)` — 校验、写盘、原子性更新内存状态
- `executeFlow(flowId, inputData)` — 执行 Flow 并返回结果
- `getNodeManifests()` — 导出所有已注册节点的 manifest（含 `configSchema` / `defaultConfig`）
- `hasSession()` / `getSession()` — 读取项目的 `session.json`
- `saveSession()` / `deleteSession()` — 保存或删除 Session
- `createSession()` — 创建 Session 异步生成器，供 TUI 驱动多轮交互
- `getState()` — 返回当前 StateStore 的所有状态（供 TUI `/state` 命令使用）

### 3. CLI

`cli.ts` + `bin.ts` 提供了 `kal` 命令行入口，已实现：

- `kal serve [project-path] [--host <host>] [--port <port>]` — 启动 HTTP 服务
- `kal studio [project-path] [--host <host>] [--port <port>]` — 启动集成 Editor 的一体化服务（Engine API + Editor 静态文件）
- `kal play [project-path]` — 启动交互式 TUI
- `kal debug [project-path]` — 可恢复、结构化输出的 CLI 调试入口，支持 `--start/--continue/--step/--state/--list/--delete/--retry/--skip`，支持 `--format json|pretty|agent`
- `kal lint [project-path] [--format json|pretty]` — 项目级静态分析（session 校验、unused flow、state key 检查、deep node validation）
- `kal smoke [project-path] [--steps N] [--input value]... [--dry-run]` — 最小 smoke test，按步推进 Session 并输出状态变化
- `kal eval <nodes|render|run|compare>` — Prompt eval 工具链（查看节点、渲染 prompt、执行评估、对比结果）
- `kal init <project-name> [--template minimal|game]` — 项目脚手架
- `kal schema <nodes|node <type>|session>` — 导出 node 和 session schema
- `kal config <init|set|get|list|remove|set-key>` — 配置管理（API 密钥加密存储、自定义 Base URL 等）
- `kal help` / `kal --help` / `kal -h` — 打印用法
- 优雅关闭（监听 SIGINT / SIGTERM）
- 依赖注入设计（`CliDependencies`），便于测试

### 3.1 通用 TUI（`kal play`）

`kal play` 提供基于 Session 的交互式终端运行体验，直接使用 `EngineRuntime`（进程内调用，不走 HTTP）：

- 要求项目存在 `session.json`
- 内部通过 `runtime.createSession()` 驱动 `RunFlow / Prompt / Choice / Branch / End`
- readline 循环：接收 Session 事件 → 渲染输出 / 提示输入 / 接收选择 → 回送给 Session 执行器
- 内置命令：`/quit` 退出、`/state` 查看当前状态、`/help` 帮助
- 输出渲染协议：Flow 输出对象统一格式化展示
- 状态栏使用 ANSI 颜色区分不同类型的值

### 4. HTTP API

`server.ts` 提供了基于 Node.js 原生 `http` 模块的 HTTP 服务，已实现：

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/project` | 读取项目信息 |
| POST | `/api/project/reload` | 热重载项目 |
| GET | `/api/flows` | 获取 Flow 列表 |
| GET | `/api/flows/:id` | 获取单个 Flow 内容 |
| PUT | `/api/flows/:id` | 保存 Flow（含校验） |
| POST | `/api/executions` | 触发 Flow 执行 |
| GET | `/api/nodes` | 获取 Node manifest 列表 |
| GET | `/api/session` | 读取 Session |
| PUT | `/api/session` | 保存 Session |
| DELETE | `/api/session` | 删除 Session |
| POST | `/api/runs` | 创建 managed run，并自动推进到第一个交互边界 |
| GET | `/api/runs` | 列出当前项目下的 managed runs |
| GET | `/api/runs/:id` | 获取单个 run 的当前视图 |
| GET | `/api/runs/:id/state` | 获取 run 的完整状态快照 |
| POST | `/api/runs/:id/advance` | 提交输入并继续推进 run |
| POST | `/api/runs/:id/cancel` | 取消并删除指定 run |
| GET | `/api/runs/:id/stream` | 订阅 run 的 SSE 更新流 |

附加能力：

- CORS 支持（`Access-Control-Allow-Origin: *`，开发阶段）
- 请求体大小限制（1MB）
- Content-Type 校验（要求 `application/json`）
- OPTIONS 预检请求处理
- managed run 存储（项目级 `.kal/runs`）
- run SSE 事件：`run.created` / `run.updated` / `run.ended` / `run.cancelled` / `run.invalidated`

### 4.1 Managed Run Runtime

`kal serve` 现在已经具备一层面向薄前端的 managed run 协议，用于替代前端自己编排 Session 执行过程。

默认交互模型：

- 前端 `POST /api/runs` 创建一个 run
- Engine 自动推进到下一个交互边界（`waiting_input` / `ended` / `error`）
- 前端读取 `RunView` 中的 `status` / `waiting_for` / `state_summary` / `recent_events`
- 需要用户输入时，前端通过 `POST /api/runs/:id/advance` 提交 input
- 需要更流畅的 UI 时，前端通过 `GET /api/runs/:id/stream` 订阅 SSE

这样前端只需要承担展示和输入采集，不再需要自己维护 Session cursor、state snapshot 和恢复逻辑。

### 5. 统一错误模型

`errors.ts` 已实现：

- `EngineHttpError` — 带 status / code / details 的 HTTP 错误类
- `formatEngineError()` — 将任意错误格式化为统一的 `EngineErrorPayload`
- `statusForError()` — 根据错误类型映射 HTTP 状态码
- 识别 Core 的 `ValidationError`（400）、`ConfigError`（400）、`KalError`（500）、`SyntaxError`（400）

所有 API 响应遵循统一信封格式：

```ts
// 成功
{ success: true, data: T }

// 失败
{ success: false, error: { code: string, message: string, details?: unknown } }
```

### 6. 与 Core 的关系

目标关系已实现：

```text
Engine -> Core
```

Engine 当前已完成：

- 通过 `ConfigLoader.parse` 构造 `KalConfig`
- 通过 `FlowLoader` 加载 `FlowDefinition`
- 通过 `loadInitialState` 初始化 State
- 通过 `CustomNodeLoader.loadFromProject` 注册自定义 Node
- 通过 `createKalCore` 创建 Core 实例并调用 `executeFlow`
- 通过 `runSession` 驱动 Session 层多轮交互

### 7. 与 Editor 的关系

```text
Editor -> Engine -> Core
```

已完成：

- Editor 已通过 Engine HTTP API 工作，不再直接读写本地文件
- Editor 定位为 Flow / Session 的可视化审查工具，用于查看 agent 生成的逻辑是否合理
- 支持连接 Engine、查看/编辑 Flow、查看/编辑 Session、单次调试执行

### 7.1 与 Studio 的演进关系

- Phase 1 中，Flow / Session editor 建议先作为 Studio Kernel 的内置 view 演进，而不是立刻做成插件壳
- 官方能力如 `problems`、`prompt-preview`、`debugger`、`h5-preview`、`terminal`、`vercel-deploy` 更适合通过一方扩展先行 dogfood
- 这意味着 Engine 需要从“CRUD + run SSE”继续演进为一层更完整的 Studio platform services
- Query / Command / Event Stream 三通道会比单纯 REST 更适合承接后续的 diagnostics、trace、process、deploy 等能力

## 当前未完成能力

以下能力尚未实现：

- 热重载（文件监听自动 reload，当前只有手动 `POST /api/project/reload`）
- 低层 Flow/Node 执行 trace 流（当前 SSE 只提供 run 级别更新，不暴露逐节点 trace）
- LLM trace 接通（hooks 基础设施已就绪，`registerLLMTraceHooks` 已写好但尚未接入 debug 命令输出）
- Diagnostics 查询服务 / 增量 lint 推送
- Prompt preview API
- Process / terminal service
- Deploy / package progress service
- Studio extension workspace host 与 capability gate
- 日志文件输出（当前日志仅 console 输出）
- Telemetry 查询服务（Core 的 Telemetry 在内存中，未通过 API 暴露）
- 生产环境 CORS 配置（当前为 `*`）
- 认证与鉴权

## 当前最准确的定位

当前 Engine 已经是一个功能较完整的模块：

- 项目加载、CLI、HTTP API、TUI 四条链路均已打通
- Editor 已通过 Engine API 工作，完成了从本地模式到服务模式的切换
- `kal play` 提供基于 Session 的交互式终端运行体验
- `kal debug` 提供可恢复、结构化输出的 CLI 调试入口，支持 agent 友好的 `--format agent` 输出
- `kal lint` 提供项目级静态分析（session 校验、unused flow、state key 检查、deep node validation）
- `kal smoke` 提供最小自动化 smoke test
- `kal eval` 提供 prompt 评估工具链
- `kal init` 提供项目脚手架
- `kal schema` 导出 node 和 session schema 供 agent 消费
- `kal config` 提供配置管理（含 API 密钥加密存储）
- `kal studio` 提供集成 Editor 的一体化服务
- 测试已覆盖 runtime、server、CLI 的核心路径

下一步重点是：

- 接通 LLM trace（hooks 基础设施已就绪，需要接入 debug 命令输出）
- 补齐更细粒度的执行 trace / diagnostics 查询能力
- 补齐 Prompt Preview、Problems、Debugger 等 Studio 官方能力所需的平台接口
- 补齐 process / deploy / package progress 等长任务服务
- 热重载能力
- 围绕 managed run runtime 继续压平前端接入复杂度
- 为未来的一方扩展宿主预留 capability-based 服务边界
