# Westbrook High 调试历程记录

> 使用 `kal debug` 对 Westbrook High 进行完整 36 天通关测试的调试笔记。
> 记录调试体验、常见 BUG 模式、以及对 Kal 引擎和调试工具的优化建议。

---

## 一、调试历程

### 第一阶段：环境搭建（耗时最长的意外）

一开始跑 `kal debug --start` 就报 `OPENAI_API_KEY not set`。原因是 `ConfigManager` 只在 `process.cwd()` 找 `.kal/config.env`，从 `examples/westbrook-high/` 子目录运行时找不到项目根目录的配置。

报错信息：
```
Error: OPENAI_API_KEY not set. Run `kal config` to configure.
```

排查路径：
1. 确认 `.kal/config.env` 在项目根目录存在 → 存在
2. 检查 `ConfigManager` 构造函数 → 发现 `this.configDir = path.join(process.cwd(), '.kal')` 写死了 cwd
3. 从 `examples/westbrook-high/` 运行时 cwd 是子目录，找不到 `.kal/`

修复（`packages/core/src/config/ConfigManager.ts`）：
```typescript
// 修复前
this.configDir = path.join(process.cwd(), '.kal');

// 修复后：向上遍历目录树
private findConfigDir(): string {
  let currentDir = process.cwd();
  while (currentDir !== path.dirname(currentDir)) {
    const kalDir = path.join(currentDir, '.kal');
    if (fs.existsSync(path.join(kalDir, 'config.env'))) {
      return kalDir;
    }
    currentDir = path.dirname(currentDir);
  }
  return path.join(process.cwd(), '.kal'); // fallback
}
```

修了 `ConfigManager.findConfigDir()` 让它向上遍历目录树，才跑通第一步。这种基础设施问题不该在 dogfooding 阶段才发现——说明之前的测试都是从项目根目录跑的。

### 第二阶段：Day 1 能跑了，但卡在 Day 2

游戏启动后 intro 叙事质量不错，冷峻写实的风格基本到位。但 Day 1 结束后 sleep，day 计数器不动——永远停在 Day 2。

排查过程：
1. 先怀疑 day-end flow 没执行 → 用 `kal debug --continue --input sleep` 的 events 输出确认 `step_id: "day-end"` 有出现，flow 确实执行了
2. 再怀疑 JSON 解析失败 → day-end 的 raw result 是合法 JSON 字符串，JSONParse 正常工作
3. 最后对比 LLM 返回值和 state 变化，发现 LLM 返回 `"day": 2` 而不是 `"day": 3`

实际抓到的 day-end LLM 输出：
```json
{"stateChanges":{"day":2,"gameStage":"adaptation","phoneUnlocked_social":true,...}}
```
当前 day 就是 2，LLM 原样返回了。

根因：day-end.json 的 PromptBuild 里，field label 写的是 `"当前天数（已+1后的值）"`，LLM 以为传入的值已经加过 1 了，就原样返回。

修复前（day-end.json PromptBuild fragment）：
```
"content": "重要：你必须将day值+1后返回。例如当前day=5，你应返回day=6。..."
// field label:
"label": "当前天数（已+1后的值）"
```

修复后：
```
"content": "你是一个纯逻辑计算器。根据输入的当前天数(currentDay)，计算明天的值...
1. nextDay = currentDay + 1（例如：currentDay=2，则nextDay=3）
...
示例：currentDay=2 → {\"stateChanges\":{\"day\":3,...}}
示例：currentDay=6 → {\"stateChanges\":{\"day\":7,...}}"
// field label:
"label": "currentDay（当前天数，你需要返回此值+1）"
```

关键改动：把歧义标签换成明确的变量名 + 计算步骤 + 两个具体示例。修完后 Day 1→2→3→...→37 全程顺利推进。

**教训：LLM 做算术不可靠，prompt 里的歧义标签会被放大。给 LLM 做计算时，必须用变量命名 + 公式 + 示例三重保险。**

### 第三阶段：Sleep 无限循环

Day 推进修好后，新问题出现：选 sleep 后游戏有时不进入 day-end，而是反复回到 night-action 选择界面。

原因：night-action flow 把 sleep 交给 LLM 叙事，LLM 有时忘记在 `stateChanges` 里返回 `"phase": "night_done"`。没有这个标记，session.json 的 `check-night-end` Branch 就走 default 回到 night-action，形成死循环。

修复尝试了三轮：
1. 第一轮：在 session.json 加 Branch + Prompt 步骤做 phone-lock 检查 → 失败，Prompt 步骤需要 stateKey，`phoneLockMessage` 不在 initial_state 里
2. 第二轮：把 Choice 的 flowRef 去掉，用 stateKey 存选择再 Branch → 失败，Choice 步骤必须有 flowRef 或 stateKey
3. 第三轮：Choice 同时设 stateKey + flowRef + inputChannel，Branch 在 flow 执行后检查 `nightChoice == 'sleep'` 走 force-sleep flow → 成功

force-sleep flow 用 ApplyState + defaultValue 硬编码 `phase = "night_done"`，不经过 LLM。这个方案经历了类型不匹配（boolean→string）、SignalOut channel 类型校验等小坑才跑通。

force-sleep.json 最终方案（经历了三版迭代）：
```
第一版：ModifyState + Constant 节点 → 失败，引擎没有 Constant 节点类型
第二版：ApplyState.success (boolean) → SignalOut.data (string) → 失败，类型不匹配
第三版：ApplyState.applied (array) → SignalOut.data (object) → 失败，SignalOut channel 类型必须匹配 meta.outputs
最终版：断开 ApplyState 和 SignalOut 的连线，让两个节点独立执行 → 成功
```

最终的 force-sleep.json 核心结构：
```json
{
  "nodes": [
    {
      "id": "apply-state",
      "type": "ApplyState",
      "inputs": [{
        "name": "changes", "type": "object",
        "defaultValue": { "stateChanges": { "phase": "night_done" } }
      }],
      "config": { "path": "stateChanges", "allowedKeys": ["phase"] }
    },
    { "id": "signal-out", "type": "SignalOut", "config": { "channel": "result" } }
  ],
  "edges": []  // 关键：不连线，各自独立执行
}
```

session.json 中的路由逻辑：
```
night-action (Choice, stateKey="nightChoice", flowRef="night-action")
  → check-night-end (Branch)
    → nightChoice == 'sleep' → do-force-sleep (RunFlow "force-sleep") → day-end
    → phase == 'night_done' → day-end
    → default → night-action (循环)
```

**教训：关键状态转换不能依赖 LLM。确定性逻辑必须硬编码。另外，创建一个只设置一个 state 值的 flow 需要绕很多弯——这正是 session 层需要 SetState 步骤的原因。**

### 第四阶段：完整通关 Day 1→37

修完上面两个阻断问题后，终于能自动推进了。写了 shell 循环批量 `end_day + sleep` 推进，从 Day 1 一路跑到 Day 37 触发结局。

用来批量推进的脚本模式：
```bash
RUN=dbg_xxx
for i in $(seq 1 35); do
  kal debug --continue --input end_day --run-id "$RUN" 2>/dev/null > /dev/null
  kal debug --continue --input sleep --run-id "$RUN" 2>/dev/null | python3 -c "
    import json,sys; d=json.load(sys.stdin)
    cv=d.get('state_summary',{}).get('changed_values',{})
    day=cv.get('day',{}).get('new','?')
    print(f'Day {day}')
  "
done
```

这个脚本暴露了一个调试工作流的痛点：每次 `--continue` 返回 30-80KB 的 JSON，里面大部分是 history 的完整 dump。为了提取"day 变了没"这一个信息，必须用 python 脚本解析。如果有 `--diff` 或 `--watch-keys` 模式，这个循环可以简化很多。

另一个问题：批量推进中 run 偶尔会静默 error（status 变成 error，waiting_for 变成 null），脚本后续的 `--continue` 全部失败但不报明确错误。最终加了状态检查逻辑：
```bash
STATUS=$(kal debug --state --run-id "$RUN" 2>/dev/null | python3 -c "
  import json,sys; d=json.load(sys.stdin)
  if d.get('status')=='error': print('ERROR')
  ...")
if [ "$STATUS" = "ERROR" ]; then break; fi
```

过程中观察到的里程碑事件：
- Day 2: phoneUnlocked_social = true ✓
- Day 4: phoneUnlocked_dm = true ✓
- Day 7: phoneUnlocked_forum = true ✓
- Day 10: gameStage 从 adaptation 变为 investigation ✓
- Day 14: phoneUnlocked_anon = true ✓
- Day 19: gameStage 变为 deepening ✓（但 Day 20 又变回 investigation，Day 21 再变回 deepening——LLM 判断不稳定）
- Day 28: gameStage 变为 endgame ✓
- Day 37: 游戏结束，触发 outro flow

手机解锁时间线和游戏阶段转换基本正确，说明 day-end prompt 重写后 LLM 的逻辑判断能力足够。

### 第五阶段：针对性系统测试

通关后回头做针对性测试，每个行动类型都跑了至少两次，记录 LLM 返回的 raw result 和实际 state 变化的对比：

- **explore**: 叙事质量好，但 AP 有时不扣，location 有时不变
  ```
  LLM 返回: {"narrative":"...","stateChanges":{"currentLocation":"hallway","suspicion":2},"npcChanges":{"mood_zoe":5,"trust_zoe":5}}
  实际 state 变化: currentLocation=hallway ✓, suspicion=2 ✓, mood_zoe=5 ✓, trust_zoe=5 ✓
  问题: stateChanges 里没有 ap 字段 → AP 没扣（应该从 3 变 2）
  ```
- **eavesdrop**: 能生成窃听内容，AP 正确扣 1，但 newCards 不写入 state
  ```
  LLM 返回: {"narrative":"...","stateChanges":{"suspicion":3,"ap":1},"newCards":{"topics":[{"id":"maya_notebook","name":"Maya的笔记本","line":"A"}]}}
  实际 state 变化: ap=1 ✓, suspicion=3 ✓
  问题: newCards.topics 里的 maya_notebook 没有写入 topicCards（仍然只有初始 3 张）
  ```
- **infiltrate**: 叙事合理，但 AP 只扣 1（设计要求 2）
  ```
  LLM 返回: {"stateChanges":{"ap":2,"suspicion":5,"currentLocation":"admin_office"}}
  问题: ap 从 3 变 2（只扣了 1），设计规定潜入消耗 2 AP，应该变成 1
  ```
- **club**: 叙事提到社团活动，但 faction_* 值从未改变
  ```
  LLM 返回: {"stateChanges":{"ap":2,"suspicion":3,"currentLocation":"club"},"npcChanges":{"trust_zoe":8,"mood_zoe":12}}
  问题: stateChanges 里完全没有 faction_* 字段，LLM 不知道要返回派系信任变化
  ```
- **phone**: 叙事描述手机界面，但 AP 不扣
- **social_media (夜间)**: 能生成社交媒体内容，但 newCards 不写入
- **review_evidence (夜间)**: 返回空结果（narrative 为空字符串，stateChanges 为 `{}`），因为 evidenceCards 为空所以 LLM 无话可说

总结规律：LLM 擅长生成叙事和 NPC 情绪变化，但对"规则性"的数值操作（AP 扣除、派系信任、卡牌收集）遵守率很低。

---

## 二、常见 BUG 模式

### 模式 A：LLM 不遵守数值约束

这是出现频率最高的问题类别。

| 现象 | 频率 | 示例 |
|------|------|------|
| 不扣 AP | ~30% 的行动 | explore 两次后 AP 仍为 3 |
| mood 超出 [0,100] | ~15% | mood_marcus = -2 |
| trust 变化幅度过大 | ~20% | trust_lily 单次 +35（设计上限 +15） |
| 忘记设置 phase 转换 | ~40% 的 sleep | 不返回 `"phase": "night_done"` |
| arc 超出 [1,3] | 偶发 | tyler.arc = 4 |
| fear 只升不降 | 长期趋势 | 到 Day 37 三个 NPC fear ≥ 90 |

**根本原因**：prompt 里写了约束规则，但 LLM 不是计算器。它会"大致遵守"但不保证精确。数值越多、规则越复杂，遵守率越低。

**解决方向**：确定性逻辑（AP 扣除、phase 转换、数值 clamp）必须在引擎层或 flow 节点层硬编码，不能交给 LLM。

### 模式 B：ApplyState 静默丢弃数据

ApplyState 节点在以下情况静默跳过，不报错：
- key 不在 allowedKeys 白名单中 → 跳过
- key 不存在于 state 中 → 跳过
- path 在 changes 对象中找不到 → 打印 debug log 但不报错
- 值类型不匹配 → 报错但继续执行

实际遇到的静默丢弃案例：

**案例 1：newCards 被完全忽略**
```
LLM 返回:
{
  "narrative": "...",
  "stateChanges": { "ap": 1, "suspicion": 3 },
  "npcChanges": { "mood_lily": 25, "fear_lily": 75 },
  "newCards": { "topics": [{"id": "maya_notebook", "name": "Maya的笔记本", "line": "A"}] }
}

ApplyState (apply-state) allowedKeys: ["ap","suspicion","currentLocation","lastEvent","dayLog","phase",...]
→ ap ✓ applied, suspicion ✓ applied
→ newCards? 不在 allowedKeys 里，也不在 path "stateChanges" 下 → 静默丢弃

ApplyState (apply-npc) allowedKeys: ["trust_*","mood_*","fear_*","arc_*",...]
→ mood_lily ✓, fear_lily ✓
→ newCards? 不在 path "npcChanges" 下 → 静默丢弃

结果：maya_notebook 这张卡永远不会出现在 topicCards 里
```

**案例 2：lineA_depth 被白名单拦截**
```
day-action.json ApplyState allowedKeys 包含 "lineA_evidence" 但不包含 "lineA_depth"
即使 LLM 返回 "lineA_depth": 2，也会被静默跳过
stderr 只有一行 debug 级别的 log：
  [apply-state] ApplyState: key not in allowedKeys, skipping { key: 'lineA_depth' }
```

**案例 3：path 找不到时的 log**
```
当 LLM 返回的 JSON 结构不符合预期（比如没有 stateChanges 包装层）：
  [apply-state] ApplyState: path not found in changes { path: 'stateChanges' }
  [apply-npc] ApplyState: path not found in changes { path: 'npcChanges' }
这两行 log 在 stderr 里，但 debug 命令的 JSON 输出里不体现，很容易漏掉
```

这导致 LLM 返回的很多有效数据被丢弃：
- `newCards` 没有对应的处理节点
- `faction_*` 在 allowedKeys 里但 LLM 不返回
- `lineA_depth` 不在 allowedKeys 里所以即使 LLM 返回也被丢弃

**调试体验很差**：数据丢失是静默的，只有仔细对比 LLM 输出和 state 变化才能发现。建议至少在 `--continue` 的 JSON 输出里加一个 `warnings` 数组，列出所有被跳过的 key。

### 模式 C：Flow 执行中断但无明确错误

多次遇到 run status 变成 `error` 但 `diagnostics` 为空、`root_cause` 为 `{}` 的情况。只能看到 `current_step` 停在某个步骤，但不知道为什么失败。

实际遇到的例子：

**例 1：Day 6 night-start 步骤崩溃**
```bash
$ kal debug --state --run-id dbg_1773374816896_b31b6b
Day: 6 | Phase: night | AP: 0
Status: error
Root cause: {}
Step: {'step_id': 'night-start', 'step_index': 84}
```
没有任何 diagnostics。只知道死在 night-start，不知道是 flow 内部哪个 node 出错、LLM 返回了什么、哪个 edge 断了。最终只能 `--force-new` 重来。

**例 2：Day 4 do-night-action 步骤崩溃**
```bash
$ kal debug --state --run-id dbg_1773375247208_d1d578
Day: 4 | Phase: night | AP: 0
Status: error
Step: {'step_id': 'do-night-action', 'step_index': 52}
```
这个后来定位到是因为 Choice 步骤用了 `stateKey` 但没有 `flowRef`，导致 `do-night-action` RunFlow 步骤执行 night-action flow 时，flow 的 SignalIn 节点收不到 inputChannel 数据。但错误信息完全没有提示这一点。

**例 3：连续 sleep 后 run 静默死亡**
在批量推进脚本中，有时连续几个 sleep 后 run 突然变成 error，`waiting_for` 变成 `null`。怀疑是 history 累积过长导致 LLM 调用超时或返回异常，但无法确认——因为没有 node-level 的错误日志。

常见触发场景：
- LLM 返回无法解析的 JSON（被 JSONParse 的 fixCommonErrors 修复后仍有问题）
- history 中出现 null content 导致后续 LLM 调用失败
- 长时间运行后 state 累积了不一致的数据

### 模式 D：Choice 步骤的 flowRef/stateKey/inputChannel 耦合

Choice 步骤的三个属性之间有隐含的依赖关系：
- 必须有 `flowRef` 或 `stateKey`（否则校验失败）
- `flowRef` 会立即执行 flow，无法在执行前做条件检查
- `inputChannel` 只在有 `flowRef` 时生效
- `stateKey` 和 `flowRef` 可以同时使用，但行为不直观

这导致"先检查选择再决定是否执行 flow"的模式很难实现。最终方案是三个属性全设，让 flow 先执行（即使是 sleep 也会跑一遍 night-action flow），然后在 Branch 里补救。

---

## 三、调试体验评价

### 好的方面

1. **`--state` 命令很有用**：能随时查看完整 state 快照，是定位问题的主要手段
2. **`--continue --input` 交互模式**：能像玩家一样做选择推进游戏，体验接近真实
3. **`--start --force-new`**：快速重启，不用手动清理旧 run
4. **events 输出包含 raw result**：能看到 LLM 的原始返回，方便对比 state 变化
5. **diagnostics 系统**：当它工作时（如 STATE_KEY_NOT_FOUND），错误信息很清晰
6. **observation.suggested_next_action**：给出下一步操作建议，对新手友好

### 痛点

1. **run 经常莫名 error**：status 变成 error 但 diagnostics 为空，root_cause 为 `{}`，只能猜。在整个 dogfooding 过程中，至少有 5 个 run 因为这种无信息 error 被迫放弃（run id: `dbg_1773374816896_b31b6b`, `dbg_1773375247208_d1d578`, `dbg_1773375494769_ccd67b` 等）
2. **没有 step-level trace**：不知道 flow 内部哪个 node 失败了，只知道哪个 session step 出错。比如 `do-night-action` 报错，但不知道是 narrate SubFlow 里的 PromptBuild 失败、GenerateText 超时、还是 JSONParse 解析错误
3. **ApplyState 静默丢弃**：数据被丢弃时没有 warning 级别的输出，只有 debug 级别的 log（在 stderr 里，且不在 JSON 输出中）。整个 dogfooding 过程中最耗时的排查就是"为什么 LLM 明明返回了 newCards 但 state 里没有"
4. **输出太大**：每次 `--continue` 返回的 JSON 动辄 30-80KB，大部分是 history 和 state 的完整 dump，很难在终端里阅读。到 Day 15+ history 有 10+ 条消息，每条几百字，输出直接超过终端缓冲区。不得不写 python 脚本做过滤：
   ```bash
   kal debug --continue --input explore --run-id "$RUN" 2>/dev/null | python3 -c "
     import json,sys; d=json.load(sys.stdin)
     cv=d.get('state_summary',{}).get('changed_values',{})
     print('AP:', cv.get('ap',{}).get('new','unchanged'))
   "
   ```
5. **run-id 管理麻烦**：从非项目目录运行时报 `RUN_PROJECT_MISMATCH`，必须 cd 到正确目录或用 `--run-id`。`--step` 命令会把 input 值当作路径解析（如 `kal debug --step sleep` 被解析为 `kal debug /path/to/sleep`），导致 project mismatch
6. **没有 replay/rewind**：一旦 state 被污染（如 mood 变成负数），无法回退到之前的状态，只能 `--force-new` 重来。36 天的游戏从头跑一遍需要 ~30 分钟的 LLM 调用时间
7. **没有 state diff 摘要**：每次操作后要自己写 python 脚本解析 JSON 才能看到"什么变了"。`state_summary.changed_values` 字段存在但包含完整的 old/new 值（包括整个 history 数组），不是人类可读的 diff
8. **批量测试困难**：没有 headless/batch 模式，自动化测试需要写 shell 循环 + python 解析。整个 dogfooding 过程中写了大量一次性脚本来批量推进和提取数据

---

## 四、期待的引擎优化

### 4.1 新节点类型

#### AppendArray（最急需）
```
输入: items (array), stateKey (string)
行为: 读取 state[stateKey]，将 items 追加到数组末尾，可选按 id 去重
```
没有这个节点，所有基于数组累积的系统（卡牌、历史决策、关键事件列表）都无法工作。这是当前最大的架构缺口。

#### ClampValue
```
输入: value (number), min (number), max (number)
输出: clamped (number)
```
或者直接在 ApplyState 的 config 里支持 `clamp: { min: 0, max: 100 }`。NPC 属性值失控是最常见的 LLM 不遵守约束的问题。

#### ComputeState / Expression
```
config: { expression: "state.ap - 1" }  或  { expression: "max(0, state.suspicion - 2)" }
```
简单的算术运算不应该需要调用 LLM。AP 扣除、怀疑值衰减、调查深度检查这些确定性逻辑应该有专门的节点。

#### ConditionalApplyState
```
config: {
  conditions: [
    { when: "value < 0", set: 0 },
    { when: "value > 100", set: 100 }
  ]
}
```
在 ApplyState 之后自动做后处理，避免 LLM 返回的越界值写入 state。

### 4.2 Session 步骤增强

#### DynamicChoice
```json
{
  "type": "DynamicChoice",
  "options": [
    { "label": "浏览社交媒体", "value": "social_media", "when": "state.phoneUnlocked_social == true" },
    { "label": "匿名行动", "value": "anon_action", "when": "state.phoneUnlocked_anon == true" }
  ]
}
```
根据 state 动态显示/隐藏选项。当前只能显示所有选项然后在选择后检查，体验很差。

#### SetState 步骤
```json
{
  "type": "SetState",
  "changes": { "phase": "night_done", "ap": 0 }
}
```
在 session 层直接设置 state，不需要创建一个只有 ApplyState 的 flow。当前为了硬编码一个 `phase = "night_done"` 需要创建整个 force-sleep.json flow。

### 4.3 Debug 命令优化

#### `--trace` 模式
```bash
kal debug --continue --input explore --trace
```
输出 flow 内部每个 node 的执行结果，而不只是最终 output。当 ApplyState 静默丢弃数据时，trace 能显示哪些 key 被跳过了。

#### `--diff` 模式
```bash
kal debug --continue --input explore --diff
```
只输出 state 变化的 diff，而不是完整的 state dump。类似：
```
  ap: 3 → 2
  currentLocation: dormitory → library
  trust_zoe: 30 → 35 (+5)
  mood_zoe: 65 → 60 (-5)
  + topicCard: maya_notebook (Line A)
```

#### `--validate` 命令
```bash
kal debug --validate
```
在不运行游戏的情况下检查：
- session.json 的所有 flowRef 是否有对应的 flow 文件
- flow 中 ApplyState 的 allowedKeys 是否覆盖了 initial_state 中的所有 key
- Branch 条件中引用的 state key 是否存在
- 类型匹配检查（flow 节点之间的连线类型）

#### `--replay` 命令
```bash
kal debug --replay --run-id xxx --to-step 15
```
重放一个 run 到指定步骤，用于在修改 flow 后验证修复效果，而不需要从头开始。

#### `--batch` 模式
```bash
kal debug --batch --script test-scenario.json
```
预定义一系列输入序列，自动执行并输出最终 state。用于回归测试。

#### `--watch-keys` 模式
```bash
kal debug --continue --input explore --watch-keys "ap,suspicion,trust_*,mood_*"
```
只监控指定的 state key 变化，过滤掉 history 等大字段的噪音。

### 4.4 错误处理改进

1. **ApplyState 丢弃数据时输出 warning**（不只是 debug log）
2. **Flow 执行失败时保留完整的 node-level 错误栈**，而不是只报 session step 级别的错误
3. **LLM 返回值校验**：在 ApplyState 之前自动检查数值范围、类型匹配，不合规时报 warning 并 clamp
4. **history null content 检测**：GenerateText 写入 history 时检查 content 是否为 null，如果是则跳过或用 fallback

### 4.5 State 管理增强

1. **State schema validation**：在 initial_state.json 中支持定义 `min/max/enum` 约束，引擎自动 enforce
```json
{
  "ap": { "type": "number", "value": 3, "min": 0, "max": 3 },
  "mood_lily": { "type": "number", "value": 30, "min": 0, "max": 100 },
  "phase": { "type": "string", "value": "day", "enum": ["day", "night", "night_done"] }
}
```

2. **State snapshot/restore**：在关键节点自动保存 state 快照，支持回退

3. **State change hooks**：当某个 key 变化时自动触发检查（如 `day` 变化时自动更新 `isKeyDay`）

---

## 五、总结

Kal debug 的核心交互模式（start → continue with input → check state）是对的，能有效模拟玩家体验。但当前的主要瓶颈在于：

1. **引擎缺少确定性计算能力**：太多逻辑被推给 LLM，而 LLM 不是可靠的计算器。需要 ComputeState、ClampValue、AppendArray 等节点让游戏设计者能把确定性规则从 LLM 中剥离出来。

2. **调试信息不够细粒度**：当前只能看到 session step 级别的结果，看不到 flow node 级别的执行细节。数据被静默丢弃时没有明显提示。

3. **缺少自动化测试支持**：每次修改后都要手动重玩，没有 batch/replay/snapshot 机制。对于 36 天的游戏来说，手动回归测试成本太高。

核心原则：**LLM 负责创意（叙事、对话、氛围），引擎负责规则（AP、数值、状态转换）。** 当前的架构把太多规则执行的责任放在了 LLM 身上，导致游戏系统不可靠。

---

## 附录：调试过程中修改的文件清单

| 文件 | 修改内容 | 目的 |
|------|---------|------|
| `packages/core/src/config/ConfigManager.ts` | 添加 `findConfigDir()` 向上遍历目录树 | 修复子目录运行时找不到 config |
| `examples/westbrook-high/flow/day-end.json` | 重写 PromptBuild prompt + field label | 修复 day 计数器不递增 |
| `examples/westbrook-high/flow/force-sleep.json` | 新建，ApplyState 硬编码 `phase=night_done` | 修复 sleep 无限循环 |
| `examples/westbrook-high/session.json` | Choice 加 stateKey，Branch 加 sleep 检查，加 do-force-sleep 步骤 | 路由 sleep 到 force-sleep flow |
| `examples/westbrook-high/initial_state.json` | 添加 `nightChoice` state key；`todayWorldEvents` 等从 array 改为 string | 支持 sleep 检查；修复类型不匹配 |

## 附录：调试中使用的常用命令模式

```bash
# 启动新游戏
kal debug --start --force-new

# 做选择并推进
kal debug --continue --input explore --run-id "$RUN"

# 查看完整 state
kal debug --state --run-id "$RUN"

# 提取关键 state 变化（自己写的 python 过滤）
kal debug --continue --input sleep --run-id "$RUN" 2>/dev/null | python3 -c "
import json,sys; d=json.load(sys.stdin)
cv=d.get('state_summary',).get('changed_values',{})
if 'day' in cv: print('Day:', cv['day'])
"

# 批量推进（end_day + sleep 循环）
for i in $(seq 1 35); do
  kal debug --continue --input end_day --run-id "$RUN" 2>/dev/null > /dev/null
  kal debug --continue --input sleep --run-id "$RUN" 2>/dev/null | python3 -c "..."
done

# 完整 state 摘要（自己写的 python 脚本）
kal debug --state --run-id "$RUN" 2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
s = data['state']
print('Day', s['day']['value'], '| AP:', s['ap']['value'], '| Phase:', s['phase']['value'])
print('Suspicion:', s['suspicion']['value'])
for npc in ['lily','marcus','coach','zoe','tyler','holloway']:
    print(f'  {npc:10s} trust={s[f\"trust_{npc}\"][\"value\"]:3d}  mood={s[f\"mood_{npc}\"][\"value\"]:3d}')
print('Topics:', len(s['topicCards']['value']), '| Evidence:', len(s['evidenceCards']['value']))
"
```

这些脚本本身就说明了问题——如果 debug 命令原生支持 `--diff` 和 `--watch-keys`，上面大部分 python 胶水代码都不需要写。
