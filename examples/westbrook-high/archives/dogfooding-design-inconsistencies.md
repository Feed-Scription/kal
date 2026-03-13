# Westbrook High 设计一致性测试报告

测试方法：使用 `kal debug` 命令实际运行游戏，做出玩家选择，对比 `design/` 目录下的设计文档与实际运行结果。

---

## P0 — 阻断性问题（游戏无法正常推进）

### 1. 天数计数器不递增（已修复）
- **设计**: 每天结束后 day+1，游戏共 36 天
- **实际**: day-end.json 的 LLM prompt 标签写成"当前天数（已+1后的值）"，导致 LLM 误以为值已递增，返回原值
- **修复**: 重写 day-end.json prompt，明确使用 `currentDay` 命名和 `nextDay = currentDay + 1` 的计算步骤，附带示例
- **状态**: ✅ 已修复并验证

### 2. 夜间 sleep 动作不触发 night_done（已修复）
- **设计**: 选择"休息/结束今天"应设置 `phase: "night_done"` 进入 day-end 流程
- **实际**: LLM 有时不返回 `phase: "night_done"`，导致游戏卡在 night-action 循环中无限重复
- **修复**: 在 session.json 中添加 `stateKey: "nightChoice"` 存储玩家选择，check-night-end Branch 检查 `nightChoice == 'sleep'` 时路由到 force-sleep flow（用 ApplyState 硬编码 `phase = "night_done"`），绕过 LLM
- **状态**: ✅ 已修复并验证（成功从 Day 1 推进到 Day 37）

### 3. 新卡牌（topicCards/evidenceCards）永远不写入 state
- **设计**: 探索、对话、窃听等行动可获得话题卡和证据卡（rules.md 卡牌获取途径表）
- **实际**: LLM 正确返回 `newCards` 字段（如 `maya_notebook`, `holloway_key`, `forum_rumors`），但没有任何节点将其追加到 state 数组
- **根因**:
  - day-action.json / night-action.json 的 ApplyState `allowedKeys` 不包含 `topicCards` / `evidenceCards`
  - ApplyState 只能替换整个值，不能追加到数组
  - 引擎中不存在 AppendArray / MergeState 节点类型
- **影响**: 整个卡牌系统完全失效。调查深度无法推进（需要证据卡），对质系统无法使用（需要话题卡+证据卡）
- **建议**: 需要在引擎层新增 `AppendArray` 节点，或在 flow 中用 ReadState + JS 拼接 + ApplyState 实现

---

## P1 — 严重偏差（核心系统与设计不符）

### 4. AP 消耗完全由 LLM 控制，不可靠
- **设计**: 探索=1AP, 对话=0AP, 手机=1AP, 潜入=2AP, 窃听=1AP, 社团=1AP
- **实际**: AP 消耗写在 narrate.json prompt 中让 LLM 自行计算，LLM 经常：
  - 不扣 AP（连续 explore 两次后 AP 仍为 3）
  - 扣错数量（潜入应扣 2 但只扣 1）
  - end_day 时直接设为 0（正确行为但掩盖了之前未扣的问题）
- **建议**: AP 消耗应在 session.json 中用 ApplyState 硬编码，不依赖 LLM

### 5. NPC mood 值超出 [0,100] 范围
- **设计**: mood 范围 [0, 100]，初始值 50（中性）
- **实际**:
  - `mood_marcus` 在 Day 1 就变成 -2（低于 0）
  - `mood_zoe` 降到 0 或 1
  - `mood_lily` 降到 15（合理但下降过快）
- **根因**: narrate.json prompt 说"npcChanges 中的数值必须是绝对值且在 0-100 范围内"，但 LLM 不总是遵守
- **建议**: ApplyState 节点应内置 clamp(0, 100) 逻辑，或在 flow 中加后处理节点

### 6. NPC trust 变化幅度与设计不符
- **设计**: 正面对话 +3~+8, 帮助 +5~+15, 威胁 -5~-15, 被抓说谎 -10~-25
- **实际**:
  - `trust_lily` 从 10 跳到 45（+35，远超设计上限 +15）
  - `trust_zoe` 从 35 降到 5（-30，仅对话就降这么多不合理）
  - `trust_holloway` 从 20 降到 5（-15，窃听不应直接影响信任）
- **根因**: LLM 返回的是绝对值而非增量，但有时计算错误

### 7. 调查深度（lineX_depth）不递增
- **设计**: 收集足够证据卡后调查深度应从 0→1→2→3→4 递增
- **实际**: lineA_depth 从 0 变到 1 后再未变化，lineB 和 lineC 始终为 0
- **根因**:
  - 证据卡不写入 state（P0 #3），所以证据数量永远为 0
  - 没有节点检查证据数量并更新调查深度
  - `lineA_depth` 等不在 day-action ApplyState 的 allowedKeys 中（只有 `lineA_evidence` 在）

### 8. 对质系统无法触发
- **设计**: 收集话题卡+态度卡+证据卡后可发起对质，有详细的说服力公式
- **实际**:
  - `pendingConfrontation` 始终为空字符串
  - 没有任何 flow 或 session 步骤允许玩家发起对质
  - day-action Choice 选项中没有"对质"选项
- **建议**: 需要在 day-action 中添加对质选项，或在满足条件时自动触发

### 9. 派系信任始终为 0
- **设计**: 参加社团活动增加派系信任，25/50/75 解锁不同信息
- **实际**: 选择 `club` 后 LLM 生成叙事但 `faction_*` 值从未改变
- **根因**: day-action.json ApplyState allowedKeys 包含 `faction_*`，但 LLM 不在 stateChanges 中返回派系信任变化

---

## P2 — 中等偏差（子系统缺失或不完整）

### 10. 手机解锁检查缺失
- **设计**: Day 1 无手机功能，Day 2 解锁社交媒体，Day 4 解锁私信，Day 7 解锁匿名论坛，Day 14 解锁匿名行动
- **实际**:
  - Day 1 夜间选择"浏览社交媒体"时，night-action flow 直接执行并生成内容
  - 之前尝试添加 Branch 检查但因 Choice 步骤必须有 flowRef 而失败
  - 手机解锁状态由 day-end 正确更新，但没有前置检查阻止未解锁功能的使用
- **建议**: 在 night-action flow 内部添加条件检查，或修改 session.json 的 night-action 选项为动态生成

### 11. 社交媒体帖子生成系统未实现
- **设计**: 每天夜间开始时生成 NPC 社交媒体帖子，有概率公式（base_rate × mood_modifier × arc_modifier）
- **实际**: `todaySocialPosts` 始终为空字符串，没有独立的社交媒体生成 flow
- **影响**: 玩家浏览社交媒体时看到的内容完全由 narrate flow 即兴生成，不遵循设计的概率系统

### 12. 匿名论坛内容系统未实现
- **设计**: 70% AI 生成 + 30% 预设内容，含真线索(20%)、红鲱鱼(15%)、校园八卦(35%)、加密消息(5%)、NPC 匿名帖(25%)
- **实际**: 没有独立的论坛内容生成系统

### 13. 怀疑值衰减未实现
- **设计**: 每天 -2 衰减（最低 0）
- **实际**: world-tick.json 中 LLM 有时会降低 suspicion，但不是固定 -2/天的机制
- **建议**: 在 day-end flow 中硬编码 `suspicion = max(0, suspicion - 2)`

### 14. NPC 弧线推进条件未检查
- **设计**: 每个 NPC 有 3 个骨架节点，基于信任值和天数触发（如 Lily 节点2: trust>40 或 Day 12+）
- **实际**: `arc_lily` 从 1 变到 2（可能是 LLM 自行决定的），但没有系统性的条件检查
- **根因**: 没有专门的弧线推进 flow，完全依赖 LLM 在叙事中自行判断

### 15. 历史记录中出现 NULL 内容
- **实际**: history 数组中 assistant 消息的 content 有时为 null（如 history[7]），导致后续 LLM 调用上下文断裂
- **根因**: 可能是 GenerateText 节点在某些情况下返回 null，或 assistantPath 提取失败

---

## P3 — 轻微偏差（体验问题）

### 16. 位置系统过于简化
- **设计**: 10 个地点，各有可用时段、常驻 NPC、特殊功能
- **实际**:
  - 没有时段限制（任何时间都能去任何地点）
  - 没有常驻 NPC 系统（LLM 随机决定谁在哪里）
  - 天台和教师办公室应需要"潜入"（2AP）但没有区分

### 17. 关键日事件系统不完整
- **设计**: Day 5 首次对质机会, Day 8 匿名论坛出现加密消息, Day 12 Lily 弧线节点2, Day 15 学校开始注意调查...
- **实际**: `isKeyDay` 在 Day 1 为 true，之后一直为 false。没有按设计文档的关键日列表触发特定事件

### 18. 玩家风格标签未更新
- **设计**: 5 维度（empathetic, aggressive, deceptive, methodical, connected），根据玩家行为动态更新
- **实际**: playstyle 所有维度始终为 0，没有任何 flow 更新这些值

### 19. NPC 命运系统未实现
- **设计**: 6 个 NPC 各有 pending/saved/abyss/neutral 命运状态
- **实际**: `npcFates` 所有 NPC 始终为 "pending"

### 20. 叙事风格偶尔偏离设计
- **设计 (soul.md)**: 冷峻写实，禁止感叹号，用短句，描写行为而非情绪
- **实际**: LLM 大部分时候遵守，但偶尔出现过度描写或情绪化表达。有时 LLM 在 JSON 前输出思考过程文本（如"这里我将根据你提供的背景信息..."），虽然 JSONParse 能处理但不理想

### 21. 历史压缩未触发
- **设计**: session.json 中 `history.length >= 16` 时触发 compact-history
- **实际**: 历史长度达到 18 条但未触发压缩（可能是 compact-check 分支条件不支持 `.length` 属性访问）

---

## 完整 36 天通关测试结果（Day 1 → Day 37 结局）

测试日期：2026-03-13，使用 `kal debug` 命令完成完整通关。

### 最终状态快照
```
Day 37 | Stage: endgame | Suspicion: 83 | gameOver: false
Lines: A=3 B=3 C=1
Topics: 3 (仅初始卡) | Evidence: 0 | Factions: 全部 0
NPC Fates: 全部 pending | Playstyle: 全部 0
endingTruthAxis: surface | endingImpactAxis: bystander

NPC 状态:
  lily       trust=12  mood=1   fear=100  arc=2  branch=none
  marcus     trust=10  mood=20  fear=20   arc=1  branch=none
  coach      trust=5   mood=2   fear=90   arc=2  branch=none
  zoe        trust=42  mood=30  fear=15   arc=1  branch=none
  tyler      trust=22  mood=4   fear=95   arc=4  branch=none
  holloway   trust=20  mood=5   fear=35   arc=1  branch=none
```

### 通关暴露的额外问题

**22. gameOver 未在 Day 37 触发**
- 设计: day > 36 时 gameOver = true，触发结局
- 实际: day-end LLM 返回 day=37 但未设置 gameOver=true，session.json 的 `state.day > 36` 检查触发了 outro flow
- 影响: 结局流程虽然触发了，但 gameOver 状态不正确

**23. 结局轴未正确计算**
- 设计: Lines A=3, B=3 应触发 endingTruthAxis="middle" 或 "deep"
- 实际: endingTruthAxis 仍为 "surface"，endingImpactAxis 仍为 "bystander"
- 根因: day-end LLM 在 day+1>36 时应计算结局轴，但实际未返回这些字段

**24. tyler.arc = 4 超出设计范围**
- 设计: arc_stage 范围 [1, 3]，每个 NPC 只有 3 个骨架节点
- 实际: tyler 的 arc 被 LLM 设为 4，超出设计上限
- 根因: 没有 clamp 机制限制 arc 值

**25. NPC mood 全面崩溃**
- 设计: mood 初始值 50，范围 [0, 100]
- 实际: 到 Day 37，lily=1, coach=2, tyler=4, holloway=5，几乎所有 NPC mood 接近 0
- 根因: LLM 持续降低 mood 但没有恢复机制，且无 clamp 保护

**26. NPC fear 单向攀升**
- 设计: fear 应根据玩家行为双向变化
- 实际: lily=100, coach=90, tyler=95，fear 只升不降
- 根因: 与 mood 类似，LLM 倾向于持续增加 fear 值

---

## 修复优先级建议

1. **P0 #3**: AppendArray 节点 → 卡牌系统恢复（当前完全失效，阻断调查/对质核心循环）
2. **P1 #4**: AP 消耗硬编码 → 核心经济系统可靠
3. **P1 #5-6 + #25-26**: NPC 属性 clamp(0,100) + 变化幅度限制 → NPC 系统可信
4. **P1 #7**: 调查深度自动递增（基于证据卡数量）→ 调查线推进
5. **P1 #8**: 对质系统入口 → 核心玩法循环完整
6. **P2 #13**: 怀疑值每日 -2 衰减硬编码 → 防止 suspicion 失控
7. **P2 #14 + #24**: NPC 弧线推进条件检查 + arc clamp(1,3) → NPC 弧线可控
8. **P2 #10-12**: 手机子系统完善 → 信息获取渠道完整
9. **P3 #17-19**: 关键日/玩家风格/NPC命运 → 游戏深度
10. **P0 #22-23**: 结局轴计算修复 → 结局系统正确
