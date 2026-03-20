# KAL Studio 设计

**状态：设计说明（扩展研究版）**

这份文档讨论的不是“给现有 Editor 再堆一层功能”，而是 KAL Studio 作为产品工作台与平台边界的最小正确形态。

相关文档：

- [first-principles-architecture.md](./first-principles-architecture.md)
- [engine.md](./engine.md)
- [agent-debug.md](./agent-debug.md)

## 摘要

KAL Studio 应被定义为一个项目级、contract-first、agent-friendly、以运行验证为中心的工作台，而不是通用代码 IDE，也不是通用游戏编辑器。它面对的核心问题不是“如何支持尽可能多的插件”，而是“如何在不复制真相的前提下，把项目理解、语义级编辑、运行验证、诊断调试、review 和 agent 协作收敛到同一个工作台中”。

相较于前一版，这份文档把研究面扩展到了更多类型的一手系统：通用 IDE 平台（VS Code、Theia、IntelliJ、JupyterLab）、领域编辑器（Node-RED、Unity、Godot、Blender）、平台化产品（Grafana、Backstage）、设计到开发的桥梁工具（Figma），以及协作数据模型（Yjs）。这些系统看上去彼此差异很大，但在几个结构性问题上给出了高度一致的信号：项目语义必须由平台统一持有；可扩展面必须被控制；重型核心视图不应在平台早期被过早插件化；first-party dogfooding 是平台 API 成熟的必要条件；协作存在感状态应与持久化事实状态分离；包治理、权限和分发路径必须早于公开市场。

因此，本文的结论比前一版更明确：KAL Studio 应采用 `Engine Platform Services + Studio Kernel + Officially Published Optional Core Extensions + Officially Published Optional Workflow Extensions + Third-party Extensions` 的分层结构。`Flow` 与 `Session` 在 Phase 1 仍应作为官方发布、可选安装的核心扩展，直接压测 Kernel 的 resource/document/transaction、diagnostics、inspector 和 run/debug 接口。`problems`、`prompt-preview`、`debugger`、`state-editor`、`config-editor`、`version-control`、`terminal`、`vercel-deploy`、`template-browser`、`package-manager` 等官方能力则应尽早以官方发布、可选安装的一方扩展形式交付，以真实压力检验 view registry、command bus、event stream、layout restoration 和 capability 模型是否足够稳定。与此同时，Engine 作为游戏运行时必须保持 Studio-optional：Studio 可以消费 Engine，但 Engine 在 `kal serve`、`kal play`、`kal debug`、`kal smoke` 等场景下不应以任何形式依赖 Studio 才能启动。

## 1. 问题定义

### 1.1 Studio 要解决的不是“再做一个编辑器”

KAL 当前已经具备清晰的 runtime 主线：Core 负责执行语义，Engine 负责把 Core 暴露为 CLI、HTTP API 与 managed run protocol，而现有 Editor 已经完成了从“本地直读文件”到“经由 Engine API 工作”的关键转向。真正尚未完成的，不是再做一个更复杂的画布，而是把这三者组织成一个统一的 Studio 工作台。

如果把这个问题表述得更严格一些，Studio 至少必须同时满足七个条件。

第一，它必须以 Engine 暴露的 canonical schema、runtime manifest 和 project graph 为唯一事实源，否则人类界面、agent 技能、运行时 contract 与文档会再次漂移。

第二，它必须把编辑与运行连接成闭环，因为 KAL 的大部分质量问题不是静态文本错误，而是在 flow、session、state、prompt 与 trace 的交互过程中暴露出来。

第三，它必须支持异步审查。KAL 的真实工作流不是“人类手工写完再运行”，而是 agent 生成、lint/smoke/debug 暴露问题、人类审查与微调。因此 Studio 既是编辑器，也是验证台和 review surface。

第四，它必须允许官方能力以扩展形式持续 dogfood 自己的 API，否则平台边界永远无法被真实验证。

第五，它又不能在平台边界尚未成熟时，把最核心的 Flow / Session 视图一起推入插件化重构，造成“内核和核心视图同时重写”的叠加风险。

第六，它必须确保 Engine 在作为游戏运行时、调试宿主和服务端时可以脱离 Studio 独立运行。Studio 只能是 Engine 的一个客户端与工作台组合，而不能反向成为 Engine 的启动前提、打包前提或部署前提。

第七，它必须为未来的人类协作和 agent 协作留出路径，但不能因为“也许以后要多人编辑”而过早把 canonical model 设计成复杂的实时协同系统。

### 1.2 当前落地状态与真实约束

这份文档不是在真空里讨论 Studio。

当前仓库里，`apps/editor` 已经是一个可用的项目编辑界面。`App.tsx` 通过本地视图切换在 `Flow`、`StateManager`、`ConfigEditor` 和 `SessionEditor` 之间切换；`projectStore.ts` 负责拉取项目、缓存 flows/session/node manifests，并通过 Engine API 做保存、执行和 managed run 操作。这说明我们已经有了一批真实的重型视图和真实的 API 消费方式，但它们还没有被收敛为一个通用 Kernel。

同时，`apps/engine` 已经具备 Studio 所需的若干平台能力雏形：`kal studio` 提供一体化服务，`studio-server.ts` 统一承载 Editor 静态资源与 Engine API；`runtime.ts` 已经能读取项目、导出 node manifest、保存 flow/session、创建 managed runs；`kal debug`、`kal lint`、`kal smoke`、`kal schema` 已经证明 Engine 并不只是一个 CRUD 后端，而是在演进为 Studio 的 platform services。更重要的是，这些 CLI 和服务能力今天已经可以在没有 Studio UI 参与的情况下独立工作，这个性质不应在后续 Studio 化过程中被破坏。

这带来一个很重要的约束：Studio 的正确演进路径，不是推倒现有 Editor 重做，也不是先设计一个“未来会很强大”的插件壳，再让所有已有功能往里硬塞。更合理的路径是把已经存在的 Flow / Session / State / Config / Run 能力逐步重新编排到一个 Kernel 上，并以官方扩展的方式反向压测平台边界。

### 1.3 研究问题

基于上述背景，本文聚焦八个设计问题。

1. KAL 项目语义应当由谁维护。是让每个视图或扩展自行持有文档 truth，还是由 Kernel 统一维护 resource、version、transaction 与 reference graph。
2. Studio 的工作台表面应如何开放。是把所有能力都降格为插件贡献，还是把最重的领域编辑器收敛为官方发布、可选安装的核心扩展，并保留受控契约。
3. Studio 至少需要几个宿主。哪些能力应在浏览器里运行，哪些能力应在 workspace/Engine host 中运行，哪些能力本质上是平台服务。
4. 编辑、运行、调试、review 与 agent proposal 应怎样进入同一条事务链，而不是各自维护一套状态。
5. 扩展权限应如何建模。是 trusted / untrusted 两档，还是 capability-based trust model。
6. layout、panel 恢复、工作区状态是否应由平台统一托管，还是让每个 view 自己保存。
7. 包、模板、扩展和 starter 应共享怎样的 manifest 与分发路径，才能既支持项目内安装，也支持团队内分发。
8. 协作应如何分层。哪些状态是 canonical data，哪些是 derived index，哪些只是 presence / cursor / selection 这类 ephemeral awareness。

## 2. 研究方法与对照样本

### 2.1 研究方法

这里的目标不是寻找一个“最像 KAL 的祖先系统”，而是从不同类型系统中提取可重复出现的结构决策。KAL 同时具有 IDE、领域编辑器、运行验证台、review 工具和 agent 工作台的特征，因此单看任何一个样本都不够。

本文只采用官方一手资料，并按下面五类问题选择样本。

| 组别 | 样本 | 主要回答的问题 |
| --- | --- | --- |
| 通用 IDE / workbench | VS Code、Theia、IntelliJ、JupyterLab | 宿主拓扑、扩展点治理、项目模型、布局恢复 |
| 领域编辑器 | Node-RED、Unity、Godot、Blender | 节点/包边界、编辑器深集成、项目本地扩展 |
| 平台化产品 | Grafana、Backstage | 插件类型分层、权限与签名、模板与企业分发 |
| 设计到开发桥梁 | Figma | 模式切换、inspect/codegen surface、性能加载策略 |
| 协作数据模型 | Yjs | transaction、origin、awareness 与持久态分离 |

### 2.2 为什么这些样本对 KAL 有意义

VS Code、Theia、IntelliJ、JupyterLab 不是因为“它们都是 IDE”才重要，而是因为它们长期面对同一类问题：平台边界一旦设计错误，后续再多的扩展能力也会建立在错误的语义模型上。

Node-RED、Unity、Godot、Blender 的价值在于提醒我们，领域编辑器真正复用的不是“所有东西都能插件化”，而是包边界、编辑器入口、examples、测试位置和项目本地定制路径。

Grafana 与 Backstage 的价值更偏治理层面。它们不是传统 IDE，但都把插件类型、权限、分发、签名、模板和企业部署当成平台的第一等问题。这与 KAL 未来的 template pack、starter pack、studio extension、team registry 十分接近。

Figma 与 Yjs 则帮助我们回答另外两个在前一版文档中展开不够的问题：第一，inspect/review/codegen 是否应该被视为与 edit 不同的 surface；第二，多人/多 agent 协作应如何分离事实态与存在感状态。

## 3. 相关工作与研究发现

### 3.1 VS Code：多宿主、受控贡献点、延迟激活与平台统一信任

VS Code 的关键贡献并不在于“插件多”，而在于它把扩展模型压缩成了一组可治理的机制。

首先，扩展并不只有一个运行位置。官方文档明确说明，扩展可以运行在本地 Node.js host、浏览器中的 web extension host、或者远端 Node.js host，具体取决于运行环境与 `extensionKind` 的选择。这说明一个成熟的工作台不会假设“所有扩展都和 UI 在同一个进程里”。对 KAL 而言，这意味着 `problems`、`prompt-preview` 之类偏展示和查询的能力，理论上可以更接近浏览器 shell；而 `terminal`、`package-manager`、`vercel-deploy`、本地模板生成器等涉及进程和工作区读写的能力，应明确运行在 workspace/Engine host 侧，而不是只靠前端桥接。

其次，VS Code 通过一组显式的 contribution points 和 activation events 治理扩展表面，而不是允许扩展任意改写工作台。`commands`、`views`、`menus`、`custom editors`、`debuggers`、`tasks`、`terminals` 这些 contribution surface，加上 `onCommand`、`workspaceContains` 等延迟激活机制，共同决定了平台的稳定契约与性能边界。对 KAL 的直接启发是：Studio 不应只定义“扩展可以做什么”，还应定义“扩展何时被激活、在哪个宿主运行、在未激活时由谁负责 placeholder 和 layout restoration”。

但 VS Code 同时也是反例。根据 Custom Editor API，一个 custom editor 的 `CustomDocument` 由扩展自行定义，同步、脏状态、undo/redo 与 save 行为也需要扩展自己保证。这个模型很适合图片预览、二进制可视化或少数辅助型编辑器，却不适合在平台早期承接 Flow / Session 这种重语义、重事务、重引用关系的核心视图。若 KAL 在 view/panel/transaction API 尚未稳定时就把 Flow / Session 外移为 custom editor 风格扩展，相当于把最重的语义责任提前下放给插件壳。

最后，Workspace Trust 提供了一个对 KAL 非常可迁移的治理思路：安全与受限模式不应由每个扩展各自发明，而应由平台统一建模。扩展只声明自己在不同 trust 状态下的支持级别，真正的授权上下文由平台统一判断。这几乎可以直接转化为 KAL 的 capability-based trust model。

### 3.2 Eclipse Theia：为产品级深集成保留空间

Theia 的价值在于提供了另一个与 VS Code 不同、但对 KAL 更接近的答案。官方架构文档明确说明，Theia 采用前后端双容器结构，前端与后端都有自己的依赖注入容器，并允许扩展向两侧贡献能力。这说明工作台平台不应被理解为“前端壳 + 后端 API”的简单二分，而应被理解为跨前端和后端演化的一组产品模块。

更重要的是，Theia 区分了产品级扩展与受限插件。其 extensions 更像编译时集成、可访问更深层容器的产品模块；plugins 则更接近受限 API 的运行时插件。这种区分对 KAL 很关键，因为我们当前确实既需要一层可演进的 Kernel / 官方发布、可选安装的核心扩展，也需要可安装的 studio extensions。若一开始就把两者混成同一抽象，平台边界既会过宽，又会过脆。

Theia 给 KAL 的核心启发可以浓缩成一句话：领域工作台在演进早期必须保留一层深集成面，否则核心视图会被迫在不成熟的插件接口上“伪装成插件”，最终既难维护，也难治理。

### 3.3 IntelliJ Platform：项目模型一旦设计错误，后续成本极高

IntelliJ Platform 最值得借鉴的不是它有多少扩展点，而是它如何始终把项目语义视为平台资产。官方文档把服务清晰地区分为 application-level、project-level、module-level 三种作用域，强调生命周期与作用域必须由平台统一托管。这背后的思想对 KAL 很重要：Studio 必须先知道哪些状态属于全局工作台，哪些状态属于项目，哪些状态属于具体 resource/view/run，平台才可能为保存、恢复、缓存和并发控制建立一致语义。

更有价值的是 JetBrains 对旧项目模型的反思。Workspace Model 的提出，本质上是承认旧 project model 带有历史语言包袱，难以支撑更广的平台需求。这个教训对 KAL 几乎是直接的：如果 Studio 继续把 `flow`、`session`、`state`、`config`、`trace`、`package` 看成彼此孤立的页面，而不是统一的 project resource graph，那么 rename、references、lint、review、share、debug、agent proposal 最终都会叠加在错误的数据模型上。

IntelliJ 还提醒我们另一件事：扩展点数量本身就是治理成本。官方扩展点列表极其庞大，这说明“先做大量扩展点，再思考边界”并不适合早期平台。KAL 更合理的路径是只开放与领域问题直接相关的少量扩展面。

### 3.4 JupyterLab：typed tokens、shell slots 与 layout restoration

JupyterLab 对 KAL 的启发甚至比传统代码 IDE 更强，因为它组织的是 notebooks、consoles、terminals、inspectors、launchers 等异构对象，而不是单一文本编辑器。

官方扩展开发文档明确说明，JupyterLab 通过 typed tokens 提供服务，consumer plugin 用 `requires` 或 `optional` 声明依赖，provider plugin 通过 `provides` 和 `activate` 返回服务。这种 provider-consumer 模式不仅能避免字符串式服务名冲突，还能让扩展依赖在类型层面可检查。KAL 完全可以吸收这一点，把 `ProjectGraphService`、`DiagnosticsService`、`RunService`、`TraceService`、`LayoutService`、`ProposalService` 做成 Studio Kernel 的 typed capabilities，而不是让扩展用一堆约定俗成的事件名互相猜测。

JupyterLab 还把 shell surface 组织得非常明确：`main`、`left`、`right`、`down`、`header` 等区域是平台概念，而不是页面内部私有布局。对 KAL 来说，这意味着 Problems、Trace、Console、State Diff、Comments、Prompt Preview 这些表面，不应该被各自页面私有化，而应被统一组织成工作台 slots。

更进一步，JupyterLab 把 layout restoration 也放到了平台层。它要求 widget 能被 restore command 恢复，而不是把“下次打开时能不能回到上次工作区状态”交给扩展各自实现。这一点对 KAL 很重要，因为 Flow / Session / Trace / Review 的实际使用往往是跨天、跨 run、跨上下文切换的。若 layout、selected resource、inspector tab、open run、last diagnostics filter 都由各视图自己保存，工作台的一致性会很差。

### 3.5 Node-RED：节点配置、帮助文本与 examples 必须进入包边界

Node-RED 的官方文档把节点作者最需要处理的两件事写得非常明确。

第一，节点的编辑表单不是外部附属物，而是节点定义的一部分。编辑表单、默认值、校验与帮助文本应与节点一起打包。对 KAL 来说，这意味着 node manifest 不应只描述运行时字段，还应为 Studio 提供 inspector schema、默认值、说明文案与示例入口。否则 Studio 很快会重新发明一份与 runtime manifest 平行的“前端节点定义”。

第二，节点分发直接复用 npm 包机制，包通过 `package.json` 中的专用字段暴露节点定义，并鼓励同时提供 examples。这个经验对 KAL 十分重要，因为未来的 `node-pack`、`template-pack`、`starter-pack` 若没有统一 manifest、examples 与文档结构，Studio 的 package manager 和 template browser 就会沦为对任意文件树做启发式猜测。

### 3.6 Unity、Godot、Blender：领域工作台最需要的是清晰边界，而不是最大化插件化

Unity 的包文档把 `Editor`、`Runtime`、`Tests`、`Samples~`、`Documentation~` 等职责分得非常清楚，Scoped Registries 则进一步展示了团队如何通过命名空间和私有 registry 控制包来源。这证明了一件事：生态不是从 marketplace 开始的，而是从包结构、信任边界和私有分发路径开始的。KAL 未来若有 template pack、starter pack、studio extension、theme pack，也应该一开始就区分运行时内容、Studio 内容、测试、样例和文档。

Godot 提供了另一种很重要的连续路径：编辑器插件既可以由项目本地 `addons/` 目录承载，也可以通过编辑器内的 Asset Library 获取。它的价值在于把“项目内定制”和“外部生态分发”放在同一条自然演进路径上。对 KAL 来说，这意味着我们不应把“公开 registry”视为第一步。更现实的路径是先支持项目本地扩展和团队私有 registry，再决定是否开放市场。

Blender 则提醒我们，工作区布局本身就是平台能力。其 Workspaces 用来表示任务导向的布局状态，而 Add-ons 则可以注册 operator、panel 和 UI。这个组合说明，任务模式与布局恢复不应是扩展的副产品，而应是工作台内核的一部分。KAL 很可能也需要类似的“任务态工作区”概念，例如 `authoring`、`debug`、`review`、`package` 四类预置布局，而不是让用户从一个全空白画布自己拼装所有 panel。

### 3.7 Grafana、Backstage：插件类型、权限和签名必须先于市场

Grafana 的插件文档把插件明确分为 panel、data source、app 等不同类型，而签名机制则决定了插件能否被安装或信任。它给 KAL 的启发是：扩展类型不是装饰信息，而是权限包络和生命周期包络的一部分。`view/panel`、`inspector`、`debug-view`、`node-pack`、`share-target`、`theme`、`template-browser-provider` 这些能力在 KAL 中显然不应该拥有同样的权限与宿主位置。

Backstage 的文档则从另一个角度说明了相同问题。其 Software Templates 与 Permissions Framework 表明，在企业或团队语境下，“模板”与“权限策略”都不是外围功能，而是平台主能力。对 KAL 来说，这意味着 starter/template 系统不应只是简单文件复制器，而应与 capability gate、组织内 registry、review policy 和 provenance 一起设计。未来如果 KAL Studio 支持“从 starter 生成项目”“从 team registry 安装 template pack”，那么谁可以发布、谁可以安装、安装后能请求哪些能力，必须有明确策略。

### 3.8 Figma：edit、inspect、codegen 可能是不同的工作台 surface

Figma 的插件文档虽然不是 IDE 文档，但它在两个问题上对 KAL 很有启发。

第一，插件运行上下文与模式是显式概念，而不是隐式假设。设计工具之所以能同时服务创作、检查和开发衔接，是因为它会把不同 surface 明确分开，而不是要求所有能力都塞进同一个编辑模式里。对 KAL 来说，这支持一个重要判断：`edit`、`debug/inspect`、`review`、`agent proposal` 不一定应该只是同一页面上的四个按钮，它们可能对应不同的工作台布局和不同的权限包络。

第二，Figma 文档专门讨论了大文件下的动态加载策略。这提醒我们，Studio 不能默认“把整个项目一次性读进前端 store 就行”。随着 flow、trace、artifact、comments、packages 变大，project graph 的读取、索引与按需展开需要成为平台能力，而不是某个视图自己的优化。

### 3.9 Yjs：transaction、origin 与 awareness 应分层

Yjs 提供的最重要启发不是“要不要上 CRDT”，而是如何清楚地区分不同层级的状态。

其文档强调，文档修改发生在 transaction 中，而 transaction 可以携带 `origin` 这类来源信息；与此同时，Awareness 机制承载的是光标、选择和在线状态等临时存在感信息，并不等价于持久文档内容。对 KAL 非常有帮助的一点是：未来即便我们真的需要多人/多 agent 协作，也不应把 presence、cursor、selection、临时聚焦节点、正在看的 run 等状态混入 canonical project data。

更实际的结论是，KAL 在 P0/P1 甚至不需要立刻做“实时协同编辑”。更需要的是：所有修改都进入带 version 与 origin 的 transaction；resource 冲突有明确的 optimistic concurrency 策略；presence 和 comments 这类异步协作能力可以后加，并且保持与持久资源分离。

### 3.10 版本管理：统一抽象、默认后端与恢复安全网

如果把视角专门收窄到“版本管理应该放在哪一层”，前人的路径其实比表面上更一致。

VS Code 选择的是“统一 SCM 抽象 + 官方默认 Git provider”。官方 Source Control API 明确说明，平台提供统一的 SCM UI，而 VS Code 自己内置的 Source Control provider 是 Git 扩展。这说明默认后端完全可以是 Git，但工作台不应直接退化成 Git 命令面板；平台层仍应先定义统一的状态模型、资源分组和操作入口。

IntelliJ 给出的则是“两层安全网”的经验。它既支持正式 VCS 集成，也提供 Local History。官方文档明确指出，Local History 会自动记录编辑、运行、部署等带来的变化，可以恢复文件、目录甚至局部改动；但同一文档也强调，Local History 不是长期版本控制的替代品，有保留期限和容量限制。这对 KAL 很关键：正式历史和轻量 checkpoint 最好分层，而不是强迫每次恢复都绑定到正式 commit。

Figma 的版本历史又提供了另一种产品化经验。它会持续生成 autosave checkpoints，支持命名版本、恢复版本、复制某个版本成为新文件、分享特定版本链接，而且恢复是 non-destructive 的。这说明在创作型工作台中，`checkpoint`、`restore`、`share this version` 往往是核心产品能力，而不是存储实现细节。

Godot 则很好地说明了“复用 Git”的前提条件。官方文档明确强调，Godot 要尽量生成可读、可合并文件；编辑器内版本控制依赖具体 VCS 插件，而官方 Git 插件是默认方案；项目还会自动生成 `.gitignore` 和 `.gitattributes`，并建议对大文件使用 Git LFS。换句话说，Git-backed 的成立前提不是“工作台支持 Git”，而是项目格式、忽略规则和大文件策略都先被收敛。

Unreal 与 Unity Version Control 提供的共同教训则来自更资产化的工作流。Unreal 的 Source Control 文档强调，编辑器内建历史、checkout 和 package modification 提示；Unity 的 Smart Locks 文档则更直接指出，对不可合并文件，锁和“只能锁定最新版本”是降低冲突的重要机制。这说明一旦对象变得不可文本合并，版本系统就不能只靠 diff/merge，还需要 lock、latest-revision awareness 与更强的状态提示。

把这些经验放在一起，可以得到一个更稳的判断：KAL 最合适的路线不是 `Git-only`，也不是“完全自研版本系统”，而是 `Git-backed + KAL semantic layer`。也就是：Git 负责正式持久化历史、分支和远程同步；KAL 保留 `transaction`、`semantic diff`、`checkpoint`、`restore`、`proposal/review` 这些领域语义；官方 `version-control` 扩展负责默认体验；三方后续主要扩展 provider 与集成，而不是在第一阶段接管整套版本管理。

### 3.11 综合信号

把上面这些样本放在一起，可以得到九个对 KAL 直接可操作的判断。

1. 扩展平台真正要治理的是边界，而不是数量。
2. 语义模型必须先于插件化稳定，否则 rename、references、review 和 debug 都会建立在错误的数据模型上。
3. 重型核心视图在平台早期应保留为官方发布、可选安装的受控核心扩展，而不是被迫伪装成“普通三方插件”。
4. first-party dogfooding 不是权宜之计，而是平台 API 成熟的必要手段。
5. 平台至少需要显式区分浏览器 shell、workspace host 和 platform services。
6. layout restoration、shell slots、workspace presets 应由平台统一托管。
7. 包类型、权限、签名和私有分发路径要早于公开市场。
8. inspect/review/debug 与 edit 可能是不同的工作台 surface，而不只是页面内的小功能。
9. 协作状态必须分层：canonical data、derived index、ephemeral awareness 各自独立。

## 4. 对 KAL 的设计目标与非目标

### 4.1 设计目标

基于上述研究，KAL Studio 应围绕以下目标收敛。

1. 项目优先，而非单编辑器优先。Studio 的一等对象不是单个 Flow 画布，而是整个 KAL 项目及其 resource graph。
2. 单一事实源。node contract 以 runtime manifest 为准，flow / session / state / config / trace / package 以 Engine 暴露的 canonical schema 与 canonical data 为准。
3. 语义级编辑与运行验证闭环。用户操作的是节点参数、会话跳转、state key、模板选择、run trace，而不是一堆彼此无关的 JSON 文件。
4. review 与 proposal 是第一等工作流。Studio 不只是“编辑后保存”，还必须承接 agent proposal、人工审查、diagnostics 对照和验证计划。
5. 扩展优先，但内核不能空心。文档模型、事务、命令、布局、诊断、信任与恢复必须由 Kernel 托管。
6. 宿主显式化。前端 shell、workspace host、Engine services 的边界必须可见。
7. Engine 可独立运行。Studio 不能成为 Engine 的反向依赖；`kal serve`、`kal play`、`kal debug`、`kal lint`、`kal smoke` 必须在不加载 Studio 的前提下成立。
8. 协作可演进，但不过度设计。先做好 transaction 与 version，再考虑 presence、多人协同和评论流。

### 4.2 非目标

Studio 当前阶段不应把下列方向放在 P0 / P1。

1. 做成通用代码 IDE。KAL Studio 不是为了替代 VS Code。
2. 先做大而全 marketplace。没有稳定包边界、权限模型和一方 dogfooding 时，市场只会放大问题。
3. 把所有能力都立刻插件化。平台边界尚未稳定时，这会把语义责任错误地下放给扩展。
4. 让 agent 直接拥有任意写文件权限。更稳妥的模型是 query -> proposal -> review -> transaction -> validate。
5. 过早做复杂实时协同。canonical project data 不是从第一天就必须变成 CRDT 文档。
6. 让 Engine 在运行时路径中隐式加载 Studio。游戏运行、调试和服务模式应继续保持 Studio-optional。

## 5. 提议方案：KAL Studio 总体架构

### 5.1 总体分层

本文建议采用如下结构。

```text
KAL Studio
├── Studio Kernel
│   ├── Workbench Shell
│   ├── Resource / Document / Version Model
│   ├── Transaction + Undo/Redo + Autosave
│   ├── Diagnostics + Reference Graph + Search
│   ├── Layout + Tabs + Restoration
│   ├── Command Bus + Context System
│   ├── Trust + Capability Gate
│   ├── Proposal / Review Coordinator
│   └── Extension Host Runtime
├── Officially Published Optional Core Extensions
│   ├── Flow Editor
│   └── Session Editor
├── Officially Published Optional Workflow Extensions
│   ├── Problems
│   ├── Prompt Preview
│   ├── Debugger
│   ├── State Editor
│   ├── Config Editor
│   ├── Version Control
│   ├── Terminal
│   ├── Vercel Deploy
│   ├── Template Browser
│   ├── Package Manager
│   ├── Comments
│   └── Review
└── Third-party Extensions
    ├── Node Packs
    ├── Inspectors
    ├── Views / Panels / Debug Views
    ├── Lints / Code Actions
    ├── Templates / Starters / Themes
    └── Exporters / Share Targets

Engine Platform Services
├── Project Loader
├── Runtime
├── Validation Engine
├── Run / Debug Services
├── Trace Store
├── Package / Template Services
└── Event Stream Gateway
```

这套结构的重点不在层数，而在责任分配。

Studio Kernel 负责跨视图共享的语义与生命周期。

Officially Published Optional Core Extensions 只承接当前最重、最依赖语义模型的 Flow / Session。

Officially Published Optional Workflow Extensions 负责用真实产品能力反向压测平台 API。

为避免后文表述过长，下文将前者简称为“核心官方扩展”，将后者简称为“官方工作流扩展”；两者共同特征都是官方发布、可选安装。

Third-party Extensions 只在平台边界被充分验证后逐步开放。

Engine 则不再只是“提供 CRUD API 的后端”，而是 Studio 的 platform services 层。

但这里有一个边界必须说清楚：Engine Platform Services 不是“把 Engine 内嵌进 Studio”。相反，Studio 应建立在 Engine 之上，`kal studio` 只是把两者组合部署的一种便利入口。Engine 自身仍需保持可单独作为运行时、CLI 宿主、调试宿主和服务端存在。

同样重要的是，对用户可见的官方领域能力不再定义为“官方内置”。更一致的产品模型是：Flow / Session / Problems / Debugger / Version Control 等都属于官方发布、可选安装的扩展。差别只在于 Flow / Session 这类核心扩展在早期仍由官方受控，并允许依赖尚未对第三方开放的受控契约。

### 5.2 宿主拓扑：至少三区分

Studio 至少应显式区分三个执行位置。

```text
Browser Shell
  - Workbench layout
  - Rendering of official core extensions
  - Lightweight official workflow panels
  - Command palette / shortcuts / selection state

Workspace Host
  - File / process / package / terminal / deploy
  - Extension activation that requires local capabilities
  - Project-local tools and generators

Engine Platform Services
  - Canonical project graph
  - Validation / diagnostics / references
  - Managed runs / debug / trace
  - Event streams and long-running jobs
```

这个划分不是为了追求“分布式架构感”，而是为了把权限、性能和崩溃边界说清楚。比如 `kal.problems` 可以主要依赖 Kernel + Engine 查询；`kal.terminal` 则显然需要 workspace host；`kal.debugger` 既依赖 Engine 的 run/debug/trace 服务，也依赖 shell 的 panel / layout / selection。

同时，它也有助于维持一个容易被忽略但非常关键的约束：Engine 不应因为 Studio 的存在而被迫常驻加载 Editor 静态资源、workbench layout、extension host 或任何仅服务于 Studio 的前端模块。Studio 相关能力应通过显式入口按需组合，而不是渗入 Engine 的最小运行时路径。

### 5.3 Kernel 的职责

Kernel 不是一个空心布局壳，而是 Studio 的主语义层。它至少应承担以下职责。

1. 管理 resource/document/version model，并维护 canonical data、derived indexes 与 ephemeral UI state 的边界。
2. 管理 transaction、undo/redo、autosave、optimistic concurrency 与 patch 生成。
3. 统一 diagnostics、reference graph、search、lint 入口与 code action 触发面。
4. 提供标准化的 view / panel / inspector / debug view 注册与生命周期。
5. 统一 layout restoration、workspace presets、tabs、panel pinning、open editors 与 session restore。
6. 提供 command bus、context keys、keybinding、command palette。
7. 提供 trust / capability gate，并把权限决策集中在平台层。
8. 协调 proposal / review 流程，把 agent 建议转为可审查的 transaction。
9. 托管 extension hosts，并负责激活、停用、崩溃隔离、状态恢复与健康检查。

Kernel 的根本任务只有一个：保证所有上层视图与扩展都消费同一套项目语义，而不是各自维护一份 truth。

## 6. 资源模型、事务模型与工作台表面

### 6.1 Resource / Document / Version 模型

Studio 内部应统一采用 resource/document 模型。每个资源至少包含四层状态。

1. `canonical data`：来自 Engine 的事实数据，是保存、运行、共享与 review 的唯一依据。
2. `derived indexes`：为 references、diagnostics、search、outline、inspector、graph layout、prompt preview 等生成的索引。
3. `ephemeral UI state`：选择、高亮、缩放、展开、过滤、正在查看的 run、当前 inspector tab 等短生命周期状态。
4. `presence / awareness`：未来可能出现的人类或 agent 光标、选区、正在编辑资源、评论草稿等存在感状态。

KAL 的 resource graph 至少应把以下对象视为一等资源：

- `project`
- `flow`
- `session`
- `state-schema` 或 `state-keys`
- `config`
- `node-manifest`
- `trace-run`
- `diagnostic-set`
- `package`
- `template`
- `comment-thread`
- `proposal-bundle`

重要的不只是“资源种类”，而是稳定资源标识与版本边界。例如 `flow://battle/main`、`session://default`、`trace://run/<id>` 这类标识要足够稳定，才能支撑 layout restore、deep link、review、share 和 external tool integration。

### 6.2 所有写操作都进入 transaction

Studio 中的所有编辑都必须经过 transaction，而不是让组件直接写 store。transaction 至少承担六个职责。

1. 保证 undo/redo 和 autosave 的一致性。
2. 在资源修改后触发 diagnostics、references、outline 和 derived indexes 的增量刷新。
3. 为 review、share 与 agent proposal 生成稳定 patch。
4. 在跨资源操作中维护 rename、delete、extract subflow、state key move 等变更的一致性。
5. 携带 `origin`、`author`、`baseVersion`、`timestamp` 等来源信息，为未来并发控制和审计留出空间。
6. 作为唯一的可回放编辑日志，让 debug/review 知道“这个 run 是在哪个资源版本上发生的”。

建议 transaction 使用“语义操作优先、文本 patch 作为派生物”的模型。例如：

```json
{
  "resource": "flow://battle/main",
  "baseVersion": "42",
  "origin": {
    "kind": "agent",
    "id": "kal.copilot"
  },
  "ops": [
    {
      "type": "node.config.set",
      "nodeId": "prompt-3",
      "path": "temperature",
      "value": 0.7
    },
    {
      "type": "edge.connect",
      "from": "prompt-3",
      "to": "branch-1"
    }
  ]
}
```

这样 review 时看到的不是抽象 JSON diff，而是“agent 把哪个节点的哪个语义字段改成了什么”，同时文本 patch 依然可以作为落盘派生物生成。

### 6.3 为什么 Flow / Session 在 Phase 1 应作为官方发布的受控核心扩展

Flow / Session editor 在当前阶段不是简单的“视图渲染器”，而是 transaction、references、diagnostics、run/debug 对照、inspector、layout restore 的重度消费者。若平台还没有先把这些能力稳定下来，就让插件负责其生命周期，等于把最核心的语义与事务责任下放给最不稳定的一层。

因此，`kal.flow-editor` 与 `kal.session-editor` 在 Phase 1 更合理的形态不是“官方内置 view”，而是官方发布、可选安装的受控核心扩展。它们的目标不是永久拥有特殊地位，而是在最脆弱的阶段帮助 Kernel 找准边界，同时保持统一的发布、安装与升级路径。

只有当以下条件同时满足时，才应评估是否把它们收敛为只依赖公开扩展契约的普通官方扩展。

1. view / panel / inspector 注册 API 已被其他官方扩展充分 dogfood。
2. Flow / Session 的 undo/redo、save、diagnostics、rename、run/debug 对照已完全建立在 Kernel 契约上。
3. 迁移后不会造成 canonical model 或私有 store 的再次分裂。

### 6.4 Query / Command / Event 三通道

若 Studio 要真正成为运行验证工作台，Engine 必须从“提供 CRUD API 的后端”演进为 platform services。其对 Studio 的稳定表面不应只有 REST 风格读写，而应至少包括三条通道。

1. `Query API`：读取 project graph、resource 内容、diagnostics、references、node manifests、packages、templates、comments、trace summaries。
2. `Command API`：应用 transaction、运行 flow、推进 session、接受 proposal、创建 review、创建 checkpoint、比较版本、恢复版本、安装包、发布模板、执行 deploy。
3. `Event Stream`：传播 `project.reloaded`、`resource.changed`、`diagnostics.updated`、`run.updated`、`trace.appended`、`history.updated`、`process.output`、`package.install.progress`、`review.changed` 等持续事件。

这一判断与 [engine.md](./engine.md) 的结论保持一致：Engine 不应停留在“CRUD + run SSE”，而应成为 Studio 的平台服务层。但“成为平台服务层”不等于“必须绑定 Studio 才能运行”。更准确的关系是：Studio 依赖 Engine 的 platform services，而 Engine 在运行游戏、提供 CLI、执行调试、承载 TUI 时可以完全不加载 Studio。

### 6.5 Shell slots、布局恢复与任务态工作区

Studio 在工作台层面应采用 shell slots，而不是分散页面。一个稳妥的首版结构是：

- 顶部：project switcher、global search、command palette、run controls、trust indicator
- 左侧：project explorer、nodes、templates、packages、comments、source control / history、outline
- 中间：多标签主编辑区，用于 Flow / Session / Config / Prompt Preview / review bundle
- 底部：problems、trace、console、state diff、event log、review history
- 右侧：inspector、references、suggested actions、recent run summary

除此之外，Kernel 应提供任务态工作区预设，例如：

- `authoring`：以 Flow / Session + inspector 为主
- `debug`：以 trace、state diff、console、run controls 为主
- `review`：以 proposal、semantic diff、diagnostics delta、comments 为主
- `history`：以版本树、semantic diff、checkpoint、restore 为主
- `package`：以 template browser、package manager、registry 状态为主

这些工作区预设不只是 UI 皮肤，而是工作流组织方式。Blender 的 Workspaces 和 JupyterLab 的 LayoutRestorer 都说明，这类状态应由平台统一恢复与管理。

## 7. 扩展系统、能力模型与包治理

### 7.1 扩展系统的设计原则

对第三方扩展，KAL 应刻意保持克制。开放的是能力边界，而不是内部实现。第三方扩展不应直接访问 React 组件树、私有 store、内部事件细节。它们应消费的对象是 resource、query、command、event、capability、layout slot 这些平台级抽象。

Studio 的扩展 manifest 至少应显式声明以下信息。

```json
{
  "id": "kal.problems",
  "kind": "studio-extension",
  "host": "browser",
  "activationEvents": [
    "onView:problems",
    "onCommand:kal.problems.focus",
    "onEvent:diagnostics.updated"
  ],
  "capabilities": [
    "project.read",
    "engine.debug"
  ],
  "contributes": {
    "views": [],
    "panels": [],
    "commands": []
  }
}
```

这里最关键的不是 manifest 字段多少，而是三件事必须显式化：运行宿主、激活条件、能力请求。

### 7.2 官方工作流扩展：官方能力是平台 API 的压力测试

这里的官方工作流扩展，指的都是官方发布、可选安装的一方扩展。在 Flow / Session 之外，Studio 的绝大多数官方能力都更适合以这一形式交付。但这些能力不必在同一阶段迁移；更一致的做法是按依赖强度和阶段目标分组 dogfood。

优先进入 Phase 2 的验证组包括：

- `kal.problems`
- `kal.prompt-preview`
- `kal.debugger`
- `kal.state-editor`
- `kal.config-editor`
- `kal.version-control`

更适合在 Phase 3 随 run/debug/event stream 与 review 工作台一起接入的工作流组包括：

- `kal.comments`
- `kal.review`
- `kal.terminal`
- `kal.vercel-deploy`

更适合在 Phase 4 随 packages/templates 能力一起接入的分发组包括：

- `kal.template-browser`
- `kal.package-manager`

其中，`kal.version-control` 有一个特别重要的职责：它不是简单复刻 Git 面板，而是要直接 dogfood Studio 的 resource version、semantic diff、checkpoint、restore 与 review 接口。第一版更应是“项目语义历史优先、Git 集成可后接”，而不是一开始就把版本管理收窄成源码托管适配器。

这些官方扩展共同覆盖了 Studio 最需要验证的扩展表面：panel/view 注册、inspector 接入、command bus、run/debug service、version history、event stream、long-running job progress、layout restoration、capability gate。只要它们还不得不频繁绕过平台边界访问私有状态，就说明 Kernel API 还不成熟。

### 7.3 Third-party Extensions：开放的是少量高价值扩展面

初期值得对第三方开放的贡献类型包括：

- `nodes`
- `inspectors`
- `commands`
- `views`
- `panels`
- `debugViews`
- `lints`
- `codeActions`
- `templates`
- `starters`
- `themes`
- `exporters`
- `shareTargets`
- `commentProviders`

但这些贡献都应建立在稳定契约上，而不是暴露 Kernel 私有实现。

### 7.4 Capability-based trust model

结合 VS Code、Grafana、Backstage 和 Unity/Godot 的经验，KAL 应采用 capability-based trust model，而不是简单的 trusted / untrusted 两档。建议至少区分以下能力：

- `project.read`
- `project.write`
- `engine.execute`
- `engine.debug`
- `trace.read`
- `network.fetch`
- `process.exec`
- `package.install`
- `package.publish`
- `comment.write`
- `review.accept`
- `ai.invoke`

能力应进一步具备以下元信息：

- `required` / `optional`
- `browser` / `workspace` / `service`
- `project-scoped` / `user-scoped` / `org-scoped`
- 审批策略与提示文案
- 是否允许在受限模式下降级运行

这意味着 `kal.theme` 与 `kal.terminal` 绝不应处于同一权限层级；`kal.prompt-preview` 与 `kal.vercel-deploy` 也不应拥有同样的默认授权。

### 7.5 包体系与分发路径

KAL 的包体系应尽早统一到一份可机器消费的 package manifest 上，并至少区分以下种类：

- `node-pack`
- `studio-extension`
- `template-pack`
- `starter-pack`
- `theme-pack`

每一种包都应有统一的 manifest、文档、samples/examples、tests 与 capability 声明结构。一个更稳妥的目录边界可以是：

```text
package/
├── manifest.json
├── runtime/
├── studio/
├── templates/
├── tests/
├── examples/
└── docs/
```

公开 marketplace 应晚于四件事：

1. 包结构稳定。
2. capability 模型稳定。
3. 签名 / provenance / 来源提示可用。
4. 一方扩展已经把主要平台 API dogfood 过一轮。

在此之前，更现实的顺序是：项目本地安装 -> 团队私有 registry -> 有审计的共享目录 -> 公开市场。

## 8. Agent 协作、Review 与未来协作能力

### 8.1 Agent 不应直接写文件

Studio 中的 AI 助手不应直接拥有任意写文件的权限。更稳妥的模型是：

`query project graph -> produce proposal -> render semantic diff -> human review -> apply transaction -> validate -> persist`

proposal bundle 至少应包含：

- 目标与意图说明
- touched resources
- semantic operations
- 预期 diagnostics 变化
- 推荐验证步骤
- 风险提示与回滚策略

人类看到的也不应只是文本 diff，而应同时看到：

- 语义级变更摘要
- 受影响资源
- 相关 diagnostics / references
- 建议执行的 lint / smoke / debug 操作

### 8.2 Review 应与 Run / Debug 联动

对 KAL 来说，review 不是代码审查的简化版，而是运行验证工作流的一部分。一个 proposal 或 transaction 如果不能回答下面三个问题，审查就不完整。

1. 它改动了哪些语义对象。
2. 它会影响哪些 run 路径、diagnostics 或 state key。
3. 它应通过哪些验证操作来证明自己成立。

因此，Studio 的 Review 面板应天然接入：

- `kal lint`
- `kal smoke`
- `kal debug`
- `kal.version-control`
- managed run summaries
- trace diff / state diff

### 8.3 协作的正确顺序：version 先于 presence，presence 先于 CRDT

Yjs 的启发不是“立刻做多人实时协同”，而是提醒我们把协作状态分层。

更合理的顺序是：

1. P0 / P1：所有资源都有 version，所有修改都有 origin，采用 optimistic concurrency。
2. P3：在 review 工作台稳定后加入 comments 与 review coordination。
3. 更后期：再加入 presence、who-is-looking-at-what、review assignment 等更强的协作层。
4. 如果真的有必要，再评估局部 CRDT 或 shared editing 层，但 canonical persistence 仍通过 Engine transaction 落盘。

这意味着未来即便要支持多人协作，最先出现的也应该是“你正在看哪个 flow、谁提交了 proposal、谁在 review 这个 run”，而不是从第一天就追求多光标同时编辑同一 flow 图。

## 9. 与当前实现的映射

这份设计不是另起炉灶，而是要把已有实现重新编排。

### 9.1 现有 Editor 对应什么

`apps/editor/src/App.tsx` 现在采用的是“一个应用里切换四个主视图”的结构。这说明我们已经有了最基本的 shell 和多视图需求，但这些视图尚未被统一收敛到 shell slots、layout presets、统一 command/context 系统上。

`apps/editor/src/store/projectStore.ts` 当前缓存了 project、flows、session、node manifests 和 managed run 入口。这是很好的起点，但从 Studio 角度看，它仍然是一个前端聚合 store，而不是平台级 resource/document/transaction 模型。下一步不应只是继续把更多状态塞进这个 store，而应把它拆解为 Kernel services 与 derived indexes。

### 9.2 现有 Engine 对应什么

`apps/engine/src/runtime.ts` 已经具备 project loading、flow/session 读写、node manifests、managed run 等能力；`apps/engine/src/studio-server.ts` 已经证明 `kal studio` 可以统一承载 Editor 静态资源与 Engine API。这说明 Studio 的 platform services 并不是从零开始。

更重要的是，`kal lint`、`kal smoke`、`kal debug --format agent`、`kal schema` 已经把验证、调试、结构化输出和 agent 友好接口打通了。这些能力未来应被 Studio 直接消费，而不是仅作为 CLI 附属品存在。反过来说，Studio 也不能把它们重新包成“只有打开 Studio 才能用”的能力；它们必须继续是 Engine 的原生能力。

### 9.3 当前最需要补齐的空白

与本文提议相对照，当前最明显的缺口包括：

1. 统一的 resource/document/version/transaction 模型。
2. diagnostics / references / prompt preview / trace 查询的稳定服务接口。
3. panel / view / inspector / debug view 的统一注册与恢复机制。
4. capability gate 与 extension host runtime。
5. review / proposal 协调层。
6. layout presets、workspace restore 与任务态工作区。

这也解释了为什么 Phase 1 不该急着对外开放第三方扩展。平台主干尚未收敛，开放只会把内部临时结构固化为公共接口。

## 10. 分阶段演进与退出条件

### 10.1 Phase 1：Workbench Kernel

目标：让 Studio 先成为一个真正可用的工作台，而不是一个多视图拼盘。

重点：

- 统一 shell、tabs、slots、command palette、context keys
- 建立 resource/document/version/transaction 模型
- 建立 diagnostics、references、outline、search 的基础能力
- 将 Flow / Session 收敛为官方发布、可选安装的受控核心扩展，并让其直接压测 Kernel 契约
- 打通 layout restore 与工作区预设

退出条件：

- Flow / Session 不再直接依赖私有全局 store
- 打开项目后可以稳定恢复上次工作区状态
- 保存、撤销、重做、重载、diagnostics 刷新进入同一事务链
- `kal serve`、`kal play`、`kal debug` 等无 Studio 路径不因 Studio kernel 引入额外启动依赖

### 10.2 Phase 2：官方工作流扩展压测

目标：用官方扩展压测平台边界，而不是直接开放第三方生态。

重点：

- 将 State / Config / Problems / Prompt Preview / Debugger 改造成官方发布、可选安装的一方扩展
- 提供 `version-control` 所需的 checkpoint、history、semantic diff、restore 接口
- 建立扩展 manifest、activation、host、capabilities 模型
- 建立 panel / view / inspector / debug view 的统一注册接口

退出条件：

- 一方扩展在不访问私有状态的情况下可稳定工作
- 扩展崩溃不会拖垮整个 workbench
- capability 授权与降级逻辑可用
- `version-control` 可以围绕同一套 transaction/version 模型完成 compare、checkpoint 与 restore

### 10.3 Phase 3：Run / Debug / Review 工作台

目标：把 Studio 从“可编辑”推进到“可验证、可审查”。

重点：

- 补齐 event stream、trace store、state diff、timeline、breakpoints、replay
- 建立 proposal bundle、semantic diff、review panel
- 接入 `comments`、`review`、`terminal`、`vercel-deploy` 等以验证工作流为中心的一方扩展
- 将 `kal lint`、`kal smoke`、`kal debug` 深度接入 Studio

退出条件：

- 一个 proposal 可以在 Studio 内完成查看、接受、验证和回滚
- run/debug/review 能围绕同一资源版本对照
- trace 与 diagnostics 已能支撑真实调试闭环

### 10.4 Phase 4：Packages、Templates 与 Team Distribution

目标：先做好团队级生态，再谈公开生态。

重点：

- package manager、template browser、starter creator
- team registry、签名、来源提示、capability 申明
- review policy 与 install policy

退出条件：

- 项目本地安装与团队私有分发路径稳定
- package manifest 与 capability 模型稳定
- 一方模板和扩展已经覆盖主要平台 API

### 10.5 Phase 5：Third-party Ecosystem 与高级协作

目标：在边界稳定后逐步开放第三方扩展与协作能力。

重点：

- 选择性开放 nodes / templates / inspectors / debug views / exporters
- 引入 presence、review assignment 与更强的协作层
- 视实际需要评估更强的 shared editing 能力

退出条件：

- 第三方扩展不需要依赖私有实现即可解决有价值问题
- capability、签名、恢复、崩溃隔离、审计都已可用

## 11. 开放问题与建议暂缓事项

### 11.1 仍需明确的问题

1. `state` 在 Studio 中是“可编辑资源”还是“主要用于调试观察的运行产物”，两者的边界要多清楚。
2. `prompt-preview` 是单独 panel、右侧 inspector tab，还是 review 工作流的一部分。
3. `terminal`、`deploy`、`package install` 是否都统一走 workspace host，还是某些场景直接由 Engine 服务承接。
4. `version-control` 的第一版应以 Studio 自身的 checkpoint/history 为主，还是同步暴露 Git branch/commit 视图。
5. proposal bundle 是否需要独立资源类型，还是 transaction batch 的富化视图。
6. 是否要为 task presets 提供项目级共享能力，以便团队共享 `debug` / `review` / `history` 工作区布局。

### 11.2 当前应暂缓的事项

1. 完整 marketplace。
2. 完整实时协同编辑。
3. 过早把 Flow / Session 迁移成外部扩展。
4. 把 React 组件树本身暴露为扩展 API。
5. 为了“看起来开放”而设计大量低价值扩展点。

## 12. 结论

KAL Studio 的正确方向，不是把现有 Editor 直接推向“大而全 IDE”，也不是把所有能力立刻做成插件。更合理的路径是：先以 Kernel 稳住语义资源、事务、诊断、布局、恢复和信任模型；再把 Flow / Session 收敛为官方发布、可选安装的受控核心扩展；再让其他官方能力以官方发布、可选安装的一方扩展方式 dogfood 平台 API；最后才逐步开放第三方生态。

换句话说，Studio 的首要任务不是“证明自己可以扩展”，而是“证明自己已经找到了正确的核心边界”。只有在这个前提下，扩展系统、模板系统、团队分发和 agent 协作才会放大优势，而不是放大混乱。

## 13. 参考资料

以下资料于 2026-03-16 查阅，均为官方一手材料。

- VS Code Extension Host: [https://code.visualstudio.com/api/advanced-topics/extension-host](https://code.visualstudio.com/api/advanced-topics/extension-host)
- VS Code Contribution Points: [https://code.visualstudio.com/api/references/contribution-points](https://code.visualstudio.com/api/references/contribution-points)
- VS Code Activation Events: [https://code.visualstudio.com/api/references/activation-events](https://code.visualstudio.com/api/references/activation-events)
- VS Code SCM API: [https://code.visualstudio.com/api/extension-guides/scm-provider](https://code.visualstudio.com/api/extension-guides/scm-provider)
- VS Code Custom Editors: [https://code.visualstudio.com/api/extension-guides/custom-editors](https://code.visualstudio.com/api/extension-guides/custom-editors)
- VS Code Workspace Trust: [https://code.visualstudio.com/api/extension-guides/workspace-trust](https://code.visualstudio.com/api/extension-guides/workspace-trust)
- Eclipse Theia Architecture Overview: [https://theia-ide.org/docs/architecture/](https://theia-ide.org/docs/architecture/)
- Eclipse Theia Extensions: [https://theia-ide.org/docs/extensions/](https://theia-ide.org/docs/extensions/)
- IntelliJ Plugin Services: [https://plugins.jetbrains.com/docs/intellij/plugin-services.html](https://plugins.jetbrains.com/docs/intellij/plugin-services.html)
- IntelliJ Workspace Model: [https://plugins.jetbrains.com/docs/intellij/workspace-model.html](https://plugins.jetbrains.com/docs/intellij/workspace-model.html)
- IntelliJ Extension Point and Listener List: [https://plugins.jetbrains.com/docs/intellij/intellij-community-plugins-extension-point-list.html](https://plugins.jetbrains.com/docs/intellij/intellij-community-plugins-extension-point-list.html)
- IntelliJ Version Control Integration Support: [https://www.jetbrains.com/help/idea/enabling-version-control.html](https://www.jetbrains.com/help/idea/enabling-version-control.html)
- IntelliJ Local History: [https://www.jetbrains.com/help/idea/local-history.html](https://www.jetbrains.com/help/idea/local-history.html)
- JupyterLab Extension Developer Guide: [https://jupyterlab.readthedocs.io/en/4.4.x/extension/extension_dev.html](https://jupyterlab.readthedocs.io/en/4.4.x/extension/extension_dev.html)
- JupyterLab Common Extension Points: [https://jupyterlab.readthedocs.io/en/stable/extension/extension_points.html](https://jupyterlab.readthedocs.io/en/stable/extension/extension_points.html)
- JupyterLab LayoutRestorer: [https://jupyterlab.readthedocs.io/en/stable/extension/extension_points.html#layoutrestorer](https://jupyterlab.readthedocs.io/en/stable/extension/extension_points.html#layoutrestorer)
- Node-RED Edit Dialog: [https://nodered.org/docs/creating-nodes/edit-dialog](https://nodered.org/docs/creating-nodes/edit-dialog)
- Node-RED Packaging: [https://nodered.org/docs/creating-nodes/packaging.html](https://nodered.org/docs/creating-nodes/packaging.html)
- Unity Package Layout: [https://docs.unity3d.com/Manual/cus-layout.html](https://docs.unity3d.com/Manual/cus-layout.html)
- Unity Scoped Registries: [https://docs.unity3d.com/Manual/upm-scoped.html](https://docs.unity3d.com/Manual/upm-scoped.html)
- Godot Making Plugins: [https://docs.godotengine.org/en/stable/tutorials/plugins/editor/making_plugins.html](https://docs.godotengine.org/en/stable/tutorials/plugins/editor/making_plugins.html)
- Godot Using the Asset Library: [https://docs.godotengine.org/en/stable/community/asset_library/using_assetlib.html](https://docs.godotengine.org/en/stable/community/asset_library/using_assetlib.html)
- Godot Version Control Systems: [https://docs.godotengine.org/en/stable/tutorials/best_practices/version_control_systems.html](https://docs.godotengine.org/en/stable/tutorials/best_practices/version_control_systems.html)
- Blender Workspaces: [https://docs.blender.org/manual/en/latest/interface/window_system/workspaces.html](https://docs.blender.org/manual/en/latest/interface/window_system/workspaces.html)
- Blender Add-ons: [https://docs.blender.org/manual/en/latest/advanced/scripting/addon_tutorial.html](https://docs.blender.org/manual/en/latest/advanced/scripting/addon_tutorial.html)
- Grafana Plugin Types and Usage: [https://grafana.com/developers/plugin-tools/key-concepts/plugin-types-usage](https://grafana.com/developers/plugin-tools/key-concepts/plugin-types-usage)
- Grafana Sign a Plugin: [https://grafana.com/developers/plugin-tools/publish-a-plugin/sign-a-plugin](https://grafana.com/developers/plugin-tools/publish-a-plugin/sign-a-plugin)
- Backstage Permissions Overview: [https://backstage.io/docs/permissions/overview](https://backstage.io/docs/permissions/overview)
- Backstage Software Templates: [https://backstage.io/docs/features/software-templates/](https://backstage.io/docs/features/software-templates/)
- Figma Plugin Docs: [https://www.figma.com/plugin-docs/](https://www.figma.com/plugin-docs/)
- Figma Dynamic Page Loading: [https://www.figma.com/plugin-docs/dynamic-page-loading/](https://www.figma.com/plugin-docs/dynamic-page-loading/)
- Figma Version History: [https://help.figma.com/hc/en-us/articles/360038006754-View-a-file-s-version-history](https://help.figma.com/hc/en-us/articles/360038006754-View-a-file-s-version-history)
- Unreal Engine Source Control: [https://dev.epicgames.com/documentation/en-us/unreal-engine/source-control-in-unreal-engine](https://dev.epicgames.com/documentation/en-us/unreal-engine/source-control-in-unreal-engine)
- Unity Version Control Smart Locks: [https://docs.unity.com/en-us/unity-version-control/smart-locks](https://docs.unity.com/en-us/unity-version-control/smart-locks)
- Yjs Y.Doc API: [https://docs.yjs.dev/api/y.doc](https://docs.yjs.dev/api/y.doc)
- Yjs Awareness & Presence: [https://docs.yjs.dev/getting-started/adding-awareness](https://docs.yjs.dev/getting-started/adding-awareness)
