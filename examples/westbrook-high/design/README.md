# Westbrook High

## 设计定位

- **目标美学**：叙事沉浸 + 探索发现 + 社交互动
- **核心循环**：日间在校园中探索、社交、收集线索，夜间整理信息、规划下一步，在关键对质中用证据和话术撬开真相
- **引擎映射建议**：混合模式 Session（普通日自由探索 + 关键日事件流）、多条调查线 Flow、卡牌式句子组合 Flow、NPC 弧线状态机、手机系统 Flow
- **Design Depth Tier**：Deep

## 一句话描述

你是转学生，在看似正常的高中里调查三起相互关联的谜团——你说出的每句话都在改变所有人的命运。

## 核心玩法

你刚转学到 Westbrook High。三个月前 Maya Chen 失踪，两周前调查此事的 Ethan Park 从天台坠亡。官方说是自杀，没人再提。

每天你有 3 个行动点，决定怎么度过校园生活——去哪个地点、和谁交谈、用手机做什么。普通日自由探索，关键日触发剧情事件。你收集的证据变成"卡牌"，在对质场景中与话题和态度组合打出，撬开 NPC 的防线。但证据是稀缺资源，用了就没了。NPC 的证词不一定可靠——有人说谎，有人夸大，有人遗漏。

夜间回到宿舍，浏览今天的社交媒体动态，整理证据，规划明天的方向。校园里的每个人都在过自己的生活——他们会相遇、争吵、结盟、背叛，无论你是否在场。

36 天，三条调查线互为因果。你不可能查清所有事。

## 设计说明

**转学生视角**消除了玩家和角色的信息差——都是从零开始认识这个校园。**日/夜双循环**让两种认知模式交替：日间"生活在其中"，夜间"思考发生了什么"。**3AP 固定制**让每天都是有意义的取舍——108 个总行动点不够深入三条线。**卡牌式句子组合**只在对质高光时刻使用，避免创新机制变成负担。**骨架+血肉 NPC 弧线**兼顾叙事质量和每局新鲜感。**因果链条型三线结构**没有单一反派，而是系统性悲剧——每条线都能部分解释其他线，但只有全部深入才能看到全貌。**冷峻写实叙事**用克制的观察代替渲染，紧张感来自"没说出口的东西"。

## KAL 实现映射建议

**Session 结构**：intro → day_phase（Branch: 普通日/关键日）→ night_phase → check_end → loop。普通日走 explore Flow，关键日走 event Flow。

**关键 Flow 列表**：
- `intro.json` — 开场叙事 + 角色设定
- `day-explore.json` — 普通日地点探索（AP 分配 + 行动执行）
- `day-event.json` — 关键日事件流（预设骨架 + AI 血肉）
- `phone.json` — 手机系统（社交媒体 / 私信 / 匿名论坛 / 匿名行动）
- `confrontation.json` — 对质场景（卡牌式句子组合）
- `night.json` — 夜间整理（证据管理 + 信息回顾 + 匿名行动）
- `npc-interact.json` — NPC 对话（AI 动态生成 + 关系更新）
- `world-tick.json` — 活世界推进（NPC 自主行动 + 弧线推进）
- `social-media.json` — 社交媒体动态生成
- `infiltrate.json` — 潜入禁区
- `compact-history.json` — 历史压缩
- `outro.json` — 结局叙事生成（双轴 + NPC 命运）

**核心 Node 链路**：PromptBuild（注入 NPC 档案 + 关系历史 + 调查进度 + 叙事语调）→ Message（对话历史）→ GenerateText → JSONParse → ApplyState（allowedKeys 白名单约束）

## 文件索引

| 文件 | 内容 | 实现阶段参考 |
|------|------|------------|
| rules.md | 行动经济、调查规则、对质规则、结局条件 | Phase 2 (State), Phase 4 (Flows) |
| content.md | 6 核心 NPC 档案、4 派系、三条调查线、地点、关键日事件 | Phase 6 (Content) |
| ai-plan.md | 4 大 AI 系统、后备内容需求、降级策略 | Phase 4 (Flows), Phase 5 (Nodes) |
| soul.md | 情感核心、AI 原生体验、叙事语调、玩家身份 | Phase 4 (Prompts), Phase 6 (Content) |
| subsystems.md | NPC 系统、手机系统、证据系统、对质系统、活世界系统 | Phase 2 (State), Phase 4 (Flows) |
| progression.md | 四阶段解锁、隐藏内容层级、秘密第四线 | Phase 4 (Flows), Phase 6 (Content) |
