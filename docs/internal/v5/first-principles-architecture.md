# KAL 架构收敛清单：删掉什么、保留什么、重构什么

**状态：设计说明**

这不是一份“愿景文档”，而是一份从第一性出发的收敛清单。

目标只有一个：回答 KAL 接下来应该变成什么，不应该变成什么，以及哪些复杂度必须立刻砍掉。

## 一、先说结论

KAL 不应该继续朝“大而全的 AI 平台”发散。

KAL 更准确的定位应该是：

`一个 contract-first、agent-friendly、以游戏循环验证为中心的 AI 原生运行时。`

翻成更直白的话：

- 它不是通用 AI 基础设施平台
- 它不是 UI 组件库
- 它不是 MCP 平台本身
- 它不是让人手搓复杂 JSON 的低层协议

它真正要解决的问题是：

`让 agent 和开发者以最低认知成本，生成、运行、调试、验证一个 AI 原生游戏循环。`

如果某个能力不直接服务于这件事，就应该暂缓，甚至删掉。

## 二、第一性约束

不管实现细节怎么变，KAL 都绕不过下面 5 个约束。

### 1. 模型不擅长维护重复真相

模型可以很好地：

- 选择一个节点
- 填一个配置
- 连接一段业务逻辑

但它不擅长长期稳定地同时维护：

- 运行时代码里的真实 contract
- 文档里的 contract
- flow JSON 里手写的 contract
- editor 里缓存的 contract

所以任何重复声明的事实，最终都会漂移。

### 2. 错误暴露越晚，第一版质量越差

如果错误要等到：

- flow 执行时
- LLM 调用后
- day loop 跑了几轮之后

才暴露，那么第一版质量一定低。

所以高价值系统应该把错误尽量前移到：

- 生成时
- 保存时
- lint 时
- smoke test 时

### 3. 自由度不是越多越好

对模型来说，最昂贵的不是“能力不够”，而是“低价值但高组合爆炸的自由”。

典型例子：

- 手写每个节点实例的 inputs / outputs
- 手写 port 类型
- 手写重复的 prompt plumbing
- 手写容易漂移的示例模板

这些不是高价值创造力，只是机械负担。

### 4. 机器接口和人类接口必须分开

如果一个输出既想给人看，又想给 agent 解析，最后通常两边都做不好。

所以：

- 人类调试输出应该追求可读性
- 机器输出应该追求纯净、稳定、低熵

### 5. 长程稳定性不能靠人工 debug 证明

`kal debug --continue` 适合定位问题，不适合证明系统稳定。

只要任务具备：

- 多轮状态累积
- LLM 随机性
- 会话历史
- 长路径依赖

那么稳定性验证就必须有最小自动化能力。

## 三、KAL 现在真正是什么

从本质上说，KAL 不是“游戏引擎”这个词常让人想到的那种图形引擎。

KAL 更像：

`一个带状态、带会话、带 LLM 节点的可执行 DSL。`

它的核心对象只有 4 个：

- `Node`：最小能力单元
- `Flow`：DAG 逻辑
- `Session`：交互壳和节奏
- `State`：游戏长期事实

Engine 的职责是把这套 DSL 变成：

- CLI
- HTTP API
- Debug / Play / Serve 等可用宿主

Editor 的职责不是创作，而是审查和轻调。

这条主线不需要推翻，反而应该更明确。

## 四、KAL 不应该成为什么

下面这些方向现在不应该成为主线。

### 1. 不要变成大而全 devkit 平台

过早抽象出：

- 独立 devkit 包
- 独立 MCP server
- 完整 simulator / recorder / replayer / inspector 体系

风险很高。它们不是永远不做，而是现在做会让产品重心转移到“平台包装”，而不是“最小闭环”。

### 2. 不要变成通用前端框架

KAL 不应该自己背一整套：

- 通用 UI 组件库
- 复杂 studio 前端体系
- 产品级交互框架

近期主线应该仍然是“让 engine 足够好接前端”，而不是“自己做前端生态”。

### 3. 不要把 debug 当主要开发模型

如果一个系统需要大量依赖：

- 边运行边修
- 看错误再猜 contract
- 靠 agent 写 Python 总结调试输出

那说明它的 contract 和 validation 设计还不对。

debug 是必要工具，但不应该是主工作流。

### 4. 不要继续容忍多份真相

这是当前最根本的问题。

如果 node contract 同时存在于：

- runtime
- 文档
- skills
- flow 实例
- editor 本地理解

那 KAL 的复杂度会持续失控。

## 五、KAL 应该删掉什么

这里的“删掉”不一定是马上删代码，而是要删除作为主设计方向的地位。

### 1. 删掉“节点实例拥有静态 contract”的设计倾向

静态 contract 不应该由每个 flow 实例重复声明。

该删掉的是这种思维：

- 节点实例自己定义 inputs / outputs 才算完整
- flow JSON 是 node truth 的来源

这是错误复杂度的来源之一。

### 2. 删掉手写、漂移、示例驱动的 node 真相

凡是这类内容都不应再被视为事实源：

- 技能文档里手写的 node 类型说明
- config reference 里手写的 canonical chain
- editor 里硬编码的 node 定义

这些都应该降级为“派生物”。

### 3. 删掉“先做平台，再验证闭环”的冲动

不应优先投入：

- 重型 studio
- 完整 marketplace
- 完整插件分发机制
- 复杂的多端协议栈

这些都建立在核心 authoring / validation / debug / eval 闭环稳定之后。

### 4. 删掉机器输出里的多余熵

机器输出不应该继续混入：

- 额外日志
- 重复字段
- 同义字段的多种命名
- 为兼容旧调用者保留的模糊语义

对 agent 来说，这些都是噪音。

### 5. 删掉“第一稿靠 prompt 质量硬撑”的幻想

如果没有：

- contract-first
- lint
- recipe
- smoke test

那再好的 prompt 也只能把问题延后，而不是解决。

## 六、KAL 应该保留什么

下面这些东西是值得保留的主线资产。

### 1. 保留 Core / Engine / Editor 三层结构

这条边界总体是对的：

- `core` 负责运行时能力
- `engine` 负责项目加载和对外宿主
- `editor` 负责可视化审查

问题不在分层本身，而在每层里哪些复杂度该留、哪些该砍。

### 2. 保留 Flow + Session 的二层模型

这也是对的：

- `Flow` 负责逻辑和数据流
- `Session` 负责交互节奏

这比把一切都塞进单一 JSON 或单一状态机要清晰得多。

前提是继续压住 Session 的职责，不让它回到“堆满业务逻辑”的方向。

### 3. 保留 JSON 项目形态

项目目录 + `flow/*.json` + `session.json` + `node/` 这套形态是对 agent 友好的。

它有几个重要优点：

- 易生成
- 易版本控制
- 易局部修改
- 易被 editor 和 CLI 共同消费

### 4. 保留自定义 node 作为 escape hatch

自定义 node 不应该被削弱。

它的作用是：

- 为规则复杂度兜底
- 为差异化玩法兜底
- 为未来模板和插件留出口

但它应该是高价值 escape hatch，而不是默认开发路径。

### 5. 保留 manifest 与 runtime hooks

这两个东西都很值钱：

- manifest 是 contract 收敛的基础
- hooks 是 trace / debug / 观测的基础

它们已经是 KAL 里最像“正确抽象”的部分，应该继续往上长，而不是被边缘化。

### 6. 保留 examples 作为真实驱动器

examples 不只是 demo，而是：

- 框架能力验证器
- 文档有效性检验器
- agent workflow 的真实压测集

KAL 应该继续用 examples 反推能力，而不是先设计一个宏大平台再找场景安放。

## 七、KAL 应该重构什么

这里是最关键的一节。

### 1. 重构 contract 系统：从 instance-first 收敛到 manifest-first

这是第一优先级。

目标不是立刻改 schema，而是先改“真相归属”：

- node contract 以 runtime manifest 为准
- flow 实例不再被允许重写真相
- 文档、editor、lint、skills 从同一份 manifest 派生

更细一点：

- 静态节点应彻底 manifest-first
- 配置可推导节点要支持“由 config 推导 handles”
- 真正动态节点要显式建模动态规则

### 2. 重构 authoring 体验：从自由拼装转向 recipe-first

KAL 现在对模型暴露的 authoring 自由度仍然太高。

应该从“自由拼 JSON”收敛到：

- 小而明确的 recipe
- 少量 canonical pattern
- 从 recipe 生成 node skeleton

重点不是减少玩法自由，而是减少结构错误空间。

应该优先提供的不是“大而全脚手架”，而是几个高频 recipe：

- 纯 narration
- narration + structured state update
- history compaction
- day loop / night loop
- summary / ending

### 3. 重构 validation：从保存时校验升级为 repo 级 lint

现在很多错误虽然能在 loader 或 executor 阶段发现，但还是太晚。

应该补一层真正的一等公民能力：

- `kal lint --all`

它至少要覆盖三类问题：

- schema / contract 错误
- 语义反模式
- project 级一致性问题

例如：

- 错误连线模式
- flow outputs 与 session / subflow 使用不一致
- `WriteState` 写不存在 key
- docs / recipe 里的 canonical pattern 过期

### 4. 重构 debug：从全量原始 payload 转向双通道输出

debug 不该只有一个肥大的 JSON。

更好的形态应当是：

- `--format pretty` 给人看
- `--format agent` / `--json-strict` 给机器读

机器视角只保留最关键的信息：

- status
- blocking reason
- location
- root cause
- state delta
- next action

而完整细节应当通过 trace 或 verbose 单独拿。

### 5. 重构 LLM 可观测性：把 trace 做成正式能力

现在如果 agent 需要知道真正发给 LLM 的 messages，居然要 monkey-patch `fetch`，这说明 trace 还没有产品化。

应当正式提供：

- `debug --trace llm`
- node / llm / state delta 的结构化 trace
- 可机器消费的事件流格式

这不只是方便 debug，也能反过来支撑 eval 和数据分析。

### 6. 重构 run invalidation：从全局粗粒度 hash 到语义兼容性判断

当前 debug run 的失效逻辑是保守但很粗的：

- 任何被跟踪文件文本变化
- 整个 run 直接失效

这在正确性上可以理解，但对实际工作流太钝。

应逐步演进到：

- 语义 hash
- touched artifacts
- replay on change

也就是区分：

- 文件改了
- 运行语义一定不兼容
- 当前快照是否还能安全恢复

### 7. 重构长期验证：从人工推进转向最小 smoke 能力

比起完整 simulator 平台，当前更需要的是一把足够薄的刀：

- `kal smoke`

它应该支持：

- 按固定轮数推进
- 固定 seed
- scripted / random / 简单策略
- 输出失败位置、最近事件、状态变化

这比先做庞大的 recorder / replayer / inspector 更符合当前阶段。

### 8. 重构文档体系：从手写 API 真相转向派生文档

文档需要分层：

- 原理文档
- runtime 事实文档
- recipe 文档
- 反模式文档

其中 runtime 事实部分，能从 manifest 或 runtime 直接生成的，就不要再手写。

## 八、什么应该暂缓

以下方向并非永远不做，但不应该抢到 P0 / P1。

### 1. 暂缓完整 studio 化

这里要暂缓的是“重型、通用 IDE 化的 Studio”，不是拒绝一个服务于闭环的最小工作台。

更准确的判断是：

- Flow / Session editor 先作为 Kernel 内置 view 演进，不要在 view 注册 API 还不稳定时就强行插件化
- 官方能力如 `problems`、`prompt-preview`、`debugger`、`terminal`、`h5-preview`、`vercel-deploy` 应作为一方扩展先行 dogfood
- 等 panel / view / inspector API 被官方能力验证过，再迁移最重的编辑器视图

### 2. 暂缓完整 MCP 化

MCP 可以成为接入方式，但不应该反客为主，变成架构中心。

### 3. 暂缓平台级 marketplace

模板共享与插件生态值得做，但现在时机还早。

### 4. 暂缓复杂多模态叙事平台

在文字游戏主链没有稳定之前，多模态扩展会稀释焦点。

## 九、收敛后的目标形态

如果 KAL 收敛得足够好，理想中的开发路径应该是：

1. Agent 根据 recipe 生成项目初稿
2. `kal lint --all` 立刻挡掉结构错误
3. `kal smoke` 跑几个短程循环
4. 需要时用 `kal debug --format agent` 或 `--trace llm` 定位问题
5. 人类通过 editor 审查和微调

也就是说，主工作流应该是：

`recipe -> lint -> smoke -> debug -> polish`

而不是：

`先生成一堆 JSON -> 跑崩 -> debug -> 修 -> 再跑崩`

## 十、P0 / P1 / P2

### P0：必须尽快做

- ~~修正 `build-game` 和相关文档中的错误 canonical pattern~~ ✅ 已完成（`ApplyState` → `WriteState` 全局同步）
- 明确 node contract 以 manifest 为准（部分完成：lint 已校验 manifest，但 flow schema 仍允许 instance-first）
- ~~增加 `kal lint --all`~~ ✅ 已实现为 `kal lint`（session 校验、unused flow、state key 检查、deep node validation）
- ~~增加 `kal debug --format agent` 或 `--json-strict`~~ ✅ 已实现（支持 `--format json|pretty|agent`）
- 增加最小 `LLM trace`（部分完成：hooks 基础设施已就绪，`registerLLMTraceHooks` 已写好但尚未接入 debug 命令输出）

### P1：应该尽快跟上

- 推出高频 recipe / scaffold（最小版本：`kal init --template minimal|game`，但不是完整 recipe 体系）
- ~~推出 `kal smoke`~~ ✅ 已实现（支持 `--steps N`、`--input`、`--dry-run`、`--format json|pretty`）
- 让文档更多从 runtime / manifest 派生（未开始）
- 改善 debug run invalidation 粒度（未确认）
- 收敛最小 Studio kernel，并让官方能力通过一方扩展 dogfood（`kal studio` 命令已存在，kernel 架构未落地）

### P2：等主闭环稳定后再做

- 更强 replay / trace / eval
- plugin / template 共享
- 更重的 studio 能力
- marketplace / 分发体系

## 十一、决策准则

以后判断一个能力要不要做，可以只问 4 个问题：

1. 它是否让第一版更不容易写错？
2. 它是否让错误更早暴露？
3. 它是否减少了 agent 需要维护的重复真相？
4. 它是否直接服务于“生成-运行-验证”闭环？

如果 4 个问题里答不上 2 个以上，就不该是近期重点。

## 十二、最后的判断

KAL 当前最缺的，不是更多功能，而是更少但更硬的结构。

真正需要的不是：

- 更大的平台
- 更多的概念
- 更花的包装

而是：

- 更单一的 contract 真相
- 更薄的脚手架
- 更强的前置校验
- 更纯净的 agent 接口
- 更低成本的长程验证

所以最狠的收敛结论是：

`删掉会让系统变重但不提高闭环效率的东西；保留已经证明有价值的运行时主线；重构 contract、validation、debug、smoke 这四个最核心的开发面。`

相关设计说明：

- [agent-debug.md](./agent-debug.md)

## 附录：Manifest-First 与 Instance-First

这部分回答一个更具体的问题：在 KAL 里，`manifest-first` 和 `instance-first` 到底是什么意思，为什么这个区别会直接影响 agent 生成质量、调试成本和版本同步。

### 一句话定义

- `manifest-first`：节点类型定义是事实源，节点实例只引用类型并填写业务配置。
- `instance-first`：节点实例自己声明自己的 contract，例如 inputs / outputs / type / config。

### 为什么这个区别重要

从第一性看，问题不在“文档写得够不够详细”，而在“谁拥有真相”。

如果真相分散在：

- 运行时代码
- 文档
- editor 本地类型
- flow JSON 里的节点实例

那么它们迟早会漂移。对 agent 来说，这意味着：

- 第一版更容易写出“看起来合法、实际不可执行”的 flow
- 错误更晚暴露，只能靠运行时 debug 发现
- 文档一旦过期，会系统性误导生成结果

如果真相收敛到 runtime manifest，那么：

- editor 从 manifest 渲染节点
- lint 从 manifest 校验 flow
- 文档从 manifest 生成
- agent 只需要决定“用哪个节点、怎么配置、怎么连业务逻辑”

这会显著减少低价值结构错误。

### Instance-First 是什么

在 `instance-first` 模式下，flow 里的节点实例会自己声明静态 contract：

```json
{
  "id": "message",
  "type": "Message",
  "inputs": [
    { "name": "system", "type": "string" },
    { "name": "user", "type": "string" }
  ],
  "outputs": [
    { "name": "messages", "type": "ChatMessage[]" }
  ],
  "config": {
    "historyKey": "history"
  }
}
```

这里的问题不是“写得长”，而是：调用方实例有权重新声明被调用方 contract。

只要 flow JSON 里的上下游写得前后一致，loader 就可能接受它；但它未必真的符合 registry 里 `Message` 节点的真实实现。

### Manifest-First 是什么

在 `manifest-first` 模式下，节点 contract 收敛到节点类型层：

- `type`
- `label`
- `category`
- `inputs`
- `outputs`
- `configSchema`
- `defaultConfig`

这些字段只在 registry / manifest 中定义一次。flow 里的节点实例只保留和业务有关的信息：

```json
{
  "id": "message",
  "type": "Message",
  "config": {
    "historyKey": "history"
  }
}
```

然后由 runtime / editor / lint 去查询 `Message` 的 manifest，得到：

- 有哪些输入输出端口
- 端口类型是什么
- config 允许哪些字段
- 默认值是什么

### KAL 当前处于什么状态

KAL 现在不是纯粹的 `instance-first`，也还没有真正做到 `manifest-first`，而是一个混合态：

已经具备 `manifest-first` 雏形：

- `NodeManifest` 已存在，见 `packages/core/src/types/node.ts`
- `NodeRegistry.exportManifests()` 已可导出 manifest
- Engine 已通过 `GET /api/nodes` 暴露 manifest
- Editor 已经在用 runtime manifest 驱动节点面板和通用节点渲染

但 flow schema 仍保留明显的 `instance-first` 特征：

- 每个节点实例在 `flow/*.json` 中继续声明 `inputs` / `outputs`
- `FlowLoader` 主要校验实例自带的 handles 是否自洽
- 节点真实实现与实例声明之间没有被收敛到单一事实源

所以当前更准确的说法是：

`KAL 已经在 UI / API 层走向 manifest-first，但在 flow authoring 层仍然偏 instance-first。`

### 一个最直观的例子

`Message` 节点的真实实现里，`system` 输入按 `string` 处理，见 `packages/core/src/node/builtin/llm-nodes.ts`。

但如果文档或 flow 实例把它写成：

```json
{ "name": "system", "type": "ChatMessage[]" }
```

问题就来了：

- 文档可能把它教给模型
- flow 可能据此生成错误连线
- editor 可能照单全收
- 最后只能在运行时或者人工排查时发现异常

这就是 `instance-first` 容易带来的漂移成本。

### 从第一性看，KAL 为什么更适合 manifest-first

#### 1. agent 不擅长维护重复真相

模型可以很好地“选择一个节点并填写参数”，但不擅长长期稳定地维护：

- 节点真实 contract
- 文档里的 contract
- flow 实例里手写的 contract

重复声明越多，误差越大。

#### 2. 正确写法应该比错误写法更便宜

如果一个节点实例需要手写完整 `inputs/outputs`，模型就有机会写错：

- handle 名称
- handle 类型
- required/defaultValue
- 与实现不一致的旧接口

这些都不是高价值创造力，只是低价值机械负担。

#### 3. 错误应该尽量前移

如果 contract 真相在 manifest 里，那么很多错误可以在生成后立即暴露：

- type 不兼容
- 使用了不存在的 handle
- config 字段拼错
- 文档示例和 runtime contract 不一致

这比运行到 session / flow / LLM 调用时再炸成本低很多。

### 这不意味着什么

`manifest-first` 不等于以下几件事：

- 不等于取消自定义节点
- 不等于所有节点都必须是静态端口
- 不等于 flow 里完全没有结构信息
- 不等于放弃自定义 prompt 或自由编排

它只是在说：

`静态 contract 不应由每个实例重复声明。`

### 自定义节点会不会受影响

不会，反而更清晰。

自定义节点仍然应该保留在 `node/` 下实现，注册后自动生成 manifest。flow 实例仍然只需要：

- `id`
- `type`
- `config`
- 可能的 `ref`
- UI 元信息

也就是说，自由度仍然在，只是 contract 统一回收到了类型层。

### 动态端口怎么办

并不是所有节点都能完全静态化。可以分三类看：

#### 1. 静态节点

如 `Message`、`GenerateText`、`JSONParse`。

这类节点最适合彻底 `manifest-first`。

#### 2. 配置可推导节点

如某些节点的输出端口由 `config` 决定。

这类节点也可以走 `manifest-first`，但 manifest 需要支持“由 config 推导 handles”的机制，而不是让实例随便写。

#### 3. 真正动态节点

如 `ReadState` 这类可能根据 `config.keys` 产生动态 outputs 的节点。

这类节点可以保留有限的动态能力，但也应当：

- 在 manifest 中明确“这是动态节点”
- 给出动态规则
- 让 lint 和 editor 知道如何推导或放宽校验

重点不是“禁止动态”，而是“动态规则也要被显式建模”。

### 对 KAL 的更具体含义

如果 KAL 继续往 `manifest-first` 收敛，比较合理的目标形态是：

#### Flow 实例层

节点实例只描述：

- 我是什么节点
- 我叫什么 id
- 我的 config 是什么
- 我在图上的位置在哪里

#### Runtime / Registry 层

节点类型定义统一描述：

- ports
- port types
- config schema
- default config
- 是否支持动态 handles
- 动态 handles 的推导规则

#### Tooling 层

- Editor 从 manifest 渲染节点和配置表单
- Lint 从 manifest 校验 flow
- 文档从 manifest 生成或半自动生成
- recipe / scaffold 从 manifest 约束生成结果

### 迁移不需要一步到位

没必要把现有 schema 一次性推翻。更现实的路线是分三步：

#### P0：先收敛真相

- 把 node 文档改成以 runtime manifest 为准
- 修掉错误示例和错误 canonical chain
- 增加 lint，检查 flow 实例声明与 registry manifest 是否一致

#### P1：让实例声明变成冗余字段

- 允许老 flow 继续携带 `inputs/outputs`
- 但 loader 以 manifest 为准，实例声明只作为兼容字段
- 一旦不一致，直接报错或警告

#### P2：再考虑收缩 schema

- 新 schema 里不再要求节点实例手写静态 `inputs/outputs`
- 对少数动态节点引入显式的动态 contract 机制

### 一个判断标准

如果某个信息回答的是“这个节点类型本来是什么”，它应优先属于 manifest。

例如：

- `Message` 有哪些输入输出
- `GenerateText` 支持哪些 config 字段
- `WriteState` 的默认行为是什么

如果某个信息回答的是“这个节点实例在当前业务里怎么用”，它应优先属于实例。

例如：

- `historyKey` 用哪个 state key
- 当前 prompt 文本怎么写
- 当前 SubFlow 指向哪个 `ref`

### 总结

`instance-first` 的核心问题不是“重复”，而是“每个实例都可能重写真相”。

`manifest-first` 的核心价值不是“更优雅”，而是：

- 真相集中
- 错误前移
- 文档、editor、lint、agent 共享同一份 contract

对 KAL 来说，最准确的判断不是“现在要彻底改成 manifest-first”，而是：

`KAL 已经在一半路上，下一步应该继续把 node contract 的事实源从实例层收回到 manifest 层。`
