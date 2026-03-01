# @kal-ai

KAL-AI 是面向 AI 驱动游戏开发的引擎，用 TypeScript 编写，作为 npm package 发布，仓库采用 pnpm monorepo 管理。

# 核心概念

## Node

功能实现的最小单位，有明确定义的若干个输入输出参数。Node 通过Handler连接，形成数据流。
支持玩家自定义Node。

Node 按功能分为以下几类：

### 信号类

信号类节点作为 flow 的起点和终点，具有完全对应的输入和输出参数。

- SignalIn: 没有输入连接时，作为事件输入口对接引擎层；有输入连接时，仅作为数据验证。
- SignalOut: 没有输出连接时，作为事件输出口对接引擎层；有输出连接时，仅作为数据验证。
- Timer: 特殊的信号输入，计时器触发，支持延迟或间隔触发

### State 管理类

- AddState: 添加状态
- RemoveState: 删除状态
- ReadState: 读取状态
- ModifyState: 修改状态

### 文本类

- UseTemplate: 使用文本模板
- Prompt: 组装 Prompt，将数据组装为 ChatMessage[]
- GenerateText: 生成文本
- Regex: 正则匹配处理

### 图像类

- GenerateImage: 生成图像

### 数据处理类

- JSONParse: JSON 解析与修复，处理截断、注释、尾逗号等问题


## Flow

由 node 组成的工作流（DAG）。使用 JSON 文件读取和保存。

- 起点是 SignalIn node，终点是 SignalOut node，允许有多个起点和终点。
- Flow 允许嵌套（子 flow），但不允许相互嵌套（无循环引用）。

JSON 格式：
```json
{
    "nodes": [
        {}
    ],
    "edges": [
        {
            "source": "nodeId",
            "sourceHandler": "outputHandlerName",
            "target": "nodeId",
            "targetHandler": "inputHandlerName"
        }
    ]
}
```
nodes 中的元素可以是 node 或嵌套的 flow。

## State

游戏状态管理。State 是全局共享的键值存储，flow 中的节点通过 State 管理类节点进行读写。

# 项目结构

一个 KAL 项目的组织结构如下：
```
README.md
kal_config.json    # KAL 引擎设置
initial_state.json # 游戏初始状态
flow/              # 工作流
    ***.json
node/              # 自定义节点
    ***.ts
```

# 仓库结构

```
packages/
    core/        # KAL 核心，定义 node、flow、state 等接口及实现
    simulator/   # 模拟玩家 agent，自动化测试循环
    recorder/    # 录制游戏会话（状态快照 + 事件流）
    replayer/    # 回放录制的会话，支持断点
    inspector/   # 质量断言引擎，检查 AI 输出
    ab-test/     # A/B Prompt 和 A/B Model 对比测试
apps/
    engine/      # KAL 引擎，命令行执行入口，可一行指令运行 KAL 项目
    editor-ui/   # 可视化编辑器，编辑 KAL 项目的 flow 和 state
    devkit/      # AI 游戏开发者工具链，整合 runner、simulator、recorder、replayer、inspector、ab-test 等能力
```
