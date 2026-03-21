<div align="center">

<img src="assets/kal-logo.png" alt="KAL Logo" width="400">

# KAL — Kal AI Layer

**面向 AI 原生游戏与交互应用的 Flow 引擎**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

*用 JSON 定义游戏逻辑，引擎负责剩下的一切。*

[快速开始](#快速开始) · [工作原理](#工作原理) · [CLI 工具](#cli-工具) · [示例](#示例) · [文档](#文档)

**[English](./README.md)**

</div>

---

## KAL 是什么？

KAL 是一个 Flow 引擎，让你通过编写 JSON 而非代码来构建 AI 驱动的游戏和交互应用。你声明**做什么**——状态变更、LLM 调用、分支逻辑——引擎负责**怎么跑**。

三层架构，各司其职：

```
Session    "玩家什么时候交互？"     多轮对话的状态机
   ↓
Flow       "每一轮发生什么？"       JSON 描述的 DAG 工作流
   ↓
Node       "每一步怎么执行？"       可组合的执行单元：状态读写、LLM、数据变换
```

开箱即用：运行时、CLI 工具链（12 个命令、71+ 子命令）、Studio 可视化工作台、HTTP API 和示例游戏。

## 工作原理

一个 KAL 项目由三个 JSON 文件 + 可选的 `node/` 目录组成：

```
my-game/
├── initial_state.json     # 状态声明（所有 key 必须预声明）
├── session.json           # Session 状态机（玩家旅程）
├── kal_config.json        # 引擎 + LLM 配置
├── flow/                  # Flow DAG 定义
│   ├── main.json
│   ├── narrate.json
│   └── ...
└── node/                  # 自定义节点（可选，TypeScript）
```

**State** — 带类型和约束的扁平键值存储：
```json
{
  "playerName": { "type": "string", "value": "" },
  "health":     { "type": "number", "value": 100, "min": 0, "max": 200 },
  "inventory":  { "type": "array",  "value": ["sword"] }
}
```

**Flow** — 节点连线组成的 DAG。每个 flow 有 `meta`（输入/输出）和 `data`（节点 + 边）：
```
SignalIn → PromptBuild → Message → GenerateText → JSONParse → WriteState → SignalOut
```

**Session** — 用 6 种 step 类型驱动多轮交互的状态机：
`RunFlow` · `Prompt` · `Choice` · `DynamicChoice` · `Branch` · `End`

```
intro(RunFlow) → turn(Prompt) → check(Branch) → turn | death(End) | victory(End)
```

## 架构

```
┌──────────────────────────────────────────────────────────────┐
│                        KAL 架构                                │
├──────────────────────────────────────────────────────────────┤
│  apps/                                                        │
│  ├── engine/          CLI + HTTP API + TUI 宿主               │
│  └── studio/          可视化 Studio 工作台                    │
├──────────────────────────────────────────────────────────────┤
│  packages/                                                    │
│  ├── core/            Flow 运行时 + Session 管理 + 节点系统   │
│  └── create-kal-game/ 项目脚手架 (kal init)                   │
├──────────────────────────────────────────────────────────────┤
│  examples/                                                    │
│  ├── dnd-adventure/        DND 文字冒险 (9 个 flow)           │
│  ├── showcase-signal-watch/ 风暴信标值守 (3 个 flow)          │
│  └── castaway/             荒岛求生 (7 个 flow)               │
└──────────────────────────────────────────────────────────────┘
```

## 核心特性

### 17 个内置节点

| 分类 | 节点 | 用途 |
|------|------|------|
| **Signal** | SignalIn, SignalOut, Timer | I/O 通道和事件处理 |
| **State** | ReadState, WriteState | 状态读写 |
| **LLM** | PromptBuild, Message, GenerateText, GenerateImage, UpdateHistory, CompactHistory | AI 模型调用和提示工程 |
| **Transform** | Regex, JSONParse, PostProcess, SubFlow | 数据处理和流程组合 |
| **Utility** | Constant, ComputeState | 静态值和计算状态 |

### Flow JSON 运行时
- **声明式配置** — `meta + data` 结构，支持输入输出契约
- **可视化编排** — DAG 工作流，支持条件分支
- **SubFlow 复用** — 把复杂逻辑拆成可复用子流程

### Session 交互层
- **多轮对话** — 6 种 step 类型覆盖所有交互模式
- **状态持久化** — 自动保存和恢复游戏进度
- **多种接入** — CLI、TUI、HTTP API、Studio

### 可扩展性
- **自定义节点** — `node/` 目录下的 TypeScript 节点，引擎自动发现
- **任意 LLM** — OpenAI、DeepSeek、Ollama 或任何 OpenAI 兼容 API

## 快速开始

### 环境要求
- Node.js >= 18
- pnpm（推荐）或 npm

### 一键安装
```bash
# 1. 克隆
git clone https://github.com/Feed-Scription/kal.git
cd kal

# 2. 安装并链接 kal 命令
pnpm run setup

# 3. 配置（支持任意 OpenAI 兼容的提供商）
kal config init

# 4. 开始游戏
kal play examples/dnd-adventure
```

### 手动安装
```bash
# 1. 克隆
git clone https://github.com/Feed-Scription/kal.git
cd kal

# 2. 安装依赖（会自动构建 engine/core/studio）
pnpm install

# 3. 全局链接 kal 命令
pnpm run link:global

# 4. 配置 API 密钥
kal config init          # 交互式
# 或者直接设置：
kal config set-key openai sk-your-api-key
```

### 配置管理

```bash
# 查看所有配置
kal config list

# 设置 API 密钥
kal config set-key openai sk-xxx
kal config set-key deepseek sk-xxx

# 设置自定义 API 端点
kal config set openai.baseUrl https://api.deepseek.com/v1

# 查看 / 删除配置
kal config get openai.apiKey
kal config remove openai.apiKey
```

## CLI 工具

KAL 提供 12 个命令，覆盖完整开发生命周期：

```
kal init  →  kal lint  →  kal play / debug  →  kal studio  →  kal serve
  创建         校验         测试与调试          可视化编辑       部署运行
```

### 项目管理

| 命令 | 描述 |
|------|------|
| `kal init <name>` | 创建新项目（`--template minimal\|game`） |
| `kal config` | 管理用户配置（`init`、`set`、`get`、`list`、`remove`、`set-key`） |

### 开发与测试

| 命令 | 描述 |
|------|------|
| `kal lint [path]` | 静态分析 — session 校验、未使用 flow、state 引用、节点配置 |
| `kal smoke [path]` | 自动化冒烟测试（`--steps N`、`--input`、`--dry-run`） |
| `kal eval` | Prompt A/B 测试（`nodes`、`render`、`run`、`compare`） |
| `kal schema` | 查看节点类型和 session step schema |

### 运行与调试

| 命令 | 描述 |
|------|------|
| `kal play [path]` | 交互式 TUI 玩家（`--lang en\|zh-CN`） |
| `kal debug` | 逐步调试，支持状态检查（`start`、`step`、`continue`、`state`、`diff`、`retry`、`skip`） |

### 服务与编辑

| 命令 | 描述 |
|------|------|
| `kal serve [path]` | HTTP API 服务（`--host`、`--port`） |
| `kal studio [path]` | Studio 工作台 — 可视化 flow 编辑器、session 编辑器、状态检查器、调试界面 |

### 数据操作

| 命令 | 描述 |
|------|------|
| `kal flow` | Flow、节点、边、prompt fragment 的增删改查 |
| `kal session` | Session 定义和 step 的增删改查 |

所有命令支持 `--format json` 输出结构化数据。完整命令参考见 [CLI Reference](./docs/reference/cli.md)。

## 示例

### DND 冒险游戏
完整的单人 DND 风格文字冒险 — 9 个 flow、2 个自定义节点：

```bash
kal play examples/dnd-adventure
```

- 动态角色创建，支持预设职业
- AI 驱动叙事，prompt 缓存优化（静态/动态分离）
- 回合制战斗、物品管理、多结局分支

<details>
<summary>游戏演示</summary>

**角色创建：**
```
欢迎来到 DND 冒险世界！

请创建你的角色：
姓名: 艾莉亚
职业: [1] 战士 [2] 法师 [3] 盗贼
选择: 1

战士艾莉亚已创建！
属性分配 (总计20点)：
力量: 8, 敏捷: 6, 智力: 3, 体力: 3
生命值: 30/30
```

**AI 叙事：**
```
你走进了一座古老的地下城...

昏暗的走廊中传来奇怪的声音，石壁上刻着古老的符文。
突然，一只哥布林从阴影中跳出来！

你想要做什么？
[1] 攻击哥布林
[2] 尝试交流
[3] 寻找其他路径
```

**战斗：**
```
战斗开始！

艾莉亚 (HP: 30/30) vs 哥布林 (HP: 15/15)

你的回合：
[1] 普通攻击 [2] 技能攻击 [3] 防御

> 选择攻击...
投掷结果: 15 (成功！)
你对哥布林造成了 8 点伤害！
```

</details>

### 风暴信标值守
15 分钟可完整体验的生存 Showcase — 在 4 个风暴夜管理燃料、塔体完整度和船员士气：

```bash
kal play examples/showcase-signal-watch
```

### 荒岛求生
资源管理与分支叙事的生存游戏：

```bash
kal play examples/castaway
```

## HTTP API

```bash
kal serve examples/dnd-adventure
```

| 方法 | 端点 | 描述 |
|------|------|------|
| `GET` | `/api/project` | 项目快照 |
| `GET` | `/api/flows` | 列出 Flow |
| `GET` | `/api/session` | Session 定义 |
| `GET` | `/api/state` | 当前状态快照 |
| `GET` | `/api/diagnostics` | Lint / 诊断结果 |
| `POST` | `/api/executions` | 执行一次 Flow |
| `POST` | `/api/runs` | 创建 managed run |
| `POST` | `/api/runs/:id/advance` | 推进 managed run |
| `GET` | `/api/runs/:id/state` | 查看 run 状态 |
| `GET` | `/api/runs/:id/stream` | 订阅 run 事件（SSE） |

完整端点列表（55+ 端点）见 [server.ts](./apps/engine/src/server.ts)。

## 开发

```bash
# 运行测试
pnpm --filter @kal-ai/core test
pnpm --filter @kal-ai/engine test

# 构建
pnpm --filter @kal-ai/core build
pnpm --filter @kal-ai/engine build
pnpm --filter studio build
```

### 自定义节点

在项目的 `node/` 目录下创建自定义业务节点：

```typescript
// node/ability-check.ts
export default {
  type: 'AbilityCheck',
  execute: async (input, context) => {
    const { ability, difficulty } = input;
    const stats = context.state.player.stats;
    const roll = Math.floor(Math.random() * 20) + 1;
    const total = roll + stats[ability];
    return { roll, total, success: total >= difficulty };
  }
};
```

节点自动发现 — 在 `node/` 下放一个 `.ts` 文件，引擎自动加载。

## 文档

| 文档 | 描述 |
|------|------|
| [快速上手](./docs/getting-started.md) | 从零开始的入门指南 |
| [核心概念](./docs/concepts.md) | Node、Flow、State、Session |
| [项目结构](./docs/project-structure.md) | 逐文件说明 |
| [CLI 参考](./docs/reference/cli.md) | 完整命令参考 |
| [节点参考](./docs/reference/nodes.md) | 内置节点 schema |
| [Session Steps](./docs/reference/session-steps.md) | Session step 类型 |
| [配置参考](./docs/reference/config.md) | 配置选项 |
| [自定义节点指南](./docs/guides/custom-nodes.md) | 编写自定义节点 |
| [设计模式](./docs/guides/design-patterns.md) | 常见 flow 模式 |
| [问题排查](./docs/guides/troubleshooting.md) | 常见问题和解决方案 |
| [Extension API](./docs/extension-api.md) | 编程接口 |
| [Extension Guide](./docs/extension-guide.md) | 构建扩展 |

## 项目状态

**当前版本**：v0.1.0（早期开发中）

KAL 处于早期阶段，核心运行时可用，但 API 和配置格式可能会变化。

**已实现：**
- 核心 Flow 运行时（DAG 执行、条件分支、SubFlow）
- Session 交互层（多轮对话、状态持久化）
- 17 个内置节点（Signal、State、LLM、Transform、Utility）
- CLI 工具链（12 个命令、71+ 子命令、结构化 JSON 输出）
- Studio 工作台（flow 编辑器、session 编辑器、状态检查器、调试界面、包管理）
- HTTP API（55+ 端点、SSE 流、基于 capability 的访问控制）
- 3 个示例游戏（dnd-adventure、showcase-signal-watch、castaway）

**进行中：**
- 文档完善
- 测试覆盖提升
- 上手体验优化

## FAQ

<details>
<summary><strong>KAL 和其他游戏引擎有什么区别？</strong></summary>

KAL 专注于 AI 原生游戏开发：

- **数据驱动** — 游戏逻辑在 JSON 中，不在代码里。无需重新编译。
- **AI 优先** — 内置 LLM 节点，支持提示工程、历史管理和缓存
- **状态驱动** — 专为多轮对话和带类型的状态管理优化
- **轻量级** — 专注文字游戏和交互叙事，不含图形渲染

</details>

<details>
<summary><strong>支持哪些 LLM 服务？</strong></summary>

KAL 支持所有 OpenAI 兼容的 API：

- **云服务** — OpenAI、DeepSeek、Azure OpenAI、Anthropic Claude、Google Gemini（通过适配器）
- **本地模型** — Ollama、LocalAI、vLLM
- **自定义** — 任何实现 OpenAI chat completions 格式的服务

</details>

<details>
<summary><strong>如何处理 LLM 的不确定性？</strong></summary>

KAL 通过多层机制确保游戏逻辑的可控性：

- **规则层分离** — 关键游戏逻辑用确定性节点处理（Branch、WriteState、ComputeState）
- **输出约束** — LLM 节点支持 JSON 输出解析和验证
- **回退机制** — AI 生成失败时的默认处理
- **状态检查** — 带类型和 min/max 约束的状态确保一致性

</details>

<details>
<summary><strong>可以用于商业项目吗？</strong></summary>

可以。KAL 采用 Apache 2.0 许可证，允许商业使用、修改和分发。需要包含许可证声明并说明所做的修改。

</details>

## 贡献

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/amazing-feature`
3. 提交更改
4. 推送并创建 Pull Request

请遵循现有代码风格，为新功能添加测试，确保所有测试通过。

## 许可证

[Apache 2.0 License](LICENSE)

---

<div align="center">

**[Star](https://github.com/Feed-Scription/kal) · [文档](./docs/) · [问题反馈](https://github.com/Feed-Scription/kal/issues) · [讨论](https://github.com/Feed-Scription/kal/discussions)**

为 AI 原生游戏开发者而作

</div>
