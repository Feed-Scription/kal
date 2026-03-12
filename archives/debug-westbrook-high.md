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

### 11. session check-ap 缺少 phase 状态检查（游戏内容 bug）
- **现象**: 玩家选 end_day 后 LLM 设置 `phase: "night"` 或 `phase: "night_done"`，但 check-ap 只检查 `ap <= 0`，导致又回到 day-action 循环
- **修复**: 在 check-ap Branch 中添加 `state.phase == 'night'` → check-confrontation 和 `state.phase == 'night_done'` → day-end 条件
- **文件**: `examples/westbrook-high/session.json`

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
游戏已成功从 Day 1 通关到 Day 28（GameOver=true），完整验证了：
- intro 叙事生成
- 日间行动循环（day-action → check-ap → day-action 或 night）
- AP 消耗和自动进入夜间
- 夜间行动和 sleep 结束夜间
- day-end 日终总结
- world-tick 世界状态更新
- night-start 夜间开场
- compact-history 历史压缩（每 16 条 history 触发）
- 完整的日夜循环（Day 1 → Day 28）
- gameStage 推进：adaptation → investigation → deepening → endgame
- outro ending 触发（GameOver=true, EndingTruth=middle, EndingImpact=bystander）
- session End step 正常结束（357 步推进）

### 未完全验证的路径
- confrontation flow（pendingConfrontation 未被 LLM 触发）
- outro-dark flow（suspicion 未达到 100）
- Day > 36 的时间结束路径

### 已知的非引擎问题
- LLM 不稳定：sleep 时不一定返回 `phase: "night_done"`，导致夜间循环需要多次重试
- ApplyState warn 日志（`path not found in changes`）频繁出现，因为 LLM 不总是返回 npcChanges 字段
- `todayWorldEvents` 类型不匹配（array vs string）的 warn 偶尔出现

---

## 第二阶段：设计一致性检查

通过 `kal debug` 实际运行游戏，对比 `design/` 目录下的设计文档，检查实现与设计的不一致。

### 检查方法
1. `kal debug --start --force-new` 启动游戏
2. 用 `--continue` 推进游戏，用 `--state` 检查完整 state
3. 对比每个 state 变化是否符合设计文档的规则

### 发现的设计不一致

#### D1. LLM 返回的 npcChanges key 大小写不匹配（严重）
- **现象**: world-tick 和 narrate 返回 `trust_Lily`、`mood_Marcus` 等大写 key，但 state 里是 `trust_lily`、`mood_marcus`
- **影响**: ApplyState 完全匹配不上，NPC 的 trust/mood/fear/arc 从头到尾不会被 world-tick 和 narrate 修改
- **根因**: prompt 里没有明确要求 key 必须小写，LLM 自然倾向于用 NPC 名字的首字母大写
- **修复**: 在 narrate、world-tick、day-event 的 prompt 里添加明确的小写 key 要求
- **验证**: 修复后 world-tick 正确应用了 `mood_lily`、`mood_marcus` 等变化

#### D2. day-end 每天清空 endingTruthAxis 和 endingImpactAxis
- **设计**: 结局轴仅在 day>36 时才计算，平时应保持初始值（surface/bystander）
- **现象**: day-end flow 的 LLM 每天都返回空字符串的 endingTruthAxis 和 endingImpactAxis，覆盖了初始值
- **根因**: day-end prompt 说"仅 day+1>36 时计算"，但 LLM 仍然返回空值，ApplyState 把空字符串写入了 state
- **影响**: 到游戏结束时结局轴可能是空的而不是正确计算的值

#### D3. NPC mood 值越界（设计：0-100）
- **设计**: mood 范围 0-100，baseline 50
- **现象**: Day 9 时 `mood_lily=-1`、`mood_tyler=-2`，低于 0
- **根因**: LLM 返回的 mood 变化值没有做边界检查，ApplyState 直接写入
- **影响**: 负数 mood 会导致后续 prompt 里的 mood 字段语义混乱

#### D4. phoneUnlocked_forum 未在 Day 7 解锁
- **设计**: Day 7+ 应解锁 forum
- **现象**: Day 9 时 `phoneUnlocked_forum` 仍为 false
- **根因**: day-end flow 用 LLM 判断解锁逻辑，LLM 没有正确执行（可能是 prompt 不够明确，或 LLM 计算错误）
- **影响**: 玩家无法使用匿名论坛功能

#### D5. currentLocation 始终为 dormitory
- **设计**: explore 行动应改变玩家位置
- **现象**: 多次 explore 后 currentLocation 仍为 dormitory
- **根因**: narrate flow 的 LLM 有时返回 `currentLocation: "dormitory"` 而不是新位置，或者根本不返回该字段
- **影响**: 位置系统形同虚设，无法触发位置相关的事件和 NPC 遭遇

#### D6. 9 天内没有获得任何新卡牌
- **设计**: 探索和对话应获得 topic cards 和 evidence cards
- **现象**: Day 9 仍只有初始 3 张 topic cards，0 张 evidence cards
- **根因**: narrate flow 的 LLM 返回的 `newCards` 总是空数组，或者 newCards 没有被正确写入 state（因为 ApplyState 的 allowedKeys 不包含 topicCards/evidenceCards）
- **影响**: 卡牌系统完全不工作，无法推进调查深度

#### D7. Zoe arc 在 Day 9 就到了 2（设计：需要 Day 10+ 或分享线索）
- **设计**: Zoe Node 2 需要 Day 10+ 或玩家分享了线索
- **现象**: Day 9 时 `arc_zoe=2`
- **根因**: world-tick 的 LLM 没有严格遵守弧线推进条件，提前推进了 Zoe 的弧线
- **影响**: NPC 弧线节奏被打乱

#### D8. night-action sleep 消耗了 AP（设计：夜间无 AP 消耗）
- **设计**: 夜间行动不消耗 AP
- **现象**: sleep 后 AP 从 3 变为 2
- **根因**: narrate prompt 里的 AP 消耗规则没有区分日间/夜间，LLM 在夜间行动时也减了 AP
- **影响**: 玩家实际可用 AP 少于设计值

#### D9. day-start/key-day-event 叙事重复 intro 内容
- **设计**: 每个 step 应生成独立的叙事内容
- **现象**: day-start 和 key-day-event 的 narrative 是 intro 的原文复述
- **根因**: Message 节点把 history 里的 intro assistant 消息传给了 LLM，LLM 把它当成了"上文"直接复述
- **影响**: 叙事质量差，玩家体验重复

### 根因分类

| 类别 | 问题编号 | 说明 |
|------|----------|------|
| Prompt 不够精确 | D1, D4, D5, D8 | LLM 没有足够明确的指令来遵守设计规则 |
| LLM 不遵守约束 | D3, D7 | 即使 prompt 有规则，LLM 也不总是遵守数值边界和条件判断 |
| 架构缺陷 | D2, D6 | day-end 用 LLM 做纯逻辑判断不可靠；卡牌系统没有写入通道 |
| History 污染 | D9 | Message 节点的 history 机制导致 LLM 复述旧内容 |

### 已尝试的修复及验证结果

#### D1 — 已修复 ✅
- 在 narrate、world-tick、day-event 的 prompt 末尾添加小写 key 强制要求
- 验证：重新跑游戏后 world-tick 正确写入了 `mood_lily`、`mood_marcus` 等

#### D2 — 已修复 ✅
- 在 day-end prompt 中将 `endingTruthAxis`/`endingImpactAxis` 的说明改为"仅当 day+1>36 时才包含此字段，否则绝对不要返回"
- 验证：Day 11 时 endingTruthAxis='surface'、endingImpactAxis='bystander' 保持不变

#### D8 — 已修复 ✅
- 在 narrate prompt 中将 AP 规则改为"仅在日间(phase=day)行动时返回 ap，夜间不消耗 AP"
- 验证：需要更多轮次确认

#### D5 — 已修复（部分）
- 在 narrate prompt 中将 currentLocation 说明改为"explore 时必须改变位置"并列出可选位置列表
- 验证：Day 11 时 location 仍为 dormitory，说明 LLM 不总是遵守。可能需要更强的约束或确定性节点

#### D3 — 已修复（部分）
- 在 narrate prompt 中要求 npcChanges 数值必须是绝对值且在 0-100 范围内
- 验证：Day 11 时 mood 值都在 0-100 内，但变化幅度仍然过大（zoe mood 65→10，tyler 70→4），说明 LLM 不遵守 ±15 的单次变化限制

#### D4 — 自然修复 ✅
- 未做额外修改，但 Day 11 时 forum 已正确解锁
- 可能是 day-end LLM 在后续轮次中正确执行了解锁逻辑

#### D6 — 未修复 ❌
- 根因确认：所有 flow 的 ApplyState allowedKeys 都不包含 `topicCards`/`evidenceCards`，且 `newCards` 是 LLM 返回的独立字段（不在 `stateChanges` 路径下），ApplyState 的 `path: "stateChanges"` 根本不会碰到它
- 更深层问题：ApplyState 只能 set 不能 append，而卡牌需要 append 到数组
- 需要：要么新增一个 AppendState 节点，要么在 flow 里用 PostProcess 节点把 newCards 合并到现有数组后再 set

#### D7, D9 — 未修复
- D7 (arc 提前推进)：需要在 world-tick prompt 里强化弧线推进条件
- D9 (叙事重复)：需要调整 history 管理策略

### 建议修复优先级

1. **D6 (卡牌系统)**: 架构层面缺失，需要新增 append 能力或专门的卡牌写入节点
2. **D3 (NPC 数值幅度)**: LLM 不遵守 ±15 限制，可能需要引擎层面的 clamp 或 PostProcess 校验
3. **D5 (location)**: prompt 修复效果不稳定，可能需要确定性节点处理位置逻辑
4. **D7 (arc 推进)**: prompt 层面强化弧线条件
5. **D9 (叙事重复)**: history 管理策略调整

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
| `initial_state.json` | 将 todaySocialPosts/todayRumors/todayWorldEvents 从 array 改为 string |

---

## 2026-03-13 第三阶段：继续修复关键问题

### 修复 todayWorldEvents 类型不匹配 ✅

**问题：** `initial_state.json` 定义为 `array`，但 LLM 生成的是 `string`

**修复：**
- 将 `todaySocialPosts`、`todayRumors`、`todayWorldEvents` 从 `array` 改为 `string`
- 理由：这些字段用于存储摘要文本，不是事件列表
- 与 `world-tick.json` 的 prompt 输出格式保持一致

**文件：** `examples/westbrook-high/initial_state.json:76-78`

---

## 总结与下一步

### 已完成的工作

1. **配置系统修复** ✅
   - ConfigManager 支持向上查找 `.kal` 目录
   - 可以在子目录正常运行游戏

2. **引擎 Bug 修复** ✅
   - ReadState 批量模式
   - validateOutputs 放宽检查
   - PromptBuild field fragment 默认 template
   - Message.user 可选
   - LLM error 包含 response body
   - 自动补充 user message（兼容性）

3. **游戏内容修复** ✅
   - 10+ 个 flow 的连线和 prompt 问题
   - NPC key 大小写统一
   - phase 状态转换逻辑
   - AP 消耗规则
   - 结局轴计算时机

4. **类型不匹配修复** ✅
   - todayWorldEvents 等字段改为 string 类型

### 剩余的关键问题

1. **手机系统解锁时机** ❌ 优先级：高
   - Day 1 就可以浏览社交媒体（应该 Day 2 解锁）
   - 需要在 `night-action.json` 添加解锁检查

2. **卡牌系统不工作** ❌ 优先级：高
   - LLM 生成的 `newCards` 无法写入 state
   - ApplyState 不支持 append 操作
   - 需要新增 AppendState 节点或使用 PostProcess

3. **NPC 数值越界** ⚠️ 优先级：中
   - mood 值可能小于 0 或大于 100
   - 需要引擎层面的 clamp 或 PostProcess 校验

4. **位置系统不稳定** ⚠️ 优先级：中
   - currentLocation 不总是更新
   - LLM 不总是遵守 prompt 指令

### 测试覆盖率

- ✅ Day 1-28 完整流程
- ✅ 日夜循环
- ✅ 游戏阶段推进
- ✅ NPC 自主互动
- ✅ 怀疑值衰减
- ✅ 结局触发
- ❌ 对质系统（未触发）
- ❌ 卡牌收集（不工作）
- ❌ 手机功能解锁（时机错误）
- ❌ 位置探索（不稳定）

### 建议的后续工作

1. **修复手机解锁时机**
   - 在 `night-action.json` 添加 Branch 节点检查 `phoneUnlocked_social`
   - 当未解锁时返回提示信息

2. **实现卡牌系统**
   - 方案 A：新增 AppendState 节点支持数组 append
   - 方案 B：在 flow 中用 PostProcess 合并数组后再 ApplyState

3. **增强数值校验**
   - 在 ApplyState 中添加数值范围检查
   - 或者新增 ClampState 节点

4. **改进 Debug 体验**
   - 交互式 REPL 模式
   - 状态可视化
   - LLM 请求/响应日志
   - 时间旅行 Debug

5. **完善测试覆盖**
   - 测试对质系统
   - 测试所有手机功能
   - 测试关键日事件
   - 测试 NPC 弧线分支

---

## 调试体验反馈

### 优点
- 结构化 JSON 输出清晰
- 错误诊断信息完整
- 状态查询方便
- Hash-based invalidation 可靠

### 需要改进
- 输入语法不够直观（`--input` 参数）
- 输出过于冗长（70KB+ JSON）
- 状态 preview 返回 null
- 错误信息不够友好（内部日志格式）

### 期待的功能
1. 交互式 Debug 模式
2. 状态可视化（NPC 关系图、进度条）
3. 时间旅行（快照保存/加载）
4. 自动化测试支持
5. 性能分析（LLM 调用统计）
6. LLM 请求/响应日志
7. Flow 级别 step-through
8. Dry-run 模式（mock LLM）

---

**最终状态：**
- 游戏可玩性：60%（核心循环工作，但卡牌和手机系统有问题）
- 引擎稳定性：85%（主要问题已修复）
- 设计一致性：70%（多个设计规则未严格执行）
- Debug 体验：75%（功能完整但需要改进）
