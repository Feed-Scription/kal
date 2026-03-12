# Westbrook High 调试日志

## 调试目标
通过 `kal debug` 命令迭代调试 westbrook-high 游戏，使其可玩。

## 发现的问题与修复

### 1. intro flow: PromptBuild.messages 直连 Message.system（类型不匹配）
- **现象**: `GenerateText` 节点 400 Bad Request
- **根因**: `PromptBuild` 的 `messages` 输出是 `ChatMessage[]`，直接连到 `Message.system`（期望 `string`），导致发给 LLM 的 system content 变成嵌套对象 `{role: "system", content: [{role: "system", content: "..."}]}`
- **修复**: intro flow 不需要 Message 节点（无 history），改为 PromptBuild.messages 直连 GenerateText.messages
- **影响范围**: 10 个 flow 都有同样问题，批量修复

### 2. ReadState 节点不支持批量读取（引擎 bug）
- **现象**: `Node "read-state" (ReadState) missing declared output: "day"`
- **根因**: ReadState 只支持单 key 读取（输出 `value` + `exists`），但 flow 里用 `config.keys` 声明了多个输出 key
- **修复**: 改 ReadState 的 execute 方法，支持 `config.keys` 批量模式，返回每个 key 的值 + `all` 聚合对象
- **文件**: `packages/core/src/node/builtin/state-nodes.ts`

### 3. validateOutputs 过于严格（引擎 bug）
- **现象**: ReadState 批量模式返回的额外 key 触发 "undeclared output" 错误
- **修复**: 放宽 validateOutputs，只检查声明的 output 必须存在，不再拒绝额外的 output
- **文件**: `packages/core/src/node/node-executor.ts`

### 4. PromptBuild field fragment 缺少 template 时崩溃（引擎 bug）
- **现象**: `Cannot read properties of undefined (reading 'replace')`
- **根因**: flow JSON 里的 field fragment 用 `label` 而不是 `template`，但 `resolveField` 直接调用 `fragment.template.replace(...)` 没有防御
- **修复**: 当 `template` 缺失时，用 `label` 自动生成默认 template（`"${label}: {{items}}"`）
- **文件**: `packages/core/src/prompt/compose.ts`

### 5. Message 节点 user input 强制 required（引擎 bug）
- **现象**: 纯叙事 flow（无 user 输入）调用 Message 节点时，user 为 undefined，导致 formatSection 崩溃
- **修复**: 将 Message 节点的 `user` input 改为可选，execute 中跳过空 user
- **文件**: `packages/core/src/node/builtin/llm-nodes.ts`

### 6. LLM Client 错误信息不含 response body（引擎改进）
- **现象**: 只显示 `400 Bad Request`，无法判断具体原因
- **修复**: 在 LLM error 中附带 response body 前 500 字符
- **文件**: `packages/core/src/llm/llm-client.ts`

### 7. narrate prompt 缺少 phase 状态转换指导（游戏内容 bug）
- **现象**: 选择 "sleep" 后 phase 不变为 `night_done`，游戏卡在夜间循环
- **根因**: narrate flow 的 prompt 没有告诉 LLM 在 sleep 时设置 `phase: "night_done"`
- **修复**: 在 narrate prompt 的 JSON 格式说明中添加 phase 字段说明
- **文件**: `examples/westbrook-high/flow/narrate.json`

### 8. compact-history flow 的 ReadState 节点声明了 required key input 但未连接
- **现象**: `Missing required input "key" for node "read-state" (ReadState)`
- **根因**: compact-history flow 的 ReadState 用 `config.keys` 批量模式，不需要 `key` input，但 flow JSON 里声明了 `required: true`
- **修复**: 删除 flow JSON 里 ReadState 节点的 `key` input 声明
- **文件**: `examples/westbrook-high/flow/compact-history.json`

### 9. LLM provider (xiaomi/mimo-v2-flash) 要求必须有 user message
- **现象**: `400 Bad Request — user content must not be empty`
- **根因**: 纯叙事 flow（intro, day-start 等）只有 system message 没有 user message，xiaomi 模型拒绝
- **修复**: 在 GenerateText 和 Message 节点中，当 messages 里没有 user role 时自动补一个最小 user message
- **文件**: `packages/core/src/node/builtin/llm-nodes.ts`
- **备注**: 这是模型兼容性问题，OpenAI 原生 API 允许只有 system message，但部分 provider 不允许

### 10. narrate prompt 缺少 AP 消耗指导（游戏内容 bug）
- **现象**: 玩家行动后 AP 不减少，导致 day-action 循环无法结束
- **修复**: 在 narrate prompt 的 JSON 格式说明中添加 `ap` 字段和消耗规则
- **文件**: `examples/westbrook-high/flow/narrate.json`

## 调试体验

### 好的方面
- `kal debug --start` 的结构化 JSON 输出非常清晰，error code + location + diagnostics 三位一体
- `observation.allowed_next_actions` 给出了明确的下一步建议
- `state_summary.changed_values` 可以快速看到状态变化
- `--state` 命令可以随时检查完整游戏状态
- hash-based snapshot invalidation 在修改文件后正确提示需要重新启动
- `--format pretty` 模式可读性好，适合人工调试
- 改进后的 LLM error message 包含 response body，大幅提升了定位效率（第 9 个 bug 就是靠这个发现的）

### 期待优化的功能
1. **LLM 请求/响应日志**: debug 模式下应该能看到实际发给 LLM 的 messages 和返回的 response，目前只能看到最终错误
2. **Flow 级别的 step-through**: 目前只能 session 级别 step，如果能在 flow 内部逐节点执行会更容易定位问题
3. **类型检查增强**: PromptBuild.messages (ChatMessage[]) 连到 Message.system (string) 这种类型不匹配应该在 flow 加载时就报错，而不是运行时才发现
4. **dry-run 模式**: 不调用 LLM，用 mock 数据跑完整个 session，验证 flow 连线和 state 流转是否正确
5. **field fragment 的 template 应该有默认值**: 当只有 label 没有 template 时，自动用 label 生成 template 是合理的默认行为
6. **ReadState 批量模式应该是一等公民**: 在文档和 flow editor 中明确支持 config.keys 批量读取
7. **debug --continue 时显示 LLM 生成的叙事文本**: 目前只能看到 raw JSON，如果能提取 narrative 字段直接显示会更直观
8. **ApplyState 的 warn 日志应该在 debug payload 中可见**: 目前 `ApplyState: path not found in changes` 只打到 stderr，debug JSON 里看不到
9. **state 类型校验应该更宽容**: `todayWorldEvents` 是 array 类型但 LLM 返回了 string，ApplyState 应该尝试自动转换或至少在 diagnostics 里报告

## 常见 BUG 模式
1. **PromptBuild → Message 连线类型不匹配**: messages (ChatMessage[]) vs system (string)，这是最常见的 flow 编写错误
2. **field fragment 缺少 template**: 用 label 代替 template 是直觉行为，引擎应该兼容
3. **Message.user required 但无连接**: 纯叙事 flow 不需要 user input，但 Message 节点强制要求
4. **LLM 不返回预期的 state 字段**: prompt 需要明确指导 LLM 在特定条件下设置特定 state 值
5. **ReadState 批量模式 vs 单 key 模式混淆**: flow JSON 里声明了 key input required 但实际用 config.keys
6. **LLM provider 兼容性**: 不同 provider 对 message 格式要求不同，引擎需要做防御性处理

## 调试结果
游戏已成功从 Day 1 跑到 Day 7，完整验证了：
- intro 叙事生成
- 日间行动循环（day-action → check-ap → day-action 或 night）
- AP 消耗和自动进入夜间
- 夜间行动和 sleep 结束夜间
- day-end 日终总结
- world-tick 世界状态更新
- night-start 夜间开场
- compact-history 历史压缩（Day 3 触发）
- 完整的日夜循环（Day 1 → Day 7）

### 引擎源码修改清单
| 文件 | 修改内容 |
|------|----------|
| `packages/core/src/node/builtin/state-nodes.ts` | ReadState 支持 config.keys 批量模式 |
| `packages/core/src/node/node-executor.ts` | validateOutputs 允许额外 output |
| `packages/core/src/prompt/compose.ts` | field fragment 缺少 template 时用 label 生成默认值 |
| `packages/core/src/node/builtin/llm-nodes.ts` | Message.user 改为可选；Message/GenerateText 自动补 user message |
| `packages/core/src/llm/llm-client.ts` | LLM error 附带 response body |

### 游戏文件修改清单
| 文件 | 修改内容 |
|------|----------|
| `flow/intro.json` | 移除 Message 节点，PromptBuild 直连 GenerateText |
| `flow/compact-history.json` | 移除 Message 节点；ReadState 去掉 required key input |
| `flow/day-end.json` | 移除 Message 节点 |
| 8 个 flow (day-start, narrate 等) | PromptBuild.text → Message.system；Message.system 类型改为 string |
| `flow/narrate.json` | prompt 添加 phase/ap 状态转换指导 |
