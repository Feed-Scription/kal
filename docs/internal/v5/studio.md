# KAL Studio 设计

**状态：设计说明（重写版）**

这份文档讨论的不是“给现有 Editor 继续堆功能”，而是 KAL Studio 作为产品与平台的最小正确形态。

相关文档：

- [first-principles-architecture.md](./first-principles-architecture.md)
- [engine.md](./engine.md)

## 摘要

KAL Studio 应被定义为一个项目级、contract-first、agent-friendly、以运行验证为中心的工作台，而不是通用代码 IDE，也不是通用游戏编辑器。它面对的核心问题不是“如何支持尽可能多的插件”，而是“如何在不复制真相的前提下，把项目理解、语义级编辑、运行验证、诊断调试和 agent 协作收敛到同一个工作台中”。

本文的结论是：Studio 应采用 `Kernel + Built-in Core Views + First-party Extensions + Third-party Extensions` 的四层结构。`Flow` 与 `Session` 是当前最重、最核心、也最依赖语义模型的一组视图，因此在 Phase 1 不应被过早插件化，而应先作为 Kernel 的内置 core views 稳定下来。与之相对，`problems`、`prompt-preview`、`debugger`、`terminal`、`h5-preview`、`vercel-deploy` 等官方能力更适合先以 first-party extensions 的形式 dogfood Studio API，用来反向压测 panel、view、command、event stream 与 capability 模型是否足够。

这一判断并不是凭偏好得出，而是综合了多类一手材料后的结果：VS Code 展示了“受控贡献点 + 多宿主 + trust gate”的成熟路径；Eclipse Theia 展示了为领域工具保留更强产品集成面的必要性；IntelliJ Platform 证明了语义项目模型一旦设计错误，后续再多插件能力也难以收场；JupyterLab 则提供了一个更接近 KAL 的范式，即通过 typed tokens 和明确的 shell slots 组织工作台；Node-RED、Unity、Godot 的经验进一步说明，领域编辑器真正可复用的资产不是“所有东西都能插件化”，而是清晰的包边界、稳定的配置界面、以及可被项目内消费的安装与分发路径。

## 1. 引言

### 1.1 问题背景

KAL 当前已经具备了清晰的 runtime 主线：Core 负责执行语义，Engine 负责把 Core 暴露为 CLI、HTTP API 与 managed run protocol，而现有 Editor 已经完成了从“本地直读文件”到“经由 Engine API 工作”的关键转向。真正尚未完成的，不是再做一个更复杂的画布，而是把这三者组织成一个统一的 Studio 工作台。

如果把这个问题表述得更严格一些，Studio 需要同时满足四个条件。第一，它必须以 Engine 暴露的 canonical schema 和 runtime manifest 为唯一事实源，否则人类界面、agent 技能、运行时 contract 与文档会再次漂移。第二，它必须把编辑与运行连接成闭环，因为 KAL 的质量问题往往不是静态文本错误，而是在 flow、session 与 state 的执行过程中暴露出来。第三，它必须允许官方能力以扩展形式持续 dogfood 自己的 API，否则平台边界永远无法被真实验证。第四，它又不能在平台边界尚未成熟时，把最核心的 Flow / Session 视图一起推入插件化重构，造成“内核和核心视图同时重写”的叠加风险。

因此，KAL Studio 的问题并不是“要不要插件系统”，而是“应当先稳定什么，再开放什么”。这也是本文的主要论证对象。

### 1.2 研究问题

围绕上面的背景，本文聚焦三个设计问题。

第一，Studio 的语义模型应当由谁维护。是让每个编辑器或插件自行持有 document truth，还是由 Kernel 统一维护 resource、transaction 与 reference graph，并向视图与扩展提供派生接口。

第二，Studio 的工作台表面应如何开放。是把所有能力都降格为插件贡献，还是明确保留一层 built-in core views，用于承载当前最重的领域编辑器。

第三，官方能力应如何参与平台演进。是继续把官方能力做成内核内部实现，还是把它们当成 first-party extensions 来 dogfood API，从而让平台边界尽早接受真实压力。

### 1.3 核心判断

本文采取的立场可以概括为一句话：

`KAL Studio 应先成为一个以语义资源和运行验证为中心的领域工作台，再成为一个可扩展平台。`

“先成为工作台”意味着：Kernel 不能空心，必须持有文档模型、事务、诊断、命令、布局、保存恢复、权限与信任等基础能力；“再成为平台”意味着：官方能力应尽量通过 first-party extensions 来 dogfood，但最核心的 Flow / Session 视图在第一阶段应继续作为内置 view 存在，直到 view / panel 注册 API、inspector 接口与 run/debug 服务真正稳定。

## 2. 相关工作

### 2.1 VS Code：多宿主、受控贡献点与受限信任

VS Code 的贡献不在于“插件多”，而在于它把扩展模型压缩成了几个可治理的核心机制。首先，扩展并不只有一个运行位置。官方文档明确说明，扩展可以运行在本地 Node.js host、浏览器中的 web extension host、或远端 Node.js host，具体取决于运行环境和 `extensionKind` 的选择。[Extension Host](https://code.visualstudio.com/api/advanced-topics/extension-host) 这使 VS Code 能在 desktop、web、remote development 之间维持统一的扩展抽象，而不要求所有能力都绑定到同一个进程。

其次，VS Code 并不是允许扩展任意改动工作台，而是通过一组显式的 contribution points 来声明可扩展表面，例如 commands、views、menus、custom editors、debuggers、tasks 与 terminals。[Contribution Points](https://code.visualstudio.com/api/references/contribution-points) 这意味着平台方知道哪些表面是稳定契约，哪些表面仍然是内部实现。对 KAL 来说，这一点比“插件市场”本身更重要，因为我们同样需要控制哪些对象可以被扩展，哪些对象仍属于 Kernel 的主权范围。

但 VS Code 的经验也同时提醒我们，重型领域编辑器不宜在平台早期过度依赖 extension-owned document model。根据 [Custom Editor API](https://code.visualstudio.com/api/extension-guides/custom-editors)，一个 custom editor 的 `CustomDocument` 由扩展自行定义，多个编辑实例要由扩展自己保证同步、脏状态、undo/redo 与 save 行为。这种机制很适合图像预览、二进制可视化或辅助性编辑器，却把“文档语义”本身交给了扩展负责。对 KAL 而言，如果在平台尚未稳定时就把 Flow / Session editor 也放进这一层，实际上等于把最核心的语义与事务责任过早下放给插件壳，这会显著提高架构不稳定性。

最后，VS Code 的 [Workspace Trust](https://code.visualstudio.com/api/extension-guides/workspace-trust) 说明了另一个关键点：安全与受限模式不应由每个扩展各自发明，而应由平台统一建模。扩展只需声明 `supported`、`limited` 或 `false`，并按平台给定的信任上下文裁剪功能。对 KAL 来说，这几乎可以直接转化为 capability-based trust model：不是简单地做 trusted / untrusted 两档，而是对 `project.write`、`engine.execute`、`engine.debug`、`process.exec`、`network.fetch`、`package.install` 等能力分开授权。

### 2.2 Eclipse Theia：为产品化领域工具保留更强的集成面

Theia 提供了一个很有价值的对照组。它与 VS Code 一样重视扩展，但其官方架构文档明确指出，Theia 采用前后端双进程结构，前端与后端都拥有各自的依赖注入容器，并允许扩展向两个方向贡献能力。[Architecture Overview](https://theia-ide.org/docs/architecture/) 这意味着它从一开始就不是把“IDE”理解为一个纯前端壳，而是把产品能力拆成可以跨前端/后端演化的模块。

更重要的是，Theia 区分了至少两类扩展机制。根据 [Extensions](https://theia-ide.org/docs/extensions/)，Theia extensions 是编译时集成、可访问内部依赖注入容器的产品级模块；Theia plugins 则更接近运行时插件，依赖受限 API，并可以按连接或会话被加载。这种区分的意义在于：领域工具在演进早期往往需要保留一部分“深集成”能力，否则很多关键视图和服务会因为平台边界尚未成熟而被迫做成脆弱的插件壳。

这对 KAL 的启发非常直接。我们确实需要 runtime-installable extensions，但也需要一层明确的 Kernel 与 built-in core views 来承接当前最核心的产品职责。否则，Studio 会在尚未拥有稳定的 resource/document/transaction 模型之前，就把最难的一层交给扩展作者解决。Theia 的经验支持“不要把所有东西都做成插件”的判断。

### 2.3 IntelliJ Platform：语义项目模型比 UI 插件化更先决定平台上限

IntelliJ Platform 的一手材料最值得借鉴的，不是它有多少扩展点，而是它如何持续把“项目语义”视为平台资产。官方 [Services](https://plugins.jetbrains.com/docs/intellij/plugin-services.html) 文档把服务明确区分为 application-level、project-level、module-level 三种作用域，而且强调服务按需加载、避免在构造函数中做重初始化。这背后的思想是：平台必须先清楚哪些状态属于全局，哪些状态属于具体项目，哪些生命周期由平台托管。

更值得重视的是 JetBrains 对旧项目模型的反思。根据 [Workspace Model](https://plugins.jetbrains.com/docs/intellij/workspace-model.html)，新 API 的提出直接源于旧 project model 太早为 IntelliJ IDEA 的 Java 语境设计，导致很多核心接口带有语言和历史包袱，难以适配更一般的平台需求。这个教训对 KAL 十分重要。若 Studio 继续把 Flow、Session、State、Config、Trace、Package 当成彼此孤立的 UI 页面，而不是统一的 project resource graph，那么未来无论增加多少插件机制，rename、reference search、transaction、review、share、debug 都会在错误的数据模型上叠加复杂度。

IntelliJ 同时也展示了另一个现实：扩展点数量一旦增长，就会产生极高的平台治理成本。官方的 [Extension Point and Listener List](https://plugins.jetbrains.com/docs/intellij/intellij-community-plugins-extension-point-list.html) 已经非常庞大，这固然说明平台成熟，但也说明“先做大量扩展点，再思考边界”并不是一条适合早期产品的路线。KAL 更合理的做法是，只开放与领域问题直接相关的少量扩展面，而不是复制一个通用 IDE 平台的复杂度。

### 2.4 JupyterLab：typed tokens 与 shell slots 更接近 KAL 的工作台需求

相较于传统代码 IDE，JupyterLab 对 KAL 更具启发性，因为它组织的是 notebooks、consoles、terminals、launchers、inspectors 等异构对象，而不是只有文本编辑器。官方 [Develop Extensions](https://jupyterlab.readthedocs.io/en/4.4.x/extension/extension_dev.html) 文档明确说明，JupyterLab 用 tokens 来标识服务，而不是字符串；consumer plugin 通过 `requires` 或 `optional` 声明依赖，provider 则通过 `provides` 和 `activate` 返回服务。这种 provider-consumer 模式直接解决了两个问题：一是避免服务名冲突，二是让扩展依赖在类型层面可检查。

同样重要的是，JupyterLab 对 shell surface 的组织非常清晰。官方 [Common Extension Points](https://jupyterlab.readthedocs.io/en/3.1.x/extension/extension_points.html) 将工作台分成 `main`、`left`、`right`、`down`、`bottom`、`header` 等区域，并且为 sidebar rank 预留了 first-party 与 third-party 的推荐区间。这意味着“官方能力先用同一套扩展接口 dogfood”并不是一句口号，而是可以被布局系统与排序约定直接支持的。

对 KAL 来说，JupyterLab 提供了两个特别可迁移的思想。第一，工作台的核心不是“页面”，而是 shell slots、service tokens 与 command bus 的组合。第二，first-party extensions 不应被视为临时权宜之计，而应被视为平台 API 的标准验证器。KAL 需要的正是这种关系：官方扩展不是绕过平台，而是平台最严格的消费者。

### 2.5 Node-RED、Unity、Godot：领域编辑器真正可复用的是包边界与配置面

如果说前四类系统主要回答的是“平台如何治理”，那么 Node-RED、Unity 与 Godot 回答的是另一个问题：领域编辑器到底靠什么形成生态。

Node-RED 的官方文档把节点作者最需要处理的两件事写得非常明确。第一，节点的配置界面不是外部附属物，而是节点定义的一部分，编辑表单、默认值、校验与帮助文本都与节点一起打包。[Edit Dialog](https://nodered.org/docs/creating-nodes/edit-dialog) 第二，节点分发直接复用 npm 包机制，包通过 `package.json` 里的 `node-red` 字段暴露节点定义，并建议同时提供 examples。[Packaging](https://nodered.org/docs/creating-nodes/packaging.html) 这给 KAL 的启发是：node pack、template pack 与 studio extension 不应只是“能被安装”，而应具备可被 Studio 直接理解的 manifest、schema 与 examples 结构。

Unity 的经验则更偏向包边界治理。官方 [Package Layout](https://docs.unity3d.com/Manual/cus-layout.html) 把 `Editor`、`Runtime`、`Tests`、`Samples~`、`Documentation~` 的职责划分得非常清楚，而 [Scoped Registries](https://docs.unity3d.com/Manual/upm-scoped.html) 进一步说明，团队可以通过命名空间和私有 registry 精确控制包来源。这对 KAL 的意义不在于照搬 Unity 的目录名，而在于确认一件事：如果包结构、测试位置、文档位置与安装来源在一开始就不清晰，后续市场、模板浏览器、企业分发都会建立在不稳定地基上。

Godot 则提醒我们，领域工具需要给项目本地扩展留出自然入口。官方 [Making Plugins](https://docs.godotengine.org/en/stable/tutorials/plugins/editor/making_plugins.html) 和 [Using the Asset Library](https://docs.godotengine.org/en/stable/community/asset_library/using_assetlib.html) 说明，编辑器插件既可以由项目本地 `addons/` 目录承载，也可以通过编辑器内的 Asset Library 获取。它的价值在于把“项目本地定制”和“生态分发”放在同一条连续路径上，而不是要求所有扩展都先经过公共市场。

综合来看，这几套系统的共同结论是：领域工具生态最先需要的不是公开 marketplace，而是稳定的 package manifest、清晰的 editor/runtime/tests/docs 边界、以及项目内安装和团队内分发的最短路径。

### 2.6 对 KAL 的综合启示

把上述一手材料放在一起，可以得到五个对 KAL Studio 直接可操作的判断。

第一，扩展系统真正需要治理的是“边界”，而不是“数量”。VS Code 和 JupyterLab 的成功都建立在清楚的 contribution surface 或 shell slots 之上，而不是无限开放的 UI 改写能力。

第二，语义模型必须先于插件化稳定。IntelliJ 的 Workspace Model 反思和 VS Code custom editor 的责任边界都说明，若 document truth 分散在插件内部，平台很难为 rename、references、diagnostics、transaction 与 review 提供一致语义。

第三，领域工作台通常需要保留一层深集成能力。Theia 的 extensions 与 plugins 的区分，以及 Godot/Unity 对编辑器内能力的强约束，都表明“不是所有东西都适合在第一天做成第三方插件”。

第四，first-party dogfooding 是建立平台 API 的必要手段。JupyterLab 的 rank 与 token 机制、VS Code 的官方扩展实践，都说明平台方必须让自己的功能先经过同一套扩展接口的考验。

第五，包与分发应该晚于核心模型，但早于公开市场。Node-RED、Unity、Godot 都证明，没有稳定的包结构与可信安装路径，市场只会放大平台边界的缺陷。

## 3. KAL Studio 的设计目标

基于上述分析，KAL Studio 应围绕以下目标收敛。

### 3.1 项目优先，而非单编辑器优先

Studio 的一等对象不是单个 Flow 画布，而是整个 KAL 项目。它至少包含 `project`、`flow`、`session`、`state`、`config`、`trace`、`package`、`template` 等资源，因此工作台必须围绕 project resource graph 组织，而不是围绕“一个主画布 + 若干零散面板”组织。

### 3.2 单一事实源

Studio 不维护独立 truth。node contract 以 runtime manifest 为准，flow / session / state / config 以 Engine 暴露的 canonical schema 与 canonical data 为准。UI 使用的是派生 view model，而不是另外一份与运行时并行演化的对象模型。

### 3.3 语义级编辑与运行验证闭环

Studio 的主要价值不在于“替用户改 JSON”，而在于让用户以语义级对象工作，例如修改节点参数、prompt、引用、状态键与 session 跳转，并立刻进入 validate、run once、session play、trace replay 等验证闭环。

### 3.4 扩展优先，但内核不能空心

Studio 必须尽量把官方能力放到 first-party extensions 中 dogfood，但不能把 Kernel 缩成一个只有布局壳的空心容器。文档模型、事务、命令、诊断、reference graph、保存恢复、权限与信任必须由 Kernel 统一托管。

### 3.5 Agent 协作必须通过 proposal 与 transaction

Studio 中的 AI 助手不应直接拥有任意写文件的权限。更稳妥的模型是：agent 读取 project graph 与 diagnostics，生成结构化 proposal，Studio 将 proposal 渲染为 diff 或 transaction，人工确认后再落盘。

## 4. 提议方案：KAL Studio 架构

### 4.1 总体分层

本文建议采用如下四层结构：

```text
KAL Studio
├── Kernel
│   ├── Workbench Shell
│   ├── Resource / Document Model
│   ├── Transaction + Undo/Redo
│   ├── Diagnostics + Reference Graph
│   ├── Command Bus + Search
│   ├── View / Panel Registry
│   ├── Trust + Capability Gate
│   └── Extension Host Runtime
├── Built-in Core Views
│   ├── Flow Editor
│   └── Session Editor
├── First-party Extensions
│   ├── Problems
│   ├── Prompt Preview
│   ├── Debugger
│   ├── State Editor
│   ├── Config Editor
│   ├── H5 Preview
│   ├── Terminal
│   ├── Vercel Deploy
│   ├── Template Browser
│   └── Package Manager
└── Third-party Extensions
    ├── Nodes / Templates / Starters
    ├── Views / Panels / Inspectors
    ├── Lints / Code Actions
    └── Exporters / Share Targets / Themes
```

这四层结构的重点不在“层数”，而在责任分配。Kernel 维护所有跨视图共享的语义与生命周期；Built-in Core Views 承接最重的两个领域编辑器；First-party Extensions 负责把官方能力放到真实扩展边界上接受检验；Third-party Extensions 则只在平台稳定后逐步开放。

### 4.2 Kernel 的职责

Kernel 不是一个空工作台壳，而是 Studio 的主语义层。它至少应承担以下职责。

- 管理 resource/document model，并维护 canonical data 与 derived view model 的分层。
- 管理 transaction、undo/redo、autosave 与 patch 生成。
- 统一 diagnostics、reference graph、search 与 code action 入口。
- 统一命令系统、command palette、keybinding 与上下文表达式。
- 提供标准化的 view / panel / inspector 注册与生命周期。
- 提供 trust / capability gate，并把权限决策集中到平台层。
- 托管 extension hosts，并负责激活、停用、崩溃隔离与状态恢复。

Kernel 的根本任务只有一个：保证所有上层视图与扩展都消费同一套项目语义，而不是各自维护一份 truth。

### 4.3 Resource / Document / Transaction 模型

Studio 内部应统一采用 resource/document 模型。每个资源至少包含三层状态。

- `canonical data`：来自 Engine 的事实数据，是保存、运行与共享的唯一依据。
- `derived view model`：为 Flow 图、Session 图、Inspector、Problems、Search 等界面生成的派生结构。
- `ephemeral UI state`：选择、高亮、缩放、展开、临时过滤等短生命周期状态。

在此基础上，所有编辑都必须经过 transaction，而不是让组件直接写 store。transaction 至少需要承担四个职责：一是保证 undo/redo 和 autosave 的一致性；二是在资源修改后触发 diagnostics 与 references 的增量刷新；三是为 review、share 与 agent proposal 生成稳定 patch；四是在跨资源操作中维护 rename、delete、extract subflow 等变更的一致性。

这也是为什么 Flow / Session editor 在第一阶段不适合先插件化。它们不是简单的“视图渲染器”，而是 transaction、reference graph、diagnostics、run/debug 对照的重度消费者。若平台还没有先把这些能力稳定下来，就让插件负责其生命周期，风险过高。

### 4.4 Built-in Core Views：先内建 Flow / Session，再决定何时外移

`kal.flow-editor` 与 `kal.session-editor` 的目标并不是永远留在内核，而是不要在最脆弱的阶段同时承担“平台 API 设计”和“核心视图迁移”两份风险。基于这一点，Phase 1 应将它们定义为 Kernel 的 built-in core views。

这样做有三个直接收益。第一，可以直接承接当前 `Flow.tsx` 与 `SessionEditor.tsx` 的语义资产，而不是额外引入一层插件壳与桥接协议。第二，可以让 Kernel 在真实的重型视图压力下稳定 document model、transaction、inspector、panel lifecycle 与 diagnostics API。第三，可以避免“为了让插件 API 看起来完整”而过早抽象出错误边界。

只有当以下条件同时满足时，才应评估将其迁移为 first-party extensions：其一，view / panel / inspector 注册 API 已经被其他官方扩展充分 dogfood；其二，Flow / Session 的 undo/redo、save、rename、diagnostics、run/debug 对照已经完全建立在 Kernel 契约上，而不是依赖内部私有状态；其三，迁移后不会造成语义模型再次分裂。

### 4.5 First-party Extensions：官方能力应成为平台 API 的压力测试

在 Flow / Session 之外，Studio 的绝大多数官方能力都更适合先以 first-party extensions 的形式交付。这不是“为了插件而插件”，而是为了让平台边界在内部就经受真实使用，而不是把不稳定 API 直接暴露给第三方。

第一批最适合 dogfood 的官方扩展包括：

- `kal.problems`
- `kal.prompt-preview`
- `kal.debugger`
- `kal.state-editor`
- `kal.config-editor`
- `kal.h5-preview`
- `kal.terminal`
- `kal.vercel-deploy`
- `kal.template-browser`
- `kal.package-manager`
- `kal.comments`

这些能力共同覆盖了 Studio 最需要验证的扩展表面：panel/view 注册、inspector 接入、command bus、run/debug service、event stream、process/deploy integration、以及 capability gate。只要这些官方扩展还不得不频繁绕过平台边界访问内部状态，就说明 Kernel API 还不够成熟，尚不适合对外承诺。

### 4.6 Third-party Extensions：开放的是能力边界，不是内部实现

对第三方扩展，KAL 应刻意保持克制。可开放的对象应围绕领域问题本身，而不是让第三方直接耦合到 Studio 的 React 组件层。

初期值得开放的贡献类型包括：

- `nodes`
- `inspectors`
- `commands`
- `views`
- `panels`
- `customEditors`
- `lints`
- `codeActions`
- `templates`
- `starters`
- `exporters`
- `shareTargets`
- `themes`
- `debugViews`
- `commentProviders`

但这些贡献都应建立在稳定契约上，而不是暴露 Kernel 私有 store、私有组件树或内部事件细节。第三方扩展消费的应当是 resource、query、command、event、capability 这些平台级抽象。

### 4.7 Engine 作为 Studio Platform Services

若 Studio 要真正成为运行验证工作台，Engine 也必须从“提供 CRUD API 的后端”演进为 Studio 的 platform services 层。其职责不再只是 `GET /api/flows/:id` 或 `PUT /api/session`，而是为整个工作台提供三种长期稳定的通道。

```text
Studio UI
  ├── Query API
  ├── Command API
  └── Event Stream

Studio Gateway / Engine
  ├── Project Loader
  ├── Runtime
  ├── Validation Engine
  ├── Trace Store
  ├── Package Manager
  └── Extension Workspace Host
```

`Query API` 负责读取 project graph、resource 内容、diagnostics、reference graph、node manifests、packages 与 templates。`Command API` 负责应用 transaction、运行 flow、推进 session、安装包、发布模板、创建 comment 等具副作用的操作。`Event Stream` 则负责传播 `project.reloaded`、`resource.changed`、`diagnostics.updated`、`run.event`、`run.finished`、`package.install.progress` 这类持续事件。

这个方向与 [engine.md](./engine.md) 已有结论保持一致：Engine 不应停留在“CRUD + run SSE”，而应逐步成为 Studio 的平台服务层。Studio 的 Kernel 消费这些服务，扩展则通过 Kernel 暴露的抽象接入，而不是各自绕过工作台直接与后端私相授受。

### 4.8 信息架构与核心工作流

在工作台层面，Studio 应采用标准 workbench 布局，而不是分散页面。最稳妥的首版结构是：顶部为 project switcher、global search、command palette 与 run controls；左侧为 project explorer、nodes/templates/packages 等切换视图；中间为多标签主编辑区；底部统一承载 problems、trace、console、state diff、comments；右侧 inspector 显示属性、引用、建议动作与最近运行结果。

这一布局的意义不在于模仿某个 IDE，而在于把 KAL 的四条主工作流组织到同一个 shell 中：理解项目、语义级编辑、运行验证、异步审查。用户不应在多个页面之间跳转才能完成一次“修改节点配置并验证 trace”的闭环。

### 4.9 权限、信任与包体系

结合 VS Code 的 Workspace Trust 与 Unity/Godot 的包管理经验，KAL 应采用 capability-based trust model，而不是简单的 trusted / untrusted 两档。建议至少区分以下能力：

- `project.read`
- `project.write`
- `engine.execute`
- `engine.debug`
- `network.fetch`
- `process.exec`
- `package.install`
- `package.publish`
- `comment.write`
- `ai.invoke`

与之配套，KAL 的包体系应尽早统一到一份可机器消费的 package manifest 上，并区分 `node-pack`、`studio-extension`、`template-pack`、`starter-pack`、`theme-pack` 等种类。公开 marketplace 应晚于三件事：一是包结构稳定，二是 capability 模型稳定，三是一方扩展已经把主要平台 API dogfood 过一轮。

## 5. 分阶段演进

### 5.1 Phase 1：Workbench Kernel

第一阶段的目标不是做市场，也不是开放第三方生态，而是让 Studio 先成为一个真正可用的工作台。重点包括统一 shell、tabs、panel、command palette；建立 resource/document/transaction 模型；建立 diagnostics 与 reference graph；并把 Flow / Session 以 built-in core views 的方式收进 Kernel。

### 5.2 Phase 2：First-party Dogfooding

第二阶段的关键是用官方扩展压测平台边界。State / Config editor、Problems、Prompt Preview、Debugger 应在这一阶段作为 first-party extensions 接入。只有当这些扩展可以不依赖私有状态稳定工作，Studio 的 view/panel/inspector/command API 才算真正成形。

### 5.3 Phase 3：Run / Debug 工作台

第三阶段补齐 event stream、trace store、timeline、state diff、breakpoints 与 replay。`h5-preview`、`terminal`、`vercel-deploy` 这类强依赖 process 与事件流的能力，应在这一阶段继续以官方扩展形式接入。此时再评估 Flow / Session 是否具备迁移为 first-party extensions 的条件。

### 5.4 Phase 4：Packages、Templates 与 Review

第四阶段再推进 package manager、template browser、starter creator、comments、review bundle 与私有 registry 发布。这里的顺序很重要：只有当 project graph、transaction、capability gate 已经稳定，review、share 与 publish 才不会把错误边界固化为“公共接口”。

### 5.5 Phase 5：Third-party Ecosystem

最后才是开放第三方扩展与第三方 registry。此时 Studio 的目标也不应是复刻一个“通用 IDE 市场”，而应围绕 KAL 的领域对象开放有限且高价值的扩展面，让 node、template、inspector、lint、debug view 与 share target 等能力围绕项目级工作流自然生长。

## 6. 结论

KAL Studio 的正确方向，不是把现有 Editor 直接推向“大而全 IDE”，也不是把所有能力立刻做成插件。更合理的路径是：先以 Kernel 稳住语义资源、事务、诊断、布局与信任模型；再把 Flow / Session 作为 built-in core views 承接现有重型视图；再让官方能力以 first-party extensions 的方式 dogfood 平台 API；最后才逐步开放第三方生态。

换句话说，Studio 的首要任务不是“证明自己可以扩展”，而是“证明自己已经找到了正确的核心边界”。只有在这个前提下，扩展系统才会放大优势，而不是放大混乱。

## 7. 参考资料

以下资料于 2026-03-16 查阅，均为官方一手材料。

- VS Code Extension Host: [https://code.visualstudio.com/api/advanced-topics/extension-host](https://code.visualstudio.com/api/advanced-topics/extension-host)
- VS Code Contribution Points: [https://code.visualstudio.com/api/references/contribution-points](https://code.visualstudio.com/api/references/contribution-points)
- VS Code Custom Editors: [https://code.visualstudio.com/api/extension-guides/custom-editors](https://code.visualstudio.com/api/extension-guides/custom-editors)
- VS Code Workspace Trust: [https://code.visualstudio.com/api/extension-guides/workspace-trust](https://code.visualstudio.com/api/extension-guides/workspace-trust)
- Eclipse Theia Architecture Overview: [https://theia-ide.org/docs/architecture/](https://theia-ide.org/docs/architecture/)
- Eclipse Theia Extensions: [https://theia-ide.org/docs/extensions/](https://theia-ide.org/docs/extensions/)
- IntelliJ Plugin Services: [https://plugins.jetbrains.com/docs/intellij/plugin-services.html](https://plugins.jetbrains.com/docs/intellij/plugin-services.html)
- IntelliJ Workspace Model: [https://plugins.jetbrains.com/docs/intellij/workspace-model.html](https://plugins.jetbrains.com/docs/intellij/workspace-model.html)
- IntelliJ Extension Point and Listener List: [https://plugins.jetbrains.com/docs/intellij/intellij-community-plugins-extension-point-list.html](https://plugins.jetbrains.com/docs/intellij/intellij-community-plugins-extension-point-list.html)
- JupyterLab Develop Extensions: [https://jupyterlab.readthedocs.io/en/4.4.x/extension/extension_dev.html](https://jupyterlab.readthedocs.io/en/4.4.x/extension/extension_dev.html)
- JupyterLab Common Extension Points: [https://jupyterlab.readthedocs.io/en/3.1.x/extension/extension_points.html](https://jupyterlab.readthedocs.io/en/3.1.x/extension/extension_points.html)
- Node-RED Edit Dialog: [https://nodered.org/docs/creating-nodes/edit-dialog](https://nodered.org/docs/creating-nodes/edit-dialog)
- Node-RED Packaging: [https://nodered.org/docs/creating-nodes/packaging.html](https://nodered.org/docs/creating-nodes/packaging.html)
- Unity Package Layout: [https://docs.unity3d.com/Manual/cus-layout.html](https://docs.unity3d.com/Manual/cus-layout.html)
- Unity Scoped Registries: [https://docs.unity3d.com/Manual/upm-scoped.html](https://docs.unity3d.com/Manual/upm-scoped.html)
- Godot Making Plugins: [https://docs.godotengine.org/en/stable/tutorials/plugins/editor/making_plugins.html](https://docs.godotengine.org/en/stable/tutorials/plugins/editor/making_plugins.html)
- Godot Using the Asset Library: [https://docs.godotengine.org/en/stable/community/asset_library/using_assetlib.html](https://docs.godotengine.org/en/stable/community/asset_library/using_assetlib.html)
