# Agent 友好的 Debug CLI 方案

**状态：Phase 1 已实现，Phase 2 持续迭代**
**最后更新：2026-03-12**

本文档记录 `kal debug` 的目标、接口和当前实现，用于补齐 Claude Code、Cursor、Codex、OpenHands 等编程 Agent 在使用 KAL 时的调试闭环。

本方案基于对主流 Agent 工作模式的深入调研，遵循 Agent-friendly CLI 设计最佳实践。

## 背景

### 当前问题

`kal play` 是为人类设计的交互式终端入口：

- 依赖 readline 循环和阻塞式输入
- 适合人在终端里试玩
- 不适合 Claude Code、Cursor、Codex 这类只能调用非交互式 CLI 的 Agent

这会导致一个关键缺口：

- Agent 可以生成或修改 `flow/*.json`、`session.json`、`node/*.ts`
- 但无法可靠地”跑起来并继续下一步输入”
- 一旦出错，当前错误信息通常只有一个错误名或一段 message
- Agent 难以根据错误定位到具体 step、flow、node 和下一步修复动作

### Agent 工作模式研究

对主流 Agent 的调研显示，所有工具都收敛到同一个模式：**observe-think-act 循环**

```
while (has_tool_calls):
    1. 读取上下文（文件、错误输出、测试结果）
    2. 推理下一步动作
    3. 执行工具（编辑文件、运行命令）
    4. 将结果反馈到上下文
    5. 重复
```

关键特征：
- **非交互式**：每次 CLI 调用都是独立的子进程，执行后退出
- **结构化输出**：Agent 解析 stdout 的 JSON，不能处理 TUI/readline
- **快速反馈**：Agent 依赖精确的错误信息快速定位问题
- **自动推进**：Agent 倾向于一次调用完成尽可能多的工作，减少 API roundtrip

因此需要一个新的、面向 Agent 的调试入口：`kal debug`。

## 目标

`kal debug` 要解决的不是“再做一个命令”，而是把 Session 运行能力抽成一个：

- 非交互式
- 可序列化
- 可恢复
- 结构化输出
- 对错误可诊断

的调试协议。

它应该满足以下目标：

1. Agent 可以通过多次 CLI 调用推进同一条 Session。
2. 每次调用都能在“下一个交互边界”停下，而不是阻塞等待 TUI 输入。
3. 返回结果默认是机器可读 JSON，而不是只适合人眼的文本。
4. 错误必须带具体上下文，包括 step、flow、node、文件位置和下一步建议。
5. `kal play` 和 `kal debug` 应共享同一套底层执行逻辑，避免行为分叉。

## 命令设计

### 核心命令

```bash
# 启动新调试会话
kal debug [project-path] --start [--force-new]

# 恢复已有会话并自动推进到下一个边界
kal debug [project-path] --continue [input] [--run-id <id>]

# 真正单步推进；执行一个边界后返回 paused / waiting_input / ended / error
kal debug [project-path] --step [input] [--run-id <id>]
```

### 查询命令

```bash
# 查看当前完整游戏状态
kal debug [project-path] --state [--run-id <id>]

# 列出当前项目下的调试会话
kal debug [project-path] --list

# 删除指定会话（必须显式给 run_id）
kal debug [project-path] --delete --run-id <id>
```

### 参数一览

| 参数 | 说明 |
|------|------|
| `project-path` | 项目路径，默认当前目录 |
| `--start` | 显式启动新调试会话 |
| `--force-new` | 当当前项目已有 active run 时，强制创建新会话 |
| `--run-id <id>` | 指定要恢复的调试会话；省略时自动使用活跃会话 |
| `--continue [input]` | 自动推进到下一个边界；可选附带输入 |
| `--step [input]` | 只推进一个边界；可选附带输入 |
| `--input <input>` | 显式传入输入值；与位置参数等价 |
| `--state` | 输出当前完整游戏状态 |
| `--list` | 列出当前项目下的调试会话 |
| `--delete --run-id <id>` | 删除指定会话 |
| `--format <json\|pretty>` | 输出格式，默认 `json` |
| `--state-dir <path>` | 覆盖默认的调试状态目录 |
| `--cleanup` | 结束后清理该次调试快照 |

### 默认交互模型

- `--start` 启动新会话，并以 `continue` 模式自动推进到第一个边界。
- `--continue` 会持续推进，直到出现以下任一状态后退出：
  - `waiting_input`
  - `ended`
  - `error`
- `--step` 只推进一个边界，可能返回：
  - `paused`
  - `waiting_input`
  - `ended`
  - `error`
- active run 以 `projectRoot` 为作用域；不同项目互不影响。
- 当前项目已经有 active run 时，`--start` 默认报错；只有显式传 `--force-new` 才会创建新 run。
- `--continue`、`--step`、`--state` 省略 `--run-id` 时，会自动使用当前项目的 active run。
- `--delete` 必须显式传 `--run-id`。
- `--list` 只返回当前项目的 run。
- 如果输出结果里包含 `run_id` 且状态为 `waiting_input`，下一次调用通常使用：

```bash
kal debug <project> --continue "<input>"
```

- 如果返回 `status: "paused"`，下一次调用通常使用：

```bash
kal debug <project> --continue
```

## 输出协议

### JSON 输出格式（默认）

默认 `stdout` 输出结构化 JSON，便于 Agent 直接解析。当前实现采用“双层协议”：

- `events.raw` / `diagnostics.details` / `diagnostics.context` 保留原始细节
- `observation` 提供面向 Agent 的语义层

Agent 优先读取：

- `status`
- `observation.blocking_reason`
- `observation.root_cause`
- `observation.location`
- `observation.state_delta`
- `observation.allowed_next_actions`
- `observation.suggested_next_action`

#### 成功推进（等待输入）

```json
{
  "run_id": "dbg_1710234567_a3f2c9",
  "status": "waiting_input",
  "waiting_for": {
    "kind": "choice",
    "step_id": "day-action",
    "prompt_text": "选择今天的行动",
    "options": [
      { "label": "探索校园", "value": "explore" },
      { "label": "查看手机", "value": "phone" },
      { "label": "结束一天", "value": "end_day" }
    ]
  },
  "events": [
    {
      "type": "output",
      "step_id": "day-start",
      "flow_id": "day-start",
      "raw": {
        "narration": "新的一天开始了。今天是第 1 天。"
      },
      "normalized": {
        "narration": "新的一天开始了。今天是第 1 天。",
        "state_changes": {
          "day": { "old": 0, "new": 1 },
          "ap": { "old": 0, "new": 3 }
        },
        "labels": ["narration"]
      }
    }
  ],
  "state_summary": {
    "total_keys": 4,
    "keys": ["ap", "day", "suspicion", "currentLocation"],
    "changed": ["ap", "day"],
    "changed_values": {
      "ap": { "old": 0, "new": 3 },
      "day": { "old": 0, "new": 1 }
    },
    "preview": {
      "ap": 3,
      "currentLocation": "school_gate",
      "day": 1,
      "suspicion": 0
    }
  },
  "diagnostics": [],
  "next_action": "kal debug examples/westbrook-high --continue <input>",
  "observation": {
    "summary": "Run is waiting for choice input at step \"day-action\".",
    "blocking_reason": "awaiting_input",
    "current_step": {
      "step_id": "day-action",
      "step_index": 3
    },
    "waiting_for": {
      "kind": "choice",
      "step_id": "day-action",
      "prompt_text": "选择今天的行动",
      "options": [
        { "label": "探索校园", "value": "explore" },
        { "label": "查看手机", "value": "phone" },
        { "label": "结束一天", "value": "end_day" }
      ]
    },
    "location": {
      "phase": "session",
      "step_id": "day-action",
      "file": "session.json",
      "json_path": "steps[id=day-action]"
    },
    "state_delta": {
      "changed_keys": ["ap", "day"],
      "changed_values": {
        "ap": { "old": 0, "new": 3 },
        "day": { "old": 0, "new": 1 }
      },
      "preview": {
        "ap": 3,
        "currentLocation": "school_gate",
        "day": 1,
        "suspicion": 0
      }
    },
    "allowed_next_actions": [
      {
        "kind": "provide_input",
        "command": "kal debug examples/westbrook-high --continue <input>",
        "description": "Provide the requested input and continue until the next boundary.",
        "input_required": true
      },
      {
        "kind": "step",
        "command": "kal debug examples/westbrook-high --step <input>",
        "description": "Provide the requested input and stop after exactly one step.",
        "input_required": true
      }
    ],
    "suggested_next_action": {
      "kind": "provide_input",
      "command": "kal debug examples/westbrook-high --continue <input>",
      "description": "Provide the requested input and continue until the next boundary.",
      "input_required": true
    }
  }
}
```

#### 单步暂停

```json
{
  "run_id": "dbg_1710234567_a3f2c9",
  "status": "paused",
  "waiting_for": null,
  "events": [],
  "state_summary": {
    "total_keys": 4,
    "keys": ["ap", "day", "suspicion", "currentLocation"],
    "changed": [],
    "changed_values": {},
    "preview": {
      "ap": 2,
      "currentLocation": "library",
      "day": 1,
      "suspicion": 0
    }
  },
  "diagnostics": [],
  "next_action": "kal debug examples/westbrook-high --continue",
  "observation": {
    "summary": "Run paused after one step. Next step is \"night-start\".",
    "blocking_reason": "paused_after_step",
    "current_step": {
      "step_id": "night-start",
      "step_index": 6
    },
    "waiting_for": null,
    "state_delta": {
      "changed_keys": [],
      "changed_values": {},
      "preview": {
        "ap": 2,
        "currentLocation": "library",
        "day": 1,
        "suspicion": 0
      }
    },
    "allowed_next_actions": [
      {
        "kind": "continue",
        "command": "kal debug examples/westbrook-high --continue",
        "description": "Continue running until the next input boundary or the end of the session.",
        "input_required": false
      },
      {
        "kind": "step",
        "command": "kal debug examples/westbrook-high --step",
        "description": "Advance exactly one step and pause again.",
        "input_required": false
      }
    ],
    "suggested_next_action": {
      "kind": "continue",
      "command": "kal debug examples/westbrook-high --continue",
      "description": "Continue running until the next input boundary or the end of the session.",
      "input_required": false
    }
  }
}
```

#### 成功结束

```json
{
  "run_id": "dbg_1710234567_a3f2c9",
  "status": "ended",
  "waiting_for": null,
  "events": [
    {
      "type": "end",
      "message": "游戏结束。你成功揭开了真相。"
    }
  ],
  "state_summary": {
    "total_keys": 4,
    "keys": ["ap", "day", "suspicion", "gameOver"],
    "changed": ["gameOver"],
    "changed_values": {
      "gameOver": { "old": false, "new": true }
    },
    "preview": {
      "ap": 0,
      "day": 5,
      "gameOver": true,
      "suspicion": 67
    }
  },
  "diagnostics": [],
  "next_action": "kal debug examples/westbrook-high --start --force-new",
  "observation": {
    "summary": "Run ended successfully.",
    "blocking_reason": "session_ended",
    "current_step": {
      "step_id": null,
      "step_index": 12
    },
    "waiting_for": null,
    "state_delta": {
      "changed_keys": ["gameOver"],
      "changed_values": {
        "gameOver": { "old": false, "new": true }
      },
      "preview": {
        "ap": 0,
        "day": 5,
        "gameOver": true,
        "suspicion": 67
      }
    },
    "allowed_next_actions": [
      {
        "kind": "start_new_run",
        "command": "kal debug examples/westbrook-high --start --force-new",
        "description": "Start a fresh debug run from the beginning.",
        "input_required": false
      }
    ],
    "suggested_next_action": {
      "kind": "start_new_run",
      "command": "kal debug examples/westbrook-high --start --force-new",
      "description": "Start a fresh debug run from the beginning.",
      "input_required": false
    }
  }
}
```

#### 错误输出

```json
{
  "run_id": "dbg_1710234567_a3f2c9",
  "status": "error",
  "waiting_for": null,
  "events": [],
  "state_summary": {
    "total_keys": 3,
    "keys": ["ap", "day", "suspicion"],
    "changed": [],
    "changed_values": {},
    "preview": {
      "ap": 3,
      "day": 1,
      "suspicion": 0
    }
  },
  "diagnostics": [
    {
      "code": "FLOW_EXECUTION_FAILED",
      "message": "Flow 'day-action' 执行失败: Node 'generate-text' (GenerateText) timeout after 30000ms",
      "phase": "flow",
      "stepId": "do-action",
      "flowId": "day-action",
      "nodeId": "generate-text",
      "nodeType": "GenerateText",
      "file": "examples/westbrook-high/flow/day-action.json",
      "jsonPath": "data.nodes[id=generate-text]",
      "location": {
        "phase": "node",
        "step_id": "do-action",
        "flow_id": "day-action",
        "node_id": "generate-text",
        "node_type": "GenerateText",
        "file": "examples/westbrook-high/flow/day-action.json",
        "json_path": "data.nodes[id=generate-text]"
      },
      "root_cause": {
        "code": "FLOW_EXECUTION_FAILED",
        "message": "Flow 'day-action' 执行失败: Node 'generate-text' (GenerateText) timeout after 30000ms",
        "error_type": "timeout"
      },
      "remediation": {
        "suggestions": [
          "检查报错节点的输入、配置和依赖节点输出",
          "必要时使用 --verbose 查看更多诊断上下文"
        ]
      },
      "context": {
        "input": "explore",
        "stateSnapshot": {
          "ap": { "type": "number", "value": 3 },
          "day": { "type": "number", "value": 1 }
        }
      },
      "evidence": {
        "input": "explore"
      },
      "suggestions": [
        "检查报错节点的输入、配置和依赖节点输出",
        "必要时使用 --verbose 查看更多诊断上下文"
      ]
    }
  ],
  "next_action": null,
  "observation": {
    "summary": "Run stopped at step \"do-action\" node \"generate-text\": Flow 'day-action' 执行失败: Node 'generate-text' (GenerateText) timeout after 30000ms",
    "blocking_reason": "runtime_error",
    "current_step": {
      "step_id": "do-action",
      "step_index": 4
    },
    "waiting_for": null,
    "location": {
      "phase": "node",
      "step_id": "do-action",
      "flow_id": "day-action",
      "node_id": "generate-text",
      "node_type": "GenerateText",
      "file": "examples/westbrook-high/flow/day-action.json",
      "json_path": "data.nodes[id=generate-text]"
    },
    "root_cause": {
      "code": "FLOW_EXECUTION_FAILED",
      "message": "Flow 'day-action' 执行失败: Node 'generate-text' (GenerateText) timeout after 30000ms",
      "error_type": "timeout"
    },
    "state_delta": {
      "changed_keys": [],
      "changed_values": {},
      "preview": {
        "ap": 3,
        "day": 1,
        "suspicion": 0
      }
    },
    "allowed_next_actions": [
      {
        "kind": "fix_files",
        "command": null,
        "description": "Inspect and fix the problem near examples/westbrook-high/flow/day-action.json (data.nodes[id=generate-text]).",
        "input_required": false
      },
      {
        "kind": "retry",
        "command": "kal debug examples/westbrook-high --start --force-new",
        "description": "After fixing the issue, start a fresh debug run.",
        "input_required": false
      }
    ],
    "suggested_next_action": {
      "kind": "fix_files",
      "command": null,
      "description": "Inspect and fix the problem near examples/westbrook-high/flow/day-action.json (data.nodes[id=generate-text]).",
      "input_required": false
    }
  }
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `run_id` | string \| null | 当前调试会话 ID；当错误发生在 run 创建前时为 `null` |
| `status` | enum | `waiting_input` / `paused` / `ended` / `error` |
| `waiting_for` | object \| null | 当前等待的交互信息；若非等待状态则为 `null` |
| `waiting_for.kind` | enum | `prompt` / `choice` |
| `waiting_for.step_id` | string | 当前步骤 ID |
| `waiting_for.prompt_text` | string | 提示文本 |
| `waiting_for.options` | array | Choice 步骤的选项列表 |
| `events` | array | 本次推进过程中产生的事件列表，包含 `raw + normalized` 两层 |
| `state_summary` | object | 轻量状态摘要 |
| `state_summary.total_keys` | number | 当前 state key 总数 |
| `state_summary.keys` | array | 当前所有 state keys |
| `state_summary.changed` | array | 本次推进中修改的 keys |
| `state_summary.changed_values` | object | 本次推进中 key 的 old/new 值 |
| `state_summary.preview` | object | 适合快速阅读的状态预览 |
| `diagnostics` | array | 诊断信息列表（错误时非空） |
| `diagnostics[].root_cause` | object | 结构化根因 |
| `diagnostics[].location` | object | 结构化定位信息 |
| `diagnostics[].remediation` | object | 修复建议 |
| `diagnostics[].evidence` | object | 结构化证据 |
| `next_action` | string \| null | 为兼容旧调用者保留的快捷命令字段 |
| `observation` | object | 面向 Agent 的 observation schema |
| `observation.blocking_reason` | enum | `awaiting_input` / `paused_after_step` / `session_ended` / `runtime_error` / `invalid_request` / `snapshot_invalid` / `missing_run` / `conflicting_run` |
| `observation.location` | object | 当前阻塞点的结构化位置 |
| `observation.root_cause` | object | 当前阻塞点的结构化根因 |
| `observation.state_delta` | object | 本次推进后的状态变化摘要 |
| `observation.allowed_next_actions` | array | 允许的下一步动作列表 |
| `observation.suggested_next_action` | object \| null | 推荐的下一步动作 |

### 运行时上下文增强

基于 Cursor Debug Mode 的启发，错误诊断中的 `context` 字段应包含运行时数据：

- `stateSnapshot`: 错误发生时的完整游戏状态
- `input`: 触发错误的用户输入
- `flowInputs`: Flow 的实际输入数据（如果是 flow 执行错误）
- `nodeInputs`: Node 的实际输入值（如果是 node 执行错误）
- `llmRequest`: LLM 调用的实际 prompt（如果是 LLM 节点错误）
- `llmResponse`: LLM 返回的原始响应（如果可用）

这些运行时数据让 Agent 能基于实际执行情况定位问题，而不是仅靠静态分析猜测。

### Pretty 输出格式

`--format pretty` 用于人类在终端查看，输出当前 observation 的文本摘要。当前实现是简洁纯文本，不依赖 ANSI 颜色：

```
Run: dbg_1710234567_a3f2c9
Status: waiting_input
Summary: Run is waiting for choice input at step "day-action".
Waiting: choice @ day-action
State Changed: ap, day
Events:
- output day-start
  新的一天开始了。今天是第 1 天。
Actions:
- provide_input: kal debug examples/westbrook-high --continue <input>
- step: kal debug examples/westbrook-high --step <input>
Next: kal debug examples/westbrook-high --continue <input>
```

默认行为仍应坚持 `json`，因为 Agent 应优先消费机器可读输出。

## 会话恢复模型

`kal debug` 采用”可恢复会话”模型，而不是长时间驻留的单进程交互模型。

原因：

- 更适合 Claude Code、Cursor、Codex 这类通过多次命令调用推进任务的 Agent
- 更容易接入脚本、测试和 CI
- 不依赖长连接或 TTY 保活
- 可以把每次交互都变成可审计的快照（类似 OpenHands 的 event sourcing 模型）

### 存储位置

调试快照默认保存在项目目录：

```text
/path/to/project/.kal/runs/
  active.json                          # { "activeByProject": { "/path/to/project": "dbg_xxx" } }
  dbg_1710234567_a3f2c9.json           # 快照文件
  dbg_1710234890_b7e1d4.json
```

这样 `kal debug` 与 `kal serve` 默认共享同一批 managed run 快照。支持通过 `--state-dir` 覆盖。

### Active Session 机制

为减少 Agent 的状态管理负担，引入按项目隔离的 active run 追踪：

- `--start` 创建新会话后，如果结果停在 `waiting_input` 或 `paused`，会自动设为当前项目的 active run
- `--continue` / `--step` / `--state` 不带 `--run-id` 时，自动使用当前项目的 active run
- 显式传 `--run-id` 时，可以查询或推进指定 run
- `--delete` 必须显式传 `--run-id`
- run 结束或出错后，会自动清理当前项目的 active 指向

这样 Agent 的典型调用链只需要：

```bash
kal debug examples/westbrook-high --start
kal debug examples/westbrook-high --continue explore
kal debug examples/westbrook-high --step
kal debug examples/westbrook-high --state
```

无需在每次调用间传递 `run_id`。

### 快照结构

每个快照文件包含：

```ts
interface DebugRunSnapshot {
  // 身份
  runId: string;
  projectRoot: string;
  sessionHash: string;          // session.json + flow/*.json + initial_state.json + node/*.ts/js 的内容 hash

  // 可恢复执行位置
  cursor: SessionCursor;
  waitingFor: WaitingFor | null;
  status: SessionAdvanceStatus;

  // 游戏状态
  stateSnapshot: Record<string, StateValue>;

  // 审计日志
  inputHistory: DebugInput[];     // 所有历史输入
  recentEvents: SessionTraceEvent[]; // 最近一次推进产生的事件

  // 元数据
  createdAt: number;
  updatedAt: number;
}

interface DebugInput {
  stepId: string;
  stepIndex: number;
  input: string | undefined;
  timestamp: number;
}

interface WaitingFor {
  kind: 'prompt' | 'choice';
  stepId: string;
  promptText?: string;
  options?: Array<{ label: string; value: string }>;
}

type SessionAdvanceStatus = 'waiting_input' | 'paused' | 'ended' | 'error';
```

### 恢复校验

恢复时必须校验：

- `run_id` 对应快照存在
- `projectRoot` 与当前命令一致
- `sessionHash` 未变化（session.json、flow、initial_state、自定义节点源文件被修改后，旧快照失效）

若项目已经变化，返回显式错误和建议：

```json
{
  "run_id": "dbg_1710234567_a3f2c9",
  "status": "error",
  "diagnostics": [{
    "code": "SESSION_HASH_MISMATCH",
    "message": "项目文件已修改，当前调试快照已失效",
    "phase": "cli",
    "suggestions": [
      "运行 kal debug examples/westbrook-high --start --force-new 创建新会话",
      "运行 kal debug examples/westbrook-high --delete --run-id dbg_1710234567_a3f2c9 清理旧会话"
    ]
  }],
  "observation": {
    "blocking_reason": "snapshot_invalid"
  }
}
```

### Session Hash 计算

`sessionHash` 基于以下文件内容的 SHA-256：

- `session.json`
- `flow/*.json`（按文件名排序）
- `initial_state.json`
- `node/*.ts` / `.tsx` / `.mts` / `.cts` / `.js` / `.mjs` / `.cjs`

不包含 `kal_config.json`。配置变更会影响运行环境，但不直接改变 session 语义；首版里先用更保守的“内容文件 + 自定义节点源码”失效策略。

## 执行器改造

当前实现已经把 Session 执行抽成共享的 cursor-based runner，并由 `kal play` 的 generator 层复用。

### 1. 已落地的共享 Runner

核心函数位于 `packages/core/src/session/session-runner.ts`：

```ts
type SessionAdvanceMode = 'continue' | 'step';
type SessionAdvanceStatus = 'waiting_input' | 'paused' | 'ended' | 'error';

interface SessionAdvanceResult {
  cursor: SessionCursor;
  events: SessionTraceEvent[];
  waitingFor: SessionWaitingFor | null;
  status: SessionAdvanceStatus;
  diagnostic?: SessionAdvanceError;
}

async function advanceSession(
  session: SessionDefinition,
  deps: SessionRunnerDeps,
  cursor: SessionCursor,
  options: {
    mode: SessionAdvanceMode;
    userInput?: string;
  }
): Promise<SessionAdvanceResult>
```

语义如下：

1. `mode: "continue"` 时，自动推进到下一个输入边界、结束或错误。
2. `mode: "step"` 时，只执行一个边界，非输入边界返回 `paused`。
3. `events` 返回本次推进期间产生的所有 output/end 事件。
4. `diagnostic` 在 `status: "error"` 时附带结构化错误。

### 2. `kal play` 只是适配层

`packages/core/src/session/session-executor.ts` 现在不再维护独立的 Session 语义，而是将 `advanceSession()` 包装成 `AsyncGenerator` 供 TUI 使用。

这保证：

- `kal play` 与 `kal debug` 共用同一个执行模型
- `paused`、`waiting_input`、`error` 的语义对齐
- Session 修复只需要改一处核心执行器

## 与 `kal play` 的关系

职责边界如下：

- `kal play`：面向人类的交互式 TUI 试玩入口
- `kal debug`：面向 Agent 和脚本的可恢复 CLI 调试入口

要求：

- 两者共享同一个底层 Session 调试驱动
- `kal play` 不能维护一套独立逻辑
- 任何 Session 语义修正，应同时影响 `play` 和 `debug`

## 错误与可观测性设计

### 当前问题

- Session 层经常只返回一个 message（`(error as Error).message`）
- Flow 层虽然有 `NodeExecutionError`（含 nodeId、nodeType、errorType），但没有稳定地上抛到 Session 层做诊断聚合
- CLI 最终只打印简化后的 `{ code, message, details }`
- Agent 拿到错误后无法定位到具体文件和位置，只能猜测

### 设计原则

基于调研发现，Agent 调试的核心循环是 **edit → run → read error → fix → repeat**。错误输出的质量直接决定了 Agent 的修复效率。研究表明，重新设计工具接口（不改功能）就能把 Agent 错误率从 35% 降到 5% 以下。

因此，错误输出必须满足：

1. **可定位**：Agent 能直接找到出错的文件和位置
2. **可理解**：错误信息包含足够的上下文，不需要额外查询
3. **可操作**：每个错误都附带具体的修复建议和可执行命令
4. **分层级**：区分 Agent 调用方式错误（exit code 2）和项目本身错误（exit code 1）

### 统一诊断模型

```ts
interface DiagnosticPayload {
  code: string;
  message: string;
  phase: 'project_load' | 'session' | 'flow' | 'node' | 'cli';
  stepId?: string;
  flowId?: string;
  nodeId?: string;
  nodeType?: string;
  errorType?: string;
  file?: string;
  jsonPath?: string;
  context?: {
    input?: string;
    stateSnapshot?: Record<string, StateValue>;
    flowInputs?: Record<string, any>;
    nodeInputs?: Record<string, any>;
    llmRequest?: string;
    llmResponse?: string;
  };
  suggestions: string[];
  details?: unknown;

  location?: {
    phase: 'project_load' | 'session' | 'flow' | 'node' | 'cli';
    step_id?: string;
    flow_id?: string;
    node_id?: string;
    node_type?: string;
    file?: string;
    json_path?: string;
  };
  root_cause: {
    code: string;
    message: string;
    error_type?: string;
  };
  remediation: {
    suggestions: string[];
  };
  evidence?: {
    input?: string;
    flow_inputs?: Record<string, any>;
    node_inputs?: Record<string, any>;
    state_snapshot?: Record<string, StateValue>;
    llm_request?: string;
    llm_response?: string;
  };
}

interface DebugObservation {
  summary: string;
  blocking_reason:
    | 'awaiting_input'
    | 'paused_after_step'
    | 'session_ended'
    | 'runtime_error'
    | 'invalid_request'
    | 'snapshot_invalid'
    | 'missing_run'
    | 'conflicting_run';
  current_step: {
    step_id: string | null;
    step_index: number | null;
  };
  waiting_for: DebugWaitingForPayload | null;
  location?: DebugLocation;
  root_cause?: DebugRootCause;
  state_delta: {
    changed_keys: string[];
    changed_values: Record<string, { old: any; new: any }>;
    preview: Record<string, any>;
  };
  allowed_next_actions: DebugActionDescriptor[];
  suggested_next_action: DebugActionDescriptor | null;
}
```

当前实现里：

- `diagnostics[]` 保留细粒度错误上下文，适合修复
- `observation` 提供当前阻塞点的语义摘要，适合驱动下一步决策

### Suggestion 生成规则

根据错误类型自动生成 suggestions：

| 错误码 | 阶段 | Suggestions |
|--------|------|-------------|
| `FLOW_NOT_FOUND` | session | "检查 flow/ 目录下是否存在 {flowRef}.json", "可用 flows: [{flowIds}]", "检查 session.json 中 step '{stepId}' 的 flowRef 拼写" |
| `FLOW_INPUT_MISSING` | flow | "确认 Session Step 是否设置了 inputChannel", "确认 Flow meta.inputs 已声明 {channel}", "如需默认值，可在 Flow 输入定义中设置 defaultValue" |
| `STATE_KEY_NOT_FOUND` | session | "检查 initial_state.json 中是否定义了 key '{key}'", "当前 state keys: [{keys}]" |
| `NODE_TIMEOUT` | node | "检查 API 密钥: kal config get llm.apiKey", "检查网络连接", "增加超时: 在节点 config 中设置 timeout 字段" |
| `LLM_ERROR` | node | "检查 kal_config.json 中的 llm 配置", "运行 kal config list 查看当前配置", "确认 API 密钥有效且有余额" |
| `CONDITION_EVAL_ERROR` | session | "检查 Branch step '{stepId}' 的条件表达式语法", "当前 state: {stateSnapshot}", "支持的格式: state.key op literal" |
| `SESSION_HASH_MISMATCH` | cli | "项目文件已修改，运行 --start --force-new 创建新会话", "运行 --delete --run-id <id> 清理旧会话" |
| `RUN_NOT_FOUND` | cli | "运行 kal debug {project} --list 查看可用会话", "运行 --start 创建新会话" |
| `INPUT_NOT_EXPECTED` | cli | "当前步骤不需要输入，运行 --continue 或 --step 不带参数", "必要时运行 --state 查看当前 cursor" |

### 错误传播链路改造

当前错误传播链路：

```
Node 抛出 Error → FlowExecutor 捕获为 NodeExecutionError → Session catch 取 .message → CLI 打印
```

改造后：

```
Node 抛出 Error
  → FlowExecutor 捕获为 NodeExecutionError（已有 nodeId, nodeType, errorType）
  → Session 捕获后包装为 DiagnosticPayload（补充 stepId, flowId, file, jsonPath）
  → Debug CLI 补充 context、evidence、suggestions
  → 将结构化诊断映射为 observation.root_cause / observation.location / allowed_next_actions
  → 输出到 diagnostics 数组和 observation 对象
```

具体改动：

1. `session-runner.ts` 会把 Flow/Node 错误提升成 `SessionAdvanceError`
2. `diagnostic-builder.ts` 负责补充 `location / root_cause / remediation / evidence`
3. `commands/debug.ts` 负责从 `diagnostics` 构建顶层 `observation`

## Source Location

要让错误真正可修复，必须在项目加载阶段保留来源信息。

至少需要保留：

- `session.json` 中 step 的来源
- `flow/*.json` 中 node 的来源
- semantic path，例如：
  - `session.steps[id=turn]`
  - `flow/main.json:data.nodes[id=llm-1]`

理想情况：

- JSON 加载时补充 line / column
- 所有关键错误都能关联到文件位置

最低可接受版本（Phase 1）：

- 输出 file + semantic path（`jsonPath`）
- 行列号作为 Phase 2 增强项

Phase 2 实现方案：

- 在 `project-loader.ts` 加载 JSON 时，使用 `jsonc-parser` 或自定义 parser 记录每个 key 的行列号
- 构建 `SourceMap`：`Map<semanticPath, { line, column }>`
- `DiagnosticBuilder` 查询 `SourceMap` 自动填充 line/column

## Exit Code 约定

建议如下：

| Exit Code | 语义 |
|-----------|------|
| `0` | 本次推进成功，可能是在等待输入，也可能正常结束 |
| `1` | 发生 fatal error，例如配置错误、执行错误、加载错误 |
| `2` | 用户动作非法，例如缺少 `--continue` / `--step` 所需输入、`run_id` 不存在、当前状态不接受输入 |

这样 Agent 可以仅通过退出码区分：

- 是否要继续推进
- 是否是自身调用方式不对
- 是否需要进入修复流程

## 测试要求

### 核心功能测试

至少覆盖以下场景：

1. **启动与边界停止**
   - `kal debug <project> --start` 启动后在第一个 Prompt/Choice 停下
   - 连续的 RunFlow + Branch 步骤自动推进，一次返回所有 events
   - 在 End 步骤正确结束，status 为 `ended`

2. **会话恢复**
   - 使用 `--run-id` 和 `--continue` / `--step` 可以继续推进到下一个边界
   - 省略 `--run-id` 时自动使用 active session
   - Session 状态修改在恢复后仍然生效（state snapshot 正确保存和恢复）

3. **输入处理**
   - `Choice` 步骤能返回候选项并接受合法选择
   - `Prompt` 步骤接受任意文本输入
   - 输入正确写入 stateKey（如果配置了）
   - 输入正确传递给 flowRef（如果配置了）

4. **错误处理**
   - 缺少 `--continue` / `--step` 所需输入时，返回 exit code `2` 和可操作提示
   - 不存在或失效的 `run_id` 返回结构化错误和 suggestions
   - Session hash 不匹配时返回明确错误和建议
   - Flow 内部 node 出错时，`kal debug` 能返回完整的 step / flow / node 级诊断
   - 诊断信息包含 file、jsonPath、location、root_cause、context、suggestions

5. **查询命令**
   - `--state` 返回完整的游戏状态
   - `--list` 列出所有调试会话
   - `--delete` 正确删除会话并清理 active 指向

6. **向后兼容**
   - `kal play` 在底层切换到共享执行器后行为不回归
   - Generator 适配层正确转换 cursor-based runner 的输出

### Agent 集成测试

模拟 Agent 的典型工作流：

```bash
# 1. Agent 创建新游戏项目
mkdir test-game && cd test-game
# ... 生成 session.json, flow/*.json, initial_state.json

# 2. Agent 启动调试
kal debug . --start
# 预期：返回 JSON，status=waiting_input，包含 observation.suggested_next_action

# 3. Agent 解析 JSON，提取 observation.suggested_next_action 并执行
kal debug . --continue "explore"
# 预期：返回 JSON，包含 flow 执行结果的 events

# 4. Agent 继续推进
kal debug . --step
# 预期：返回 paused 或 waiting_input

# 5. Agent 修改 flow 文件（引入错误）
# ... 编辑 flow/main.json，删除必需的 input

# 6. Agent 尝试继续
kal debug . --continue "attack"
# 预期：返回 error，diagnostics 包含 file、jsonPath、suggestions

# 7. Agent 根据 suggestions 修复
# ... 编辑 flow/main.json

# 8. Agent 重新启动（因为 session hash 变了）
kal debug . --start --force-new
# 预期：成功启动新会话
```

### 性能测试

- 长会话（100+ 步骤）的恢复时间应在 1 秒内（cursor-based，不需要回放）
- Session hash 计算应在 100ms 内（即使有 50+ flow 文件）
- State snapshot 序列化/反序列化应在 50ms 内（典型游戏状态 < 100KB）

## 分阶段落地

### Phase 1：核心闭环

目标：Agent 能启动、推进、恢复调试会话，拿到结构化输出。

#### 新建文件

| 文件 | 说明 |
|------|------|
| `packages/core/src/session/session-runner.ts` | Cursor-based shared session runner（`advanceSession`） |
| `apps/engine/src/debug/types.ts` | Debug 相关类型定义 |
| `apps/engine/src/debug/session-manager.ts` | 快照 CRUD + active session 管理 |
| `apps/engine/src/debug/diagnostic-builder.ts` | 诊断信息组装 + suggestion 生成 |
| `apps/engine/src/commands/debug.ts` | CLI 命令处理 + JSON 输出 |

#### 修改文件

| 文件 | 改动 |
|------|------|
| `packages/core/src/state-store.ts` | 添加 `restore(data)` 方法（从序列化数据恢复状态） |
| `packages/core/src/session/session-executor.ts` | 重构：底层改用 `advanceSession`，generator 变为适配层 |
| `packages/core/src/session/index.ts` | 导出 shared runner 和相关类型 |
| `apps/engine/src/cli.ts` | 添加 `debug` 命令路由 + 更新 `printUsage()` |
| `apps/engine/src/runtime.ts` | 添加 `restoreState(snapshot)` 方法 |
| `apps/engine/src/index.ts` | 导出 debug 命令、类型和工具函数 |
| `apps/engine/src/cli.test.ts` | 增加 debug CLI 场景覆盖 |

#### 实现顺序

1. `state-store.ts` 添加 `restore()` — 基础设施
2. `session-runner.ts` 实现 `advanceSession()` — 核心引擎
3. `session-executor.ts` 重构为 generator 适配层 — 确保 `kal play` 不回归
4. `debug/types.ts` + `debug/session-manager.ts` — 快照管理
5. `debug/diagnostic-builder.ts` — 结构化诊断
6. `commands/debug.ts` + `cli.ts` — CLI 集成
7. `cli.test.ts` / `runtime.test.ts` — 回归验证

#### 交付标准

- `kal debug <project> --start` 能启动并返回 JSON
- `kal debug <project> --continue <input>` 能推进并返回 JSON
- `kal debug <project> --step [input]` 能单步返回 `paused`
- `kal debug <project> --state` 能查看状态
- `kal play` 行为不变
- Exit code 0/1/2 正确
- 基础 diagnostics 包含 code、message、phase、stepId、flowId、suggestions
- 顶层输出包含 `observation`

### Phase 2：深度可观测性

- Source location：file + jsonPath + line + column
- 更丰富的 evidence：更完整的 nodeInputs、LLM 请求/响应、截断策略
- 更丰富的 suggestions（基于当前项目上下文动态生成）
- Observation 评测：验证 `blocking_reason / suggested_next_action` 是否稳定可消费
- 设计一致性 / 可玩性评测集

### Phase 3：生态集成

- 为 Studio / Web 调试面板复用同一套协议
- 评估是否暴露 HTTP 调试接口或 SSE 事件流
- 评估 MCP 集成（将 `kal debug` 暴露为 MCP tool，Agent 可直接调用而非通过 shell）

## 当前默认决策

本文档采用以下默认决策：

- 默认输出格式为 `json`
- 默认采用可恢复会话模型（cursor-based，非 replay）
- 调试快照默认放在项目目录（`<project>/.kal/runs/`），便于与 `kal serve` 共享
- `--start` 显式启动新会话，避免隐式创建导致的歧义
- 省略 `--run-id` 时自动使用 active session，减少 Agent 状态管理负担
- `--delete` 必须显式传 `--run-id`
- `kal play` 保留为人类入口，`kal debug` 作为 Agent 入口
- 两者共享同一个底层 `advanceSession()`，generator 只是适配层
- 不在首版内实现 HTTP debug API
- 不在首版内实现可视化断点 UI
- 不在首版内实现 MCP 集成（Phase 3 评估）

## 设计决策记录

### 为什么用 cursor-based runner 而不是 replay？

**Replay 方案**：每次恢复时从头创建 generator，回放所有历史输入。

问题：
- 每次恢复都要重新执行所有历史 flow（包括 LLM 调用），随着游戏推进越来越慢
- 需要 mock LLM 调用以保证回放确定性，但 mock 的结果可能与真实执行不同
- 复杂度随步骤数线性增长

**Cursor-based 方案**：保存 state snapshot + step position，直接从当前位置继续。

优势：
- O(1) 恢复时间，不依赖历史长度
- 不需要重新执行任何 flow
- state snapshot 是 JSON 可序列化的，天然适合持久化
- 与 OpenHands 的 event sourcing 模型理念一致

### 为什么保留 inputHistory？

虽然 cursor-based 恢复不需要回放，但 `inputHistory` 仍然保留在快照中，用于：
- 审计：追踪 Agent 的完整操作历史
- 调试：当结果不符合预期时，可以检查历史输入
- 未来：支持 "replay to step N" 的时间旅行调试

### 为什么 session hash 包含 node/*.ts？

自定义节点源码的变化会直接改变运行语义。即使 Agent 还没有重新 build，旧 run 的快照也不再可信，所以当前实现把 `node/*.ts/js` 一并纳入 `sessionHash`，用更保守的策略失效旧快照。

### 为什么 `--state` 返回完整状态而不是 summary？

`state_summary` 适合每次推进时的轻量输出，已经包含 `keys / changed / changed_values / preview`。但 Agent 在调试时仍然经常需要检查完整 state 值来理解游戏逻辑。`--state` 提供完整状态查询，是 `state_summary` 的补充而非替代。

## 预期收益

实现后，KAL 对 Agent 的闭环将从：

```text
能写文件，但无法稳定调试
```

变成：

```text
能写文件 → 能启动 Session → 能逐步推进输入 → 能读取结构化输出 → 能根据具体诊断修复
```

这会直接提升：

- Agent 改 Flow / Session / Node 后的验证效率
- 示例项目和复杂项目的可调试性
- 后续 Studio、事件流、断点调试的基础设施完整度

### 典型 Agent 工作流对比

#### 改造前

```
Agent 修改 flow/day-action.json
→ Agent 无法运行验证
→ Agent 只能静态检查 JSON 格式
→ 逻辑错误要等人类手动 kal play 才能发现
→ 反馈周期：分钟级（等人介入）
```

#### 改造后

```
Agent 修改 flow/day-action.json
→ kal debug . --start                              # 启动调试
→ kal debug . --continue explore                    # 推进到修改的 flow
→ 拿到结构化错误：
  {
    "code": "FLOW_INPUT_MISSING",
    "file": "flow/day-action.json",
    "jsonPath": "data.nodes[id=signal-in]",
    "suggestions": ["确认 meta.inputs 已声明 playerInput"]
  }
→ Agent 根据 file + jsonPath + suggestions 直接修复
→ kal debug . --start                              # 重新验证
→ 反馈周期：秒级（全自动）
```

## 元测试策略：Dogfooding with Broken Game

### 测试游戏：`archives/westbrook-high-broken`

这是一个由 LLM 一次性生成的完整游戏项目，包含真实的 bug（未经人工修复）。它作为 `kal debug` 的元测试用例，用于验证 debug 功能的实用性。

### 测试流程

每次对 `kal debug` 进行功能迭代时，执行以下流程：

1. **重置测试环境**
   ```bash
   rm -rf examples/westbrook-high
   cp -r archives/westbrook-high-broken examples/westbrook-high
   ```

2. **使用 `kal debug` 发现问题**
   ```bash
   cd examples/westbrook-high
   kal debug . --start
   # 观察输出的 diagnostics，检查是否包含足够的信息定位问题
   ```

3. **根据 diagnostics 修复**
   - 检查 `file` 和 `jsonPath` 是否准确指向出错位置
   - 检查 `suggestions` 是否可操作
   - 检查 `context` 是否包含足够的运行时信息

4. **验证修复**
   ```bash
   kal debug . --start
   kal debug . --continue <input>
   # 继续推进，直到遇到下一个 bug 或成功运行
   ```

5. **记录改进点**
   - 哪些错误信息不够清晰？
   - 哪些 suggestions 不够具体？
   - 哪些运行时上下文缺失？
   - 哪些文件定位不准确？

6. **迭代 debug 功能**
   - 改进 `DiagnosticBuilder` 的 suggestion 生成逻辑
   - 增强错误传播链路，保留更多上下文
   - 优化 source location 追踪

### 预期发现的问题类型

#### 逻辑错误（Logic Bugs）

基于 LLM 生成代码的常见问题，预期会发现：

| Bug 类型 | 示例 | 期望的 diagnostic |
|---------|------|------------------|
| Flow 输入缺失 | SignalIn 节点声明了 channel，但 meta.inputs 未定义 | `FLOW_INPUT_MISSING`，指向具体 node，建议检查 meta.inputs |
| State key 拼写错误 | ReadState 读取 `state.suspision`（拼写错误） | `STATE_KEY_NOT_FOUND`，列出相似的 keys（`suspicion`） |
| 条件表达式错误 | Branch 条件 `state.ap < 0`（应该是 `<= 0`） | `CONDITION_EVAL_ERROR`，显示当前 state.ap 的值 |
| Node 连接错误 | Edge 的 sourceHandle 不存在 | `VALIDATION_ERROR`，指向 edge 定义，列出可用 handles |
| LLM 超时 | GenerateText 节点因 API 问题超时 | `NODE_TIMEOUT`，建议检查 API 密钥、网络、增加 timeout |
| JSON 格式错误 | Flow 文件缺少逗号 | `INVALID_JSON`，显示行列号（Phase 2） |

#### 设计一致性问题（Design Consistency Issues）

实现与设计文档不一致的问题。这些问题需要 Agent 对比 `design/` 目录下的设计文档和实际运行结果：

| 问题类型 | 示例 | Agent 如何发现 |
|---------|------|---------------|
| 规则不一致 | AP 消耗与 rules.md 定义不符（如"地点探索"应消耗 1 AP，实际消耗 2 AP） | 对比 state_summary.changed_values 与 design/rules.md 的"行动经济"表 |
| 内容缺失 | 设计文档中定义的 NPC 或地点未实现 | 检查 design/content.md 中列出的 6 个核心 NPC 是否都能在 Choice 选项中遇到 |
| 系统缺失 | 设计文档中定义的子系统未实现（如"对质系统"、"手机系统"） | 检查 design/subsystems.md 中的系统是否都有对应的 flow 文件 |
| 数值范围错误 | State 初始值或变化范围与设计不符（如 suspicion 应为 0-100，实际可能超过 100） | 对比 initial_state.json 和 state 变化与 design/rules.md 的"资源与指标"表 |
| 阶段划分错误 | 游戏阶段推进与设计不符（如应在 Day 10 进入"调查期"，实际未切换） | 对比 state.day 和 state.gameStage 与 design/rules.md 的"基本规则" |

#### 可玩性问题（Playability Issues）

游戏能运行且符合设计，但体验不佳的问题。这些问题需要 Agent 通过分析 `events` 中的叙事内容和 `state_summary` 中的状态变化来发现：

| 问题类型 | 示例 | Agent 如何发现 |
|---------|------|---------------|
| 叙事连贯性 | NPC 前后矛盾、信息缺失、角色行为不合理 | 分析 events 中的 narration 文本，检查是否与之前的对话/事件冲突，对比 design/content.md 中的 NPC 人设 |
| 状态合理性 | 数值变化不符合预期（如信任值异常暴涨/暴跌） | 检查 state_summary.changed_values 中的数值变化是否在合理范围内 |
| 选项有效性 | 选项描述不清、选项结果与预期不符、缺少关键选项 | 检查 Choice 步骤的 options 是否清晰、是否覆盖核心行动 |
| 节奏流畅性 | 重复内容过多、信息过载、推进过快/过慢 | 统计连续 events 中的重复模式，检查单次推进的 events 数量 |
| 反馈清晰度 | 玩家不知道自己的行动产生了什么影响 | 检查 events 中是否包含 state_changes 字段，是否说明了行动后果 |

**可玩性验证的关键**：`events` 数组必须包含足够的叙事内容，让 Agent 能理解"发生了什么"。这要求：

1. **Output 事件同时保留 raw 与 normalized**：
   ```json
   {
     "type": "output",
     "step_id": "day-action",
     "raw": {
       "narration": "你前往图书馆。Lily 正在角落里看书，神情紧张。",
       "npc_reactions": {
         "lily": "她注意到你，但没有主动打招呼。"
       }
     },
     "normalized": {
       "narration": "你前往图书馆。Lily 正在角落里看书，神情紧张。",
       "state_changes": {
         "ap": { "old": 3, "new": 2 },
         "currentLocation": { "old": "dormitory", "new": "library" }
       },
       "labels": ["narration", "npc_reactions"]
     }
   }
   ```

2. **State summary 包含变化追踪和值摘要**：
   ```json
   "state_summary": {
     "total_keys": 4,
     "keys": ["ap", "day", "suspicion", "trust_lily"],
     "changed": ["ap", "currentLocation", "trust_lily"],
     "changed_values": {
       "ap": { "old": 3, "new": 2 },
       "trust_lily": { "old": 10, "new": 15 }
     },
     "preview": {
       "ap": 2,
       "currentLocation": "library",
       "day": 1,
       "trust_lily": 15
     }
   }
   ```

3. **Agent 可以读取设计文档**：
   - `design/rules.md` — 验证数值变化是否符合规则、检查行动经济、资源指标
   - `design/content.md` — 验证 NPC 行为是否符合人设、检查地点和事件是否完整
   - `design/soul.md` — 验证叙事语调是否符合定位
   - `design/subsystems.md` — 检查各子系统是否实现
   - `design/progression.md` — 检查游戏阶段推进是否正确

### 三层验证流程

#### 第一层：逻辑正确性验证

```bash
# 1. 启动调试，检查是否有运行时错误
kal debug . --start
# 预期：返回 JSON，status 不为 error

# 2. 推进若干步，检查是否能正常运行
kal debug . --continue explore
kal debug . --continue library
# 预期：每次都返回有效的 events，没有 diagnostics

# 3. 如果遇到错误，根据 diagnostics 修复
# - 检查 file、jsonPath、suggestions
# - 修改对应文件
# - 重新验证
```

#### 第二层：设计一致性验证

```bash
# 1. Agent 读取设计文档，建立规则和内容的索引
cat design/rules.md design/content.md design/subsystems.md

# 2. 对比实现与设计
# - 检查 initial_state.json 中的 state keys 是否与 rules.md 的"资源与指标"表一致
# - 检查 session.json 中的 Choice 选项是否覆盖 rules.md 的"行动经济"表
# - 检查 flow/ 目录下的文件是否覆盖 subsystems.md 中的所有子系统
# - 检查 state.gameStage 的切换逻辑是否符合 rules.md 的"基本规则"

# 3. 运行时验证
kal debug . --start
kal debug . --continue explore  # 消耗 1 AP
# 检查 state_summary.changed_values 中 ap 的变化是否为 -1（符合 rules.md）

kal debug . --continue infiltrate  # 消耗 2 AP
# 检查 state_summary.changed_values 中 ap 的变化是否为 -2（符合 rules.md）

# 4. 记录不一致问题到 BUGS.md（DESIGN-xxx）
```

#### 第三层：可玩性验证

```bash
# 1. Agent 读取设计文档，理解预期体验
cat design/soul.md design/content.md

# 2. 启动调试，推进若干步，收集叙事内容
kal debug . --start
kal debug . --continue explore
kal debug . --continue library
kal debug . --continue lily

# 3. Agent 分析输出，检查可玩性问题
# - 叙事是否连贯？Lily 的反应是否符合她的人设（design/content.md）？
# - 叙事语调是否符合定位（design/soul.md 要求"冷峻写实"）？
# - 状态变化是否合理？trust_lily 的变化是否在合理范围内？
# - 选项是否有效？是否清晰描述了行动内容？
# - 节奏是否流畅？是否有重复的叙事模式？
# - 反馈是否清晰？玩家能否理解自己的行动产生了什么影响？

# 4. Agent 记录问题到 BUGS.md（PLAY-xxx）
# 5. Agent 修改 flow 文件（调整 prompt、修改 state 更新逻辑）
# 6. 重新验证
```

### 成功标准

#### Phase 1：逻辑正确性

当 `kal debug` 能够：
1. 发现所有运行时 bug（不遗漏）
2. 每个 bug 都能通过 diagnostics 快速定位到具体文件和位置
3. 每个 bug 都有可操作的 suggestions
4. Agent 能根据 diagnostics 自动修复 80%+ 的逻辑错误

则认为 Phase 1 达标。

#### Phase 2：设计一致性

当 Agent 能够：
1. 通过对比 design/ 文档发现规则不一致问题（如 AP 消耗错误）
2. 发现内容缺失问题（如设计中的 NPC 未实现）
3. 发现系统缺失问题（如设计中的子系统未实现）
4. 发现数值范围错误（如 state 初始值或变化范围不符合设计）
5. 提出具体的修复建议（如"AP 消耗应为 1，当前为 2，修改 flow/day-action.json 中的 ApplyState 节点"）

则认为 Phase 2 达标。

#### Phase 3：可玩性验证

当 Agent 能够：
1. 通过分析 events 和 state_summary 发现叙事连贯性问题
2. 通过对比设计文档发现叙事语调不符问题
3. 通过检查 Choice 选项发现选项有效性问题
4. 发现节奏流畅性问题（如重复内容过多）
5. 提出具体的改进建议（如"Lily 的反应与她的人设不符，应该更加警惕"）
6. 修改 flow 文件中的 prompt 或状态更新逻辑来改进可玩性

则认为 Phase 3 达标。

### 持续改进

- 每次修复一个问题后，将修复过程记录到 `archives/westbrook-high-broken/BUGS.md`
- 区分三类问题：逻辑错误（LOGIC-xxx）、设计一致性（DESIGN-xxx）、可玩性（PLAY-xxx）
- 记录哪些 diagnostics 有效、哪些不够清晰
- 记录哪些设计一致性问题 Agent 能自主发现、哪些需要人工指出
- 记录哪些可玩性问题 Agent 能自主发现、哪些需要人工指出
- 将改进点反馈到：
  - `DiagnosticBuilder` — 改进 suggestion 生成
  - 错误传播链路 — 保留更多上下文
  - Output 事件数据结构 — 包含更多叙事信息和状态变化
  - 设计文档格式 — 使其更易于 Agent 解析和对比
- **最终目标**：Agent 能完全自主地将 broken 版本修复到"逻辑正确 + 设计一致 + 可玩性良好"的状态

### 验证指标

| 指标 | Phase 1 目标 | Phase 2 目标 | Phase 3 目标 |
|------|------------|------------|------------|
| 逻辑错误发现率 | 100% | - | - |
| 逻辑错误自动修复率 | 80%+ | - | - |
| 设计一致性问题发现率 | - | 90%+ | - |
| 设计一致性问题自动修复率 | - | 70%+ | - |
| 可玩性问题发现率 | - | - | 60%+ |
| 可玩性问题自动修复率 | - | - | 40%+ |
| 端到端修复时间 | < 10 分钟 | < 20 分钟 | < 30 分钟 |

**说明**：
- 逻辑错误是确定性的，Agent 应该能 100% 发现并自动修复大部分
- 设计一致性问题需要对比文档，Agent 应该能发现大部分并自动修复多数
- 可玩性问题是主观的，Agent 能发现 60%+ 已经很好，自动修复 40%+ 是合理预期
- 端到端修复时间指从 `kal debug --start` 发现第一个问题到修复所有问题的总时间
