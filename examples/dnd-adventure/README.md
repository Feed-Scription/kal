# DND 单人冒险

基于 KAL-AI 的 DND 风格文字冒险游戏，展示 session 交互壳与 flow 编排层的分工。

## 世界观

经典奇幻 DND 单人冒险。玩家是初出茅庐的冒险者，来到边境小镇"鸦巢镇"。镇上被废弃矿井中苏醒的亡灵巫妖所困扰，镇长请求玩家深入矿井摧毁巫妖的命匣。

三幕结构：
- 第一幕：鸦巢镇 — 收集信息、购买装备、接受任务
- 第二幕：废弃矿井 — 探索、战斗、解谜
- 第三幕：巫妖巢穴 — 最终对决

## Flow 架构

```text
session.json (Session 交互壳)
  intro(RunFlow) → turn(Prompt→main) → check(Branch) → death/victory/turn

main.json (主编排)
  SignalIn → SubFlow(narrate) → JSONParse → WriteState → SignalOut

narrate.json (叙事子流程，支持前缀缓存)
  SignalIn ─────────────────────────────→ Message(user)
  PromptBuild[static: 角色+世界观+规则] → Message(system)   → GenerateText → SignalOut
  PromptBuild[dynamic: 状态字段]        → Message(context)

intro.json / start-adventure.json (静态叙事)
  PromptBuild → SignalOut

outro.json (结局叙事)
  PromptBuild → Message → GenerateText → SignalOut
```

- `session.json`：只负责用户交互和跳转，保留 `RunFlow / Prompt / Choice / Branch / End`
- `narrate.json`：封装 LLM 交互逻辑，prompt 拆分为 static（固定角色设定、世界观、规则，可缓存）和 dynamic（每轮变化的状态），动态部分通过 Message 的 `context` 输入注入到 user 消息中
- `main.json`：编排层，调用 narrate 子流程后解析 JSON 并回写状态
- `intro.json`、`start-adventure.json`：静态文案下沉到 flow，由 session 统一调用
- `outro.json`：统一结局流程，通过 `when` 条件片段根据 `state.questStage` 自动切换胜利/死亡叙事

## 运行

```bash
kal play examples/dnd-adventure
```

## 状态

| Key | 类型 | 说明 |
|-----|------|------|
| playerName | string | 玩家名称 |
| race | string | 种族 |
| class | string | 职业 |
| background | string | 角色背景 |
| health | number | 当前生命值 |
| maxHealth | number | 最大生命值 |
| gold | number | 金币 |
| currentLocation | string | 当前位置 |
| inventory | array | 背包物品 |
| questStage | string | 任务阶段 |
| history | array | 对话历史 |
