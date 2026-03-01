# KAL-AI V4 设计文档

KAL-AI 是面向 AI 驱动游戏开发的引擎，用 TypeScript 编写，作为 npm package 发布。

## 文档导航

- **[core.md](./core.md)** - Core 模块详细设计（Node、Flow、State、LLM 基础设施）
- **[evolution.md](./evolution.md)** - 设计演进历程（V1 → V2 → V3 → V4）和适用场景

## 核心概念速览

Core 模块是 KAL 引擎的运行时核心，可以理解为四层协作：

1. **Node（能力层）**：最小执行单元，通过输入/输出 Port 暴露能力
2. **Flow（编排层）**：由 Node 和 Edge 组成的 DAG 工作流，定义执行顺序与数据流动
3. **State（状态层）**：全局共享的键值存储，为 Node/Flow 提供持续的数据上下文
4. **LLM 基础设施（保障层）**：重试、缓存、JSON 修复、Telemetry，默认内置自动生效

### Node（节点）

功能实现的最小单位，通过 Port（输入/输出端口）连接形成数据流。

内置节点类型：
- **信号类**：SignalIn、SignalOut、Timer
- **State 管理类**：AddState、RemoveState、ReadState、ModifyState
- **Prompt 构建类**：PromptBuild（支持 base/field/when/randomSlot/budget 片段）
- **消息组装类**：Message
- **文本类**：GenerateText、Regex
- **图像类**：GenerateImage
- **数据处理类**：JSONParse、PostProcess

支持用户自定义 Node（TypeScript 文件，引擎自动加载）。

### Flow（工作流）

由 Node 组成的有向无环图（DAG），使用 JSON 文件存储。采用事件驱动/响应式执行模型：
- SignalIn 触发 → 数据在节点间传播 → 节点输入就绪时自动执行 → SignalOut 输出
- 无依赖关系的节点并行执行
- 支持子 Flow 嵌套（禁止循环引用）

### State（状态管理）

全局共享的键值存储，用于保存和读取游戏状态。每个 key 有明确的 type 声明（string/number/boolean/object/array），运行时做类型检查。

### LLM 基础设施（透明自动生效）

- **重试机制**：LLM API 失败时自动重试（指数退避 + 随机抖动）
- **缓存机制**：避免重复调用相同请求（内存缓存 L1）
- **JSON 修复**：自动修复 LLM 输出的 JSON 格式问题
- **Telemetry**：自动记录每次 LLM 调用的详细信息（token 用量、耗时、缓存命中）

## 项目结构

一个 KAL 项目的组织结构：

```
my-game/
├── kal_config.json      # 引擎配置（LLM 模型、重试、缓存等）
├── initial_state.json   # 游戏初始状态
├── flow/                # 工作流定义（JSON 文件）
│   ├── main.json
│   └── npc-dialogue.json
└── node/                # 自定义节点（TypeScript 文件）
    └── MyCustomNode.ts
```

## 快速开始

### 最小示例

一个最简单的 Flow（玩家输入 → LLM 生成回复）：

```json
{
  "nodes": [
    {
      "id": "input",
      "type": "SignalIn",
      "outputs": [{ "name": "text", "type": "string" }]
    },
    {
      "id": "message",
      "type": "Message",
      "inputs": [
        { "name": "system", "type": "string", "defaultValue": "你是一个友好的 AI 助手" },
        { "name": "user", "type": "string" }
      ],
      "outputs": [{ "name": "messages", "type": "ChatMessage[]" }]
    },
    {
      "id": "llm",
      "type": "GenerateText",
      "config": { "model": "gpt-4", "temperature": 0.7 },
      "inputs": [{ "name": "messages", "type": "ChatMessage[]" }],
      "outputs": [{ "name": "text", "type": "string" }]
    },
    {
      "id": "output",
      "type": "SignalOut",
      "inputs": [{ "name": "text", "type": "string" }]
    }
  ],
  "edges": [
    { "source": "input", "sourceHandle": "text", "target": "message", "targetHandle": "user" },
    { "source": "message", "sourceHandle": "messages", "target": "llm", "targetHandle": "messages" },
    { "source": "llm", "sourceHandle": "text", "target": "output", "targetHandle": "text" }
  ]
}
```

### 运行项目

```bash
# 初始化项目
kal init my-game

# 运行项目
kal run my-game

# 启动 HTTP 服务（供上层工具调用）
kal serve my-game --port 3000
```

## 设计原则

1. **节点即能力**：所有功能通过 Node 暴露，上层可编程调用也可接入可视化工具
2. **基础设施透明**：重试、缓存、JSON 修复、Telemetry 自动生效，用户无需手动连线
3. **配置分层**：全局配置（kal_config.json）→ 节点级覆盖（node config），简单场景零配置，复杂场景可精细控制
4. **纯数据变换**：Prompt 模块不直接读 State，数据通过连线传入，保证可测试性
5. **渐进式复杂度**：MVP 只需 SignalIn → GenerateText → SignalOut 三个节点即可运行，高级能力按需启用
6. **可扩展**：自定义 Node 通过 NodeContext 访问引擎全部能力，Hook 系统支持行为扩展
7. **JSON-first**：Node/Flow/State 与节点注册信息优先采用 JSON 契约，保证 Web UI 可解析、可渲染、可迁移

## 与其他工具的关系

- **Core**（本文档）：运行时引擎，定义 Node/Flow/State 的接口和实现
- **Engine**：命令行工具（`kal run`/`kal serve`），加载项目并执行 Flow
- **Editor-UI**：可视化编辑器（Web 应用），通过 Engine 的 HTTP API 编辑 Flow 和 State
- **DevKit**：开发者工具链，整合 simulator、recorder、replayer、inspector、ab-test 等能力

## 后续扩展

当前版本（V4）聚焦核心能力，以下功能标注为后续版本：

- **Tools / Function Calling**：让 LLM 调用外部工具（MCP 协议）
- **Safety Filter**：内容安全过滤（敏感词、暴力、色情等）
- **L2/L3 缓存**：持久化缓存、语义缓存（embedding）
- **向量存储**：语义采样、语义去重
- **流式输出**：GenerateText 节点支持流式返回

## 参考资料

- [V3 设计文档](../docs_v3/core.md)
- [演进历程](./evolution.md)（V1 → V2 → V3 → V4 的变化）
