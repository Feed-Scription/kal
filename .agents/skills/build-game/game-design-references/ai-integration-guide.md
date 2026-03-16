# AI 集成指南

游戏中 AI/LLM 的应用模式、架构设计和实现参考。AI 是 KAL-AI 游戏的灵魂——它让每局游戏都有独特的叙事体验，而非重复消费预制内容。

---

## AI 应用全景

AI 在游戏中的应用远不止"生成事件"。以下是经过实战验证的 8 大应用场景：

| 应用场景 | KAL 实现方式 | 输入 | 输出 | 价值 |
|---------|------------|------|------|------|
| 回合模拟 | PromptBuild + GenerateText | 完整游戏状态 | 角色属性变化 + 叙事日志 | 让每回合结算有叙事感，而非纯数值跳动 |
| 随机事件 | PromptBuild + GenerateText + JSONParse | 游戏状态 + 历史 | 决策事件（叙事+选项+效果） | 无限内容池，事件贴合当前局势 |
| NPC 对话 | PromptBuild + Message + GenerateText | 角色档案 + 对话历史 + 摘要 | NPC 回复 + 玩家选项 + 效果 | 每个 NPC 有独特个性和记忆 |
| 角色生成 | PromptBuild + GenerateText + JSONParse | 角色模板 + 约束 | 人格/背景/特质/反应模板 | 每个角色独一无二 |
| 叙事总结 | PromptBuild + GenerateText | 游戏历史日志 | 多段式叙事总结 | 让结局有文学性的回顾 |
| 商品/道具生成 | PromptBuild + GenerateText + JSONParse | 游戏状态 + 约束 | 道具属性 + 推销文案 | 动态商店，每次不同 |
| 社交动态 | PromptBuild + GenerateText + JSONParse | 游戏状态 + 最近行动 | 社交帖子/评论 | 世界感和沉浸感 |
| 情境事件 | PromptBuild + GenerateText + JSONParse | 特定触发条件 + 状态 | 定制化事件内容 | 挖角、危机等高戏剧性场景 |

---

## 核心架构模式

### 模式 1：AI 生成 + 规则验证（最重要）

AI 负责创意内容，游戏规则负责验证和约束。**永远不要让 AI 直接修改游戏状态。**

```
AI 生成原始内容（叙事、数值建议）
    ↓
游戏规则验证（范围检查、条件校验、防幻觉）
    ↓
应用到游戏状态
```

在 KAL 中，这个模式通过 Flow 节点链实现：

```
PromptBuild（组装 system prompt + state 数据）
    ↓
Message（注入对话历史）
    ↓
GenerateText（调用 LLM）
    ↓
JSONParse（解析 LLM 的 JSON 输出，启用 fixCommonErrors）
    ↓
WriteState（回写 stateChanges，allowedKeys 白名单约束）
```

**关键约束**：
- `WriteState` 的 `allowedKeys` 限制 LLM 只能修改指定的 state key
- `PromptBuild` 的 `base` fragment 中明确要求数值范围（如"每项变化不超过 ±20"）
- 重大事件（死亡、胜利等）由 Session 的 `Branch` 步骤二次判定，不完全依赖 LLM 输出

**反模式**：绝不要让 LLM 直接决定任意游戏状态。所有 LLM 输出必须经过 JSONParse + WriteState 的结构化管道。

### 模式 2：优雅降级（Graceful Degradation）

每个 AI 调用都必须有后备方案。游戏在无 AI 时仍可完整运行。

```
在 KAL 中，降级通过 PromptBuild 的 `when` fragment 和 Flow 分支实现。
如果 GenerateText 调用失败，可以用 PromptBuild 的静态 `base` fragment 作为后备内容输出。
```

三层降级策略：

| 层级 | 内容来源 | 体验质量 | 何时触发 |
|------|---------|---------|---------|
| L1 | AI 实时生成 | 最佳（贴合当前状态） | 正常情况 |
| L2 | 预制内容池 | 良好（通用但有趣） | AI 不可用或超时 |
| L3 | 硬编码兜底 | 基本可玩 | 预制池也为空 |

### 模式 3：状态压缩传递

AI 不需要完整游戏状态。通过 `PromptBuild` 的 `field` fragment 精选传递给 LLM 的状态字段，降低 token 消耗、提高生成质量。

**KAL 实现**：在 `PromptBuild` 中只用 `field` fragment 引用关键 state key（如 `state.health`、`state.currentLocation`、`state.inventory`），而非注入全部状态。对于 history，用 `Message` 节点的 `maxHistoryMessages` 控制传入量，或用 `budget` fragment 控制 token 预算。

**原则**：
- 只传关键信息（角色属性、当前位置、近期历史）
- 列表类数据只传摘要（如 NPC 只传名字和关系值，不传完整档案）
- 历史只传最近 N 条（通过 `field` fragment 的 `window` 参数控制）

### 模式 4：后台预生成

KAL 当前是同步执行 Flow 的架构，每个回合的 LLM 调用在 Flow 执行期间完成。如果需要减少玩家等待时间，可以考虑：

- **精简 prompt**：通过 `PromptBuild` 的 `budget` fragment 控制上下文大小，减少 LLM 处理时间
- **缓存策略**：在 `kal_config.json` 中启用 LLM 缓存（`llm.cache.enabled: true`），相同输入不重复调用
- **历史压缩**：定期运行 compact-history Flow，用摘要替代完整历史，减少每次调用的 token 量

---

## 8 大应用场景详解

以下场景在 KAL 中均通过 `PromptBuild → Message → GenerateText → JSONParse → WriteState` 节点链实现，区别在于 prompt 设计和输出 schema。

### 场景 1：AI 回合模拟

让 AI 生成每回合的结算叙事，而非只显示"+5 学术, -3 心态"。

**KAL 实现**：在主回合 Flow 中，用 `PromptBuild` 的 `field` fragment 注入当前状态，`base` fragment 描述输出 JSON schema，`GenerateText` 调用 LLM，`JSONParse` 解析结果，`WriteState` 回写 stateChanges。

**验证要点**：
- `WriteState` 的 `allowedKeys` 白名单限制可修改的 state key
- 数值变化范围由 prompt 中的约束指令控制（如"每项变化不超过 ±20"）
- 重大事件（死亡、胜利等）由 Session 的 `Branch` 步骤二次判定

### 场景 2：AI 随机事件

在 PromptBuild 中描述事件生成规则，让 LLM 生成包含叙事和选项的 JSON。

**事件 JSON Schema**（在 PromptBuild 的 `base` fragment 中描述）：
```json
{
  "narrative": "情境描述（2-3句）",
  "stateChanges": { "health": -10, "gold": 20 },
  "choices": [
    { "label": "选项文字", "consequence": "选择后果描述" }
  ]
}
```

### 场景 3：AI NPC 对话

通过 `Message` 节点的 `historyKey` 按 NPC 分离对话历史，`PromptBuild` 注入 NPC 人格和关系状态。

**关键设计**：
- **对话摘要**：每次对话结束后，用单独的 Flow 让 AI 生成一句话摘要，写入 NPC 对应的 state key
- **关系追踪**：在 state 中维护每个 NPC 的关系值，通过 `field` fragment 注入 prompt
- **轮数控制**：在 Session 中用 `Branch` 检查对话轮数 state，超过上限自动结束

### 场景 4：AI 角色生成

用 `GenerateText` + `JSONParse` 生成结构化角色档案，通过 `WriteState` 写入角色相关 state key。

**prompt 中描述的输出 schema**：
```json
{
  "personality": "人格类型标签",
  "bio": "1-2 句背景描述",
  "traits": ["特质1", "特质2", "特质3"],
  "background": "详细背景故事"
}
```

**后备数据**：在 Session 的 `Choice` 步骤中提供预制角色选项，AI 生成作为"自定义"选项的实现。

### 场景 5：AI 叙事总结

游戏结束时，用专门的 outro Flow 生成文学性回顾。

**KAL 实现**：`PromptBuild` 用 `field` fragment 注入 `state.history`（或 `state.summary`）和关键状态，`base` fragment 描述总结格式要求，`GenerateText` 生成叙事，通过 `SignalOut` 输出给 TUI 展示。

**历史精选**：用 `Message` 节点的 `maxHistoryMessages` 控制传入的历史量，或用 `PromptBuild` 的 `budget` fragment 控制 token 预算。

### 场景 6：AI 商品/道具生成

动态生成游戏内商品。在 prompt 中描述商品 schema 和约束（价格范围、效果范围、智商税概率），`JSONParse` 解析后通过 `WriteState` 写入 inventory 等 state。

### 场景 7：AI 社交动态

生成游戏世界中的社交媒体内容。用 `PromptBuild` 的 `field` fragment 注入当前游戏状态作为上下文，让 LLM 生成贴合当前局势的社交帖子。

### 场景 8：AI 情境事件

针对特定游戏情境（如挖角、危机）生成定制化事件。通过 `PromptBuild` 的 `when` fragment 根据 state 条件决定是否触发特殊事件 prompt。

---

## 设计阶段的 AI 规划

在 `design/ai-plan.md` 中，应明确规划 AI 的应用范围。以下是需要回答的关键问题：

### AI 应用清单（Phase 0c 深化时确认）

| 问题 | 选项 | 影响 |
|------|------|------|
| 回合结算是否用 AI？ | 纯数值 / AI叙事+数值 / 纯AI | 决定是否需要自定义 Node 做确定性计算后备 |
| 事件是否用 AI 生成？ | 纯预制 / 混合(推荐) / 纯AI | 决定预制事件池大小 |
| 是否有 NPC 对话？ | 无 / 模板对话 / AI对话 | 决定是否需要独立的对话 Flow + 按 NPC 分离的 history |
| 角色是否 AI 生成？ | 预制 / AI生成+预制后备 | 决定后备人格数量 |
| 结局是否有 AI 总结？ | 纯数据 / AI叙事总结 | 决定是否需要 outro Flow 中的 GenerateText |
| 是否有动态商店？ | 固定商品 / AI生成商品 | 决定商品系统复杂度 |
| 是否有社交系统？ | 无 / 预制动态 / AI动态 | 决定社交内容量 |

### 后备内容量建议

| AI 应用 | 最低后备内容量 | 说明 |
|---------|-------------|------|
| 随机事件 | 15-20 个 | 确保无 AI 时不重复 |
| NPC 对话 | 每种开场 3-5 个模板回复 | 覆盖成功/失败场景 |
| 角色人格 | 15-25 个预制模板 | 含反应文本 |
| 社交动态 | 20-30 条 | 混合类型 |
| 商品/道具 | 10-15 个 | 含正常品和智商税 |
| 叙事总结 | 1 个通用兜底文本 | "太史公罢笔"式幽默兜底 |

---

## 实现检查清单

### Phase 4（Flow 实现）时确认

- [ ] 每个使用 GenerateText 的 Flow 都有合理的 PromptBuild fragments
- [ ] WriteState 配置了 `allowedKeys` 白名单
- [ ] Message 节点配置了 `historyKey` 和 `maxHistoryMessages`
- [ ] history state key 已在 initial_state.json 中声明

### Phase 4（Flow 逻辑）时确认

- [ ] PromptBuild 中包含数值约束指令（如"每项变化不超过 ±20"）
- [ ] JSONParse 启用了 `fixCommonErrors` 和 `fixTruncated`
- [ ] 重大事件（死亡、胜利等）由 Session Branch 二次判定，不完全依赖 LLM
- [ ] 状态传递给 AI 前通过 PromptBuild 的 field fragment 精选（只传必要字段）

### Phase 7（测试）时确认

- [ ] 通过 `kal play` 完整测试游戏流程
- [ ] 测试 LLM 返回异常 JSON 时 JSONParse 的容错能力
- [ ] 验证 WriteState 不会写入 allowedKeys 之外的 state key

---

## 本地模式（No-LLM Mode）

支持完全离线游玩是好的设计实践。在 KAL 中，可以通过以下方式实现：

- **Session Choice 分支**：在游戏开始时提供"AI 模式"/"本地模式"选择，写入 state
- **Flow 中的条件分支**：用 `PromptBuild` 的 `when` fragment 根据模式 state 决定是否包含 LLM 调用相关的 prompt
- **自定义 Node 后备**：在自定义 Node 中实现确定性公式计算，当 LLM 不可用时使用
- **预制内容**：在 PromptBuild 中用 `base` fragment 提供静态后备叙事

本地模式使用确定性公式计算所有结果，确保游戏逻辑完整。AI 模式在此基础上增加叙事包装和内容多样性。
