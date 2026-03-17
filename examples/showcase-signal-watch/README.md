# 风暴信标值守

一个专门为当前 KAL 能力面做的小型 Showcase：你是海岬信标站的值守员，要在连续四个风暴夜里守住灯塔、引导船只，并尽量多救下一些人。

## 为什么适合做 Showcase

- 15 分钟内可以完整玩完一局
- `session.json` 只负责交互节奏：开场 → 回合输入 → 胜负检查 → 结局
- `flow/main.json` 负责把玩家行动交给 LLM 解析，并把结构化状态写回
- `initial_state.json` 里的资源条会持续变化，能直接体现 Session / Flow / State 的分工

## 核心状态

- `night`: 当前夜晚
- `fuel`: 灯塔燃料
- `towerIntegrity`: 塔体完整度
- `crewMorale`: 值守人员士气
- `shipsSaved`: 已救下船只数
- `stormPressure`: 风暴压力
- `weather`: 当前海况
- `inventory`: 可用物资
- `status`: `active / victory / defeat`

## 运行

```bash
export OPENAI_API_KEY=sk-...
export OPENAI_BASE_URL=https://api.openai.com/v1

kal lint examples/showcase-signal-watch
kal play examples/showcase-signal-watch
```

如果你只想验证 Session 外壳和状态机可以走通，可以先跑一次 dry-run：

```bash
kal smoke examples/showcase-signal-watch \
  --dry-run \
  --steps 6 \
  --input "先加固灯室窗框，别让海风把镜片震碎" \
  --input "点亮主灯并连续发出引航闪光" \
  --input "发射信号弹，提醒礁石外侧那艘货船转向" \
  --input "把剩余燃料集中到主灯，撑到天亮"
```

## 推荐玩法

- 优先保证 `fuel` 和 `towerIntegrity` 不要掉到 0
- `shipsSaved >= 2` 是主要胜利目标
- 每回合只做一个具体动作，结果会更稳定
- 如果你消耗了物资，模型会同步更新 `inventory`
