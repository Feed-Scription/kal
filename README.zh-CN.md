<div align="center">

<img src="assets/kal-logo.png" alt="KAL Logo" width="400">

# KAL — Kal AI Layer

**面向 AI 原生游戏与交互应用的 Flow 引擎**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

*让 AI 驱动的游戏开发变得简单可控*

[快速开始](#快速开始) · [示例](#示例) · [文档](#文档) · [路线图](#路线图)

**[English](./README.md)**

</div>

---

## KAL 是什么？

KAL（Kal AI Layer）是一个专为 AI 原生游戏设计的 Flow 引擎，通过三层架构让复杂的 AI 交互变得简单可控：

- **Flow 层** — 用 JSON 描述 DAG 工作流，负责具体编排
- **Session 层** — 用轻量状态机驱动多轮交互节奏
- **Node 层** — 把状态读写、LLM 调用、子流程复用和业务规则封装成可组合节点

开箱即用：包含运行时、Engine 宿主、可视化 Editor 和示例游戏。

## 适用场景

| 类型 | 描述 | 示例 |
|------|------|------|
| **回合制文字游戏** | 基于规则的游戏逻辑 + AI 叙事 | DND 冒险、文字 RPG |
| **AI 互动叙事** | 动态故事生成与分支选择 | 互动小说、剧情游戏 |
| **状态驱动原型** | 复杂状态管理的应用 | 角色养成、模拟经营 |
| **混合编排应用** | 规则逻辑与 LLM 的深度结合 | 智能助手、教育游戏 |

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                        KAL 架构                              │
├─────────────────────────────────────────────────────────────┤
│  apps/                                                      │
│  ├── engine/     CLI + HTTP API + TUI 宿主                  │
│  └── editor/     可视化编辑器                               │
├─────────────────────────────────────────────────────────────┤
│  packages/                                                  │
│  └── core/       Flow 运行时 + Session 管理 + Node 系统     │
├─────────────────────────────────────────────────────────────┤
│  examples/                                                  │
│  └── dnd-adventure/  完整的 DND 冒险游戏示例                │
└─────────────────────────────────────────────────────────────┘
```

## 核心特性

### Flow JSON 运行时
- **声明式配置** — `meta + data` 结构，支持输入输出契约
- **可视化编排** — DAG 工作流，支持条件分支和循环
- **SubFlow 复用** — 把复杂逻辑拆成可复用子流程

### 内置节点系统
- **State 节点** — 状态读写和数据转换
- **LLM 节点** — AI 模型调用和提示工程
- **Signal 节点** — 用户交互和事件处理
- **Transform 节点** — 数据处理和格式转换

### Session 交互层
- **多轮对话** — `RunFlow / Prompt / Choice / Branch / End`
- **状态管理** — 自动保存和恢复游戏进度
- **多种接入** — CLI、TUI、HTTP API

### 开发者友好
- **自定义节点** — 在 `node/` 目录扩展业务规则
- **Node manifest** — Engine 导出节点清单，Editor 直接消费
- **热重载** — 开发时实时预览和调试

## 快速开始

### 环境要求
- Node.js >= 18
- pnpm（推荐）或 npm

### 一键安装
```bash
# 1. 克隆
git clone https://github.com/Feed-Scription/kal.git
cd kal

# 2. 安装
./scripts/install.sh

# 3. 配置
kal config init
# 会询问 API 密钥，支持任意 OpenAI 兼容的提供商

# 4. 开始游戏
kal play examples/dnd-adventure
```

### 手动安装
```bash
# 1. 克隆
git clone https://github.com/Feed-Scription/kal.git
cd kal

# 2. 安装依赖并构建
pnpm install
pnpm --filter @kal-ai/engine build

# 3. 全局链接 kal 命令
cd apps/engine && pnpm link --global && cd ../..

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
kal config set openai.apiKey sk-xxx...
kal config set deepseek.apiKey sk-xxx...

# 设置 API 端点
kal config set openai.baseUrl https://api.deepseek.com/v1

# 查看 / 删除配置
kal config get openai.apiKey
kal config remove openai.apiKey
```

### 启动编辑器

```bash
# 方式 A：Studio 模式（一条命令启动 engine + editor）
kal studio examples/dnd-adventure

# 方式 B：分别启动
kal serve examples/dnd-adventure
cd apps/editor && pnpm dev
```

## 示例

### DND 冒险游戏
完整的单人 DND 风格冒险游戏，展示 KAL 的核心能力：

```bash
kal play examples/dnd-adventure
```

- 动态角色创建和属性分配
- AI 驱动的剧情生成和 NPC 对话
- 回合制战斗系统
- 物品收集和背包管理
- 多结局分支故事线

完整源码见 [examples/dnd-adventure](./examples/dnd-adventure)。

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

## 开发

```bash
# 运行测试
pnpm --filter @kal-ai/core test
pnpm --filter @kal-ai/engine test

# 构建
pnpm --filter @kal-ai/core build
pnpm --filter @kal-ai/engine build
pnpm --filter editor build
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

### HTTP API

```bash
kal serve examples/dnd-adventure

# 端点
POST /api/session/start    # 开始新会话
POST /api/session/input    # 发送用户输入
GET  /api/session/state    # 获取当前状态
```

## 文档

| 文档 | 描述 |
|------|------|
| [快速上手](./docs/getting-started.md) | 从零开始的入门指南 |
| [核心概念](./docs/concepts.md) | Node、Flow、State、Session |
| [项目结构](./docs/project-structure.md) | 逐文件说明 |
| [参考文档](./docs/reference/) | API 参考 |
| [路线图](./docs/roadmap.md) | 项目路线图和 TODO |

## 项目状态

**当前版本**：v0.1.0（早期开发中）

KAL 处于早期阶段，核心运行时可用，但 API 和配置格式可能会变化。

**已实现：**
- 核心 Flow 运行时（DAG 执行、条件分支、SubFlow）
- Session 交互层（多轮对话、状态持久化）
- 20 个内置节点（State、LLM、Signal、Transform、Utility）
- CLI 工具（play、serve、debug、lint、smoke、eval、studio）
- 可视化 Editor（Flow 图查看）
- 2 个示例游戏（dnd-adventure、guess-who）

**进行中：**
- 文档完善
- 测试覆盖提升
- 上手体验优化

## 路线图

详细路线图见 [docs/roadmap.md](./docs/roadmap.md)。

当前聚焦 Phase 0（地基）：修复已知问题、改善上手体验、补齐测试和文档。

下一个关键里程碑是 Phase 1：用 KAL 做一个真正让人想玩的 Showcase 游戏。

## FAQ

<details>
<summary><strong>KAL 和其他游戏引擎有什么区别？</strong></summary>

KAL 专注于 AI 原生游戏开发：

- **AI 优先设计** — 内置 LLM 调用和提示工程
- **声明式流程** — 用 JSON 描述游戏逻辑，而非代码
- **状态驱动** — 专为多轮对话和状态管理优化
- **轻量级** — 专注文字游戏和交互叙事，不含图形渲染

</details>

<details>
<summary><strong>支持哪些 LLM 服务？</strong></summary>

KAL 支持所有 OpenAI 兼容的 API：

- **官方服务** — OpenAI GPT-3.5/4、Azure OpenAI
- **本地模型** — 通过 Ollama、LocalAI、vLLM
- **云服务** — Anthropic Claude、Google Gemini（通过适配器）
- **自定义** — 任何实现 OpenAI API 格式的服务

</details>

<details>
<summary><strong>如何处理 LLM 的不确定性？</strong></summary>

KAL 通过多层机制确保游戏逻辑的可控性：

- **规则层分离** — 关键游戏逻辑用确定性节点处理
- **输出约束** — LLM 节点支持格式化输出和验证
- **回退机制** — AI 生成失败时的默认处理
- **状态检查** — 确保游戏状态的一致性

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
