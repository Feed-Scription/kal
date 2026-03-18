# KAL Studio 人工测试计划

更新时间：2026-03-18

本清单用于补齐当前 `studio` 缺少端到端测试时的人工验收基线。每个测试项标注了 `【A】` 或 `【B】` 表示负责人，两人可完全并行执行，无重叠。

## 测试记录

每位测试人各填一份：

### A 组记录

| 字段 | 填写内容 |
| --- | --- |
| 测试日期 |  |
| 测试人 |  |
| 提测 commit / branch |  |
| 测试项目 | `examples/dnd-adventure` + `examples/showcase-signal-watch` |
| 浏览器 / OS |  |
| 总结论 |  |
| 备注 / 问题链接 |  |

### B 组记录

| 字段 | 填写内容 |
| --- | --- |
| 测试日期 |  |
| 测试人 |  |
| 提测 commit / branch |  |
| 测试项目 | 临时副本目录（cp 自 `examples/dnd-adventure`） |
| 浏览器 / OS |  |
| 总结论 |  |
| 备注 / 问题链接 |  |

## 建议测试数据

- A 组主路径项目：`examples/dnd-adventure`，补充 `examples/showcase-signal-watch` 验证 H5 Preview / Signal / Eval
- B 组：先 `cp -r examples/dnd-adventure /tmp/kal-test-b`，在副本上操作，避免 checkpoint / rollback / template apply 污染 A 组环境
- 两组各自独立启动 Studio 实例，使用不同端口

## 建议启动方式

```bash
# A 组：主验收项目（默认端口）
kal studio examples/dnd-adventure

# A 组：需要验证 Signal / H5 Preview / Eval 时
export OPENAI_API_KEY=...
export OPENAI_BASE_URL=...
kal studio examples/showcase-signal-watch --port 4399

# B 组：使用临时副本，指定不同端口
cp -r examples/dnd-adventure /tmp/kal-test-b
kal studio /tmp/kal-test-b --port 4400
```

## 执行规则

- `P0` 项默认必须全部通过，适合作为提测阻断项。
- `P1` 项默认应通过；如果暂时不做，可在备注中说明原因和影响范围。
- `P2` 项用于体验和回归补充，不阻塞基础提测，但应定期回看。
- 每个失败项都要补一条问题记录，至少注明复现步骤、预期结果、实际结果。
- 每个测试项前的 `【A】` / `【B】` 标记表示唯一负责人，不要交叉执行。

## 双人分工（无重叠）

按”创作与运行闭环”（A 组）和”治理、协作与工作区运维”（B 组）拆分。划分原则是按功能域归属，不按页面入口归属。

### A 组：创作与运行闭环

| 维度 | 内容 |
| --- | --- |
| 工作台 preset | `authoring`、`debug` |
| 负责功能域 | 启动连接、Flow 编辑、Session 编辑、Run / Debug / State / Problems、Config、Prompt Preview、H5 Preview、Eval |
| 负责视图 | `kal.flow`、`kal.session`、`kal.state`、`kal.config`、`kal.problems`、`kal.prompt-preview`、`kal.debugger`、`kal.h5-preview`、`kal.prompt-eval` |
| 负责面板 | `kal.problems.panel`、`kal.debugger.trace-panel`、`kal.debugger.state-diff-panel` |
| 负责 Inspector | `kal.state.inspector`、`kal.prompt-preview.inspector`、Node tab（节点类型/端口/配置） |
| 不覆盖 | review、comments、version-control、terminal、packages、templates、deploy、event-log、collaborators、extension permissions |

### B 组：治理、协作与工作区运维

| 维度 | 内容 |
| --- | --- |
| 工作台 preset | `review`、`history`、`package` |
| 负责功能域 | Review / Comments / Version Control、Terminal、Package Manager / Template Browser / Deploy、Extension 权限、Event Log / Collaborators、壳层体验（命令面板、主题、语言、侧边栏、移动端 Inspector） |
| 负责视图 | `kal.review`、`kal.comments`、`kal.version-control`、`kal.package-manager`、`kal.template-browser`、`kal.vercel-deploy` |
| 负责面板 | `kal.review.history-panel`、`kal.comments.panel`、`kal.version-control.panel`、`kal.event-log.panel`、`kal.collaborators.panel`、`kal.terminal.panel` |
| 负责 Inspector | `kal.comments.inspector`、Extension tab（capability / host / activation / runtime） |
| 不覆盖 | flow、session、run、debug、state、problems、config、prompt-preview、h5-preview、eval |

### 边界说明

- `Problems` panel 虽出现在 `review` preset 下，仍归 A 组
- `Event Log`、`Collaborators` panel 虽出现在 `debug` preset 下，仍归 B 组
- `Trace Panel`、`State Diff Panel` 虽出现在 `review` preset 下，仍归 A 组（调试数据展示）
- Inspector 按内容归属：Node / Flow / Session / State → A 组，Extension / Comments → B 组
- 两组各自登记 bug，按功能域归档，避免重复提单

## P0 启动、连接与工作台骨架

- [ ] 【A】Engine 未启动时，Studio 会停留在加载失败态，并显示可点击的重试入口。
- [ ] 【A】Engine 启动后首次进入能在合理时间内完成连接，主界面不再停留在 `Loading project`。
- [ ] 【A】侧边栏能正确显示工作区 preset、官方视图分组、项目命令、Flow 列表。
- [ ] 【A】顶部标签栏可以正常切换当前视图；存在多个标签时可关闭非当前标签且不会导致白屏。
- [ ] 【A】`Reload Project` 能重新拉取工程内容；外部手工修改 flow / session / config 文件后，Studio 刷新后能看到最新内容。
- [ ] 【A】`Disconnect` 后界面能回到未连接状态；重新连接后可恢复工作。
- [ ] 【A】状态栏会正确显示 `connected / disconnected`、当前项目名、当前 flow、保存状态、作业状态。
- [ ] 【B】`Cmd/Ctrl + K` 可以打开命令面板，搜索结果与当前项目状态匹配，执行命令后落到正确视图。
- [ ] 【A】`Cmd/Ctrl + I` 可以切换右侧 Inspector；视图切换后 Inspector 内容同步变化。
- [ ] 【B】语言切换和主题切换在刷新页面后仍然保持。

## P0 Flow 编辑闭环（A 组）

- [ ] 【A】打开已有 Flow 时，节点、边、MiniMap、画布缩放控件都能正常渲染。
- [ ] 【A】Flow 列表中的节点数量与实际画布中的节点数一致。
- [ ] 【A】新建 Flow 时，合法名称可以成功创建并自动打开。
- [ ] 【A】新建 Flow 时，空名称和非法字符名称会被阻止，并给出明确错误。
- [ ] 【A】通过画布右键菜单可以新增节点；新增后节点显示正确的 label、端口和默认配置。
- [ ] 【A】拖动节点位置后保存，再刷新页面，节点位置仍然保持。
- [ ] 【A】节点之间可以正常连线；错误连线或取消连线不会让画布状态异常。
- [ ] 【A】删除节点或边后保存，再刷新页面，删除结果仍然保持。
- [ ] 【A】节点配置修改后可以保存到项目文件；刷新页面后配置值不丢失。
- [ ] 【A】选中节点后 Inspector 会切到 Node tab，并显示节点类型、端口和配置摘要。
- [ ] 【A】执行自动布局后，节点位置会重新整理，且不会丢失节点或边。
- [ ] 【A】导出 Flow JSON 可用，导出内容与当前 Flow 一致。
- [ ] 【A】从 Flow 运行入口执行当前 Flow 时，请求成功、结果可见，异常时会有错误反馈。
- [ ] 【A】含回边的 Flow 会以差异化样式展示回边，不与普通边混淆。

## P0 Session 编辑闭环（A 组）

- [ ] 【A】打开已有 Session 时，步骤节点和边可以正确渲染，入口步骤关系正确。
- [ ] 【A】Session 不存在时，可通过工具栏创建新 Session。
- [ ] 【A】可新增并保存以下步骤类型：`RunFlow`、`Prompt`、`Branch`、`Choice`、`DynamicChoice`、`End`。
- [ ] 【A】修改步骤配置后保存，再刷新页面，配置值仍然保持。
- [ ] 【A】步骤之间的 `next`、branch condition、default 分支连线可以正确保存和恢复。
- [ ] 【A】删除步骤后保存，刷新页面不会重新出现已删除步骤。
- [ ] 【A】删除整个 Session 时，会先弹确认框；确认删除后资源消失，取消删除时不应有副作用。
- [ ] 【A】导出 Session JSON 可用，导出内容与当前 Session 一致。
- [ ] 【A】从 Session 运行入口拉起 runtime 面板时，能够创建会话并进入交互。

## P0 Run / Debug / State / Problems（A 组）

- [ ] 【A】Debugger 视图能列出已有 run；无 run 时显示空状态而不是报错。
- [ ] 【A】`New Run`、`Step New`、`Smoke Run` 三种入口都能工作，且 run 状态会刷新。
- [ ] 【A】选择某个 run 后，右侧快照区会显示状态、waiting 信息、cursor 信息和输入历史。
- [ ] 【A】`Step`、`Continue`、`Replay from Start` 的行为符合预期，不会操作到错误的 run。
- [ ] 【A】在选中的 step 上添加和移除 breakpoint 后，刷新 run 列表或切换视图不会丢失断点。
- [ ] 【A】Session Run Dialog 中，等待用户输入的步骤可以继续推进，输入值会进入 run。
- [ ] 【A】`Trace Panel`、`Debugger Summary`、`State Diff Panel` 等调试面板会随选中 run 实时更新。
- [ ] 【A】State 视图能展示当前状态 key、类型和值；无状态时显示只读空状态。
- [ ] 【A】Problems 视图在正常项目下能显示”无问题”状态。
- [ ] 【A】人为制造一个 lint / 配置错误后，Problems 视图能显示错误条目、文件位置和建议；修复后刷新可恢复为无问题。

## P0 Config 安全与持久化（A 组）

- [ ] 【A】修改普通配置字段后，保存按钮可用，保存成功后刷新页面仍能看到新值。
- [ ] 【A】保存前会显示 unsaved 提示；保存成功后提示消失。
- [ ] 【A】仅修改 `llm.apiKey` / `llm.baseUrl` 时，界面会提示这些字段受限，且保存按钮不会把它们落盘覆盖原始值。
- [ ] 【A】同时修改受限字段和普通字段时，普通字段会成功保存，受限字段保持项目文件原值。
- [ ] 【A】保存失败时，界面会给出明确错误信息，不会静默吞掉失败。

## P1 Prompt Preview / H5 Preview / Eval（A 组）

- [ ] 【A】Prompt Preview 视图能加载 preview entry 列表，搜索可过滤结果。
- [ ] 【A】在 Flow 或 Session 画布选中节点后，Prompt Preview 会高亮对应 entry，并展示最终渲染结果和 fragment 明细。
- [ ] 【A】无匹配 preview 内容时，界面显示空状态而不是异常。
- [ ] 【A】H5 Preview 可以正常加载 iframe，`Reload`、`Open in New Tab`、设备尺寸切换都能工作。
- [ ] 【A】使用 `examples/showcase-signal-watch` 时，H5 Preview 与 Studio 之间的 `SignalIn / SignalOut` 能形成闭环。
- [ ] 【A】H5 Preview 收到 preview-ready 后，state 同步和 run 同步不会重复报错或无限重渲染。
- [ ] 【A】Eval 视图能加载 flow 列表，并只列出可评测的 PromptBuild / GenerateText 节点。
- [ ] 【A】Eval 输入非法 JSON 时会立即提示错误，而不是向后端发起错误请求。
- [ ] 【A】Eval 成功运行后能看到结果摘要、数值统计、成本信息。
- [ ] 【A】保存 baseline 后再次执行 Eval，compare 结果能正确显示差异。

## P1 Review / Comments / Version Control（B 组）

- [ ] 【B】创建 Review Proposal 后，列表会新增 proposal，切到 review workspace 时能自动选中。
- [ ] 【B】Proposal 的 touched resources、语义摘要、风险说明、推荐校验项会随着工程改动更新。
- [ ] 【B】`Run Lint Smoke` 可以更新 proposal 的 validation 状态；出现诊断时可跳转到 Problems。
- [ ] 【B】`Start Comment Thread` 能基于当前 proposal 创建评论线程，并跳转到 Comments 视图。
- [ ] 【B】Comments 视图可以针对 proposal / run / resource 创建 thread，并能回复、resolve、reopen。
- [ ] 【B】评论写权限被关闭时，创建 thread、reply、resolve 等写操作会被禁用。
- [ ] 【B】Accept Proposal 成功后，proposal 状态和相关资源状态会更新。
- [ ] 【B】Rollback to Base 成功后，项目资源会恢复到 base checkpoint 对应状态。
- [ ] 【B】Version Control 视图能展示当前 git branch、clean/dirty 状态、最近提交记录。
- [ ] 【B】创建 checkpoint 后，checkpoint 列表会新增记录；比较当前状态时能看到摘要变化。
- [ ] 【B】恢复 checkpoint 后，Flow / Session / Project 内容会同步回退，且刷新后仍保持。

## P1 Terminal / Packages / Templates / Inspector 权限（B 组）

- [ ] 【B】Terminal 的 quick mode 仅允许白名单命令；合法命令能返回结果，非法命令会报错但不破坏页面状态。
- [ ] 【B】quick mode 支持回车执行、上下方向键浏览历史。
- [ ] 【B】Terminal session mode 能创建会话、接收流式输出、发送输入、发送 `Ctrl+C`、kill 会话、重建会话。
- [ ] 【B】Package Manager 能列出已安装包、kind、trust level、enabled 状态和 contributions。
- [ ] 【B】无已安装包时，Package Manager 会显示正确空状态。
- [ ] 【B】Template Browser 能按分类筛选模板、预览模板摘要，并将模板应用到当前项目。
- [ ] 【B】应用模板后，项目中的 flows / session / state 变化能在 Studio 中立即体现。
- [ ] 【B】Inspector 的 Extension tab 能展示当前视图扩展的 capability、host、activation event 和 runtime 状态。
- [ ] 【B】开关 capability grant 后，顶部和状态栏的 trusted / restricted 标识会同步变化。
- [ ] 【B】禁用再启用当前扩展后，视图能恢复，不会出现不可恢复的空白面板。
- [ ] 【B】`Reset Grants` 后 capability 状态回到默认值。

## P2 体验、兼容性与回归补充

- [ ] 【B】在窄屏宽度下，移动版 Inspector 入口按钮可见，抽屉可以正常打开和关闭。
- [ ] 【B】侧边栏折叠 / 展开后，主内容区尺寸和交互不异常。
- [ ] 【A】页面连续切换多个视图、频繁打开关闭命令面板后，不出现 React 报错、明显卡顿或状态串扰。
- [ ] 【B】Event Log Panel 能记录最近 kernel events 和 jobs；执行 run、deploy、terminal 等操作后会产生对应记录。
- [ ] 【B】Collaborators Panel 在无人协作时显示空状态；有 presence 数据时能展示用户、角色和最近活动。
- [ ] 【B】Deploy 视图在未配置时显示说明，在已配置环境下可触发 deploy、展示最近一次部署信息。
- [ ] 【A】在 Chrome 跑一遍 P0 流程，不出现浏览器特有的阻断问题。
- [ ] 【B】在 Safari 或另一个主流浏览器跑一遍 P0 流程，不出现浏览器特有的阻断问题。
- [ ] 【A】刷新页面后，以下本地状态仍应保持：断点、扩展偏好。
- [ ] 【B】刷新页面后，以下本地状态仍应保持：主题、语言、工作区 preset。

## 收尾检查

- [ ] 【A】【B】本轮测试中所有失败项都已登记到 issue / bug 清单。
- [ ] 【A】【B】本轮测试覆盖的项目、浏览器、环境变量、特殊前置条件已补充到各自的”测试记录”。
- [ ] 【A】【B】如果本轮只执行了部分清单，已明确注明未执行项和原因。
- [ ] 【A】【B】两组碰头确认：无遗漏、无重复提单、边界功能域归属无争议。
