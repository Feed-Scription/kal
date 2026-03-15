# KAL Studio 设计

**状态：设计说明**

这份文档不只讨论插件系统，而是把 KAL Studio 当作一个完整产品来设计。

目标不是做一个“什么都有”的 IDE，而是做一个让人类和 agent 都能高效使用的 AI-native 创作与调试工作台。

相关文档：

- [first-principles-architecture.md](./first-principles-architecture.md)
- [editor.md](./editor.md)
- [engine.md](./engine.md)
- [todo.md](./todo.md)

## 一、定位

KAL Studio 的定位应该是：

`一个 contract-first、agent-friendly、以运行验证为中心的可视化创作与调试工作台。`

它不是：

- 通用代码 IDE
- 通用游戏编辑器
- 通用低代码平台
- 通用前端搭建器

它要解决的是 5 个连续问题：

1. 人类能快速看懂项目现在是什么
2. 人类能用语义级方式修改它，而不是手搓 JSON
3. 人类能在同一个工作台里运行、验证、定位问题
4. agent 能通过稳定 contract 与 Studio 协作，而不是直接乱改文件
5. 能逐步形成可复用的 node / template / project 包生态

## 二、设计原则

### 1. 单一事实源

Studio 不能再维护一份独立 truth。

- node contract 以 runtime manifest 为准
- flow / session / state / config 以 engine 暴露的 canonical schema 为准
- Studio 中所有表单、诊断、代码动作、模板校验，都从同一份 contract 派生

### 2. 语义级编辑优先

用户操作应该尽量是：

- 改节点参数
- 改 prompt
- 改 flow 引用
- 改 session 跳转
- 改 state 字段

而不是：

- 打开 JSON 搜字段
- 猜某个引用名要不要同步改
- 手动保持多处定义一致

### 3. 运行与编辑是一条闭环

Studio 不应该只是“画图器”。

它至少要支持：

- 保存前后校验
- 单次执行
- Session 运行
- 执行轨迹查看
- 状态变化查看
- 错误定位到具体对象

### 4. 扩展优先，但内核不能空心

P0 功能可以尽量通过扩展机制交付，但以下内容必须由内核提供：

- 文档模型
- 事务与撤销重做
- 诊断系统
- 命令系统
- 工作台布局
- 扩展宿主
- 权限与信任
- 包管理与安装

### 5. 面向项目，而不是单个画布

KAL 的对象不是单一 Flow，而是：

- Project
- Flow
- Session
- State
- Config
- Node pack
- Trace
- Template

Studio 必须是项目级工作台，而不是“一个 flow canvas + 若干边栏”。

## 三、目标用户

### 1. AI-first Builder

主要通过 agent 生成和修改 KAL 项目，需要 Studio 来：

- 审查结构
- 确认 agent 提案
- 修小问题
- 跑验证

### 2. 玩法 / 叙事 / 系统设计者

不一定会直接写代码，但需要：

- 看懂游戏循环
- 改流程和配置
- 运行试玩
- 对问题加批注

### 3. 工程师

需要：

- 扩展 node
- 排查运行时问题
- 管理包和模板
- 接入自定义前端

## 四、核心工作流

Studio 至少要把下面 7 条主路径打通。

### 1. 打开并理解项目

- 连接本地或远程 Engine
- 加载 project 概览
- 查看 flows / session / state / config / nodes
- 查看诊断、缺失依赖、版本和信任状态

### 2. 编辑项目

- 新建、重命名、删除 Flow
- 编辑 Flow / Session
- 编辑 State / Config
- 调整节点配置和 prompt
- 自动更新跨资源引用

### 3. 验证项目

- 实时 schema 校验
- 保存校验
- lint
- smoke test
- 引用和依赖检查

### 4. 运行与调试

- 运行单个 Flow
- 运行 Session
- 看执行时间线
- 看节点输入输出
- 看 state diff
- 下断点和单步

### 5. 协作与审查

- 评论节点、边、字段、trace
- 附加“为什么这么改”的上下文
- 对 agent 生成的 patch 做 review

### 6. 复用与脚手架

- 从模板创建项目
- 从现有项目导出 template
- 安装 node pack / template pack
- 从 examples 反向生成 starter

### 7. 分享与发布

- 导出 zip / git-ready project
- 发布私有 registry
- 发布团队模板
- 分享只读 trace / review link

## 五、Studio 的产品边界

### 近期应该做

- 项目级编辑与调试工作台
- 和 Engine 打通的运行验证闭环
- 一方扩展体系
- 模板 / starter / package 基础能力

### 近期不应该做

- 通用 UI 搭建平台
- 重型多人实时协作平台
- 通用素材编辑器
- 复杂渲染和美术工具链
- 完整云端 IDE 替代品

## 六、信息架构

建议把 Studio 做成一个标准 workbench，而不是分散页面。

```text
┌──────────────────────────────────────────────────────────────┐
│ Top Bar                                                     │
│ Project Switcher | Search | Command Palette | Run | Share   │
├───────────────┬──────────────────────────────┬──────────────┤
│ Activity Rail │ Left Sidebar                 │ Inspector    │
│ Project       │ Explorer / Palette / Outline │ Properties   │
│ Search        │ Nodes / Templates / Packages │ References   │
│ Run           │                              │ Actions      │
│ Packages      │                              │              │
│ Review        │                              │              │
├───────────────┼──────────────────────────────┼──────────────┤
│               │ Main Editor Area                                  │
│               │ Tabs / Splits / Canvas / Custom Editors           │
├───────────────┴───────────────────────────────────────────────────┤
│ Bottom Panel: Problems | Trace | Console | State Diff | Comments │
├───────────────────────────────────────────────────────────────────┤
│ Status Bar: Engine | Trust | Diagnostics | Branch | Selection    │
└───────────────────────────────────────────────────────────────────┘
```

### 1. Top Bar

- 项目切换与连接状态
- 全局搜索
- 命令面板入口
- 运行、停止、重载
- 当前模式提示

### 2. Activity Rail

建议固定 6 个一等入口：

- `Project`
- `Search`
- `Run`
- `Packages`
- `Review`
- `Settings`

不要把每个功能都做成一级入口，避免像失控插件平台。

### 3. Left Sidebar

左侧不只是一棵树，应该支持不同视图：

- Explorer：项目资源树
- Palette：节点与模板目录
- Outline：当前资源结构
- References：反向引用
- Tasks：待修复问题和建议动作

### 4. Main Editor Area

主区域支持多标签和分屏。

资源类型建议对应不同 editor：

- Flow：图编辑器 + 原始 JSON fallback
- Session：图编辑器 + 原始 JSON fallback
- State：schema 表单 + JSON 树 + 文本 fallback
- Config：schema 表单 + 文本 fallback
- Trace：时间线 + 详情查看器
- Package：manifest 编辑器
- README / docs：Markdown 查看

### 5. Inspector

所有资源都尽量共享 Inspector 体验。

Inspector 不只是属性面板，还应包含：

- 基本属性
- 高级设置
- 来源与版本
- 反向引用
- 最近运行结果
- 建议动作

### 6. Bottom Panel

统一承载运行和诊断信息：

- Problems
- Trace
- Console
- State Diff
- Comments
- Tasks

这比把调试信息散落在多个弹窗里稳定得多。

## 七、核心对象模型

Studio 内部建议统一采用 resource/document 模型。

### 1. Canonical Resources

- `project`
- `flow:<id>`
- `session`
- `state`
- `config`
- `node-manifest`
- `package:<id>`
- `trace:<id>`
- `comment-thread:<id>`

### 2. Document Model

每个资源分为 3 层：

- canonical data：来自 engine 的事实数据
- derived view model：供 UI 渲染的派生结构
- ephemeral UI state：选择、高亮、折叠、缩放等

这样可以避免把 UI 状态和业务数据混在一起。

### 3. Transaction Model

所有编辑都走事务，而不是组件直接改 store：

- `applyOperation`
- `beginTransaction`
- `commitTransaction`
- `rollbackTransaction`

事务负责：

- 撤销重做
- 派生诊断刷新
- 跨资源联动更新
- autosave
- patch 生成

### 4. Reference Graph

Studio 需要显式维护项目级引用图：

- session 引用了哪些 flow
- 某 flow 调用了哪些 subflow
- 哪些节点读写哪些 state key
- 哪些模板依赖哪些 node pack

这会直接决定 rename、delete、publish、share 是否可靠。

## 八、功能设计

### A. Project Workspace

Project workspace 负责项目总览。

应支持：

- flows / session / state / config 总览
- 最近修改
- 未保存改动
- 诊断摘要
- 缺失依赖和不兼容包
- 项目元信息

建议加一张项目地图：

- Flow 数量
- Session 入口
- Node pack 依赖
- State 热点字段

### B. Flow Editor

Flow editor 是 Studio 的核心，但不应该只是一张图。

必须具备：

- 节点拖拽、连线、框选、复制粘贴
- palette 搜索与分类
- 快速插入节点
- schema 驱动配置面板
- Prompt 编辑器
- 自动布局
- 反向引用
- lint / code action
- 原始 JSON fallback

建议补充：

- node type / package source 可见
- 输入输出契约可见
- “为何校验失败”可解释
- 子 flow 抽取
- 常用节点组合转 template

### C. Session Editor

Session editor 的目标是表达交互节奏，不承载过重业务。

必须具备：

- RunFlow / Prompt / Choice / Branch / End 的可视化编辑
- step 级属性表单
- step 跳转验证
- 运行起点和终点检查
- session trace 对照

### D. State Editor

当前只读不够用，State editor 应升级为：

- schema 视图
- tree 视图
- 原始 JSON 视图
- 读写引用图
- 最近变化历史
- 初始值与运行时值对照

### E. Config Editor

Config editor 应支持：

- provider / model / retry / cache 等配置
- 环境相关字段标识
- 敏感字段遮罩
- 缺省值与覆盖值显示
- runtime compatibility 校验

### F. Search & References

这是“人类好用”里常被忽视但极重要的一块。

必须支持：

- 搜 flow 名
- 搜 node type
- 搜 state key
- 搜 prompt 文本
- 搜错误码
- 搜 comments
- 看 “谁引用了我”

### G. Problems & Code Actions

Problems 面板统一展示：

- schema 错误
- contract 冲突
- 缺失 flow / node / package
- session 跳转错误
- state key 漂移
- 不推荐配置

Code action 负责把问题变成可执行动作：

- 创建缺失 flow
- 修正引用名
- 提取 subflow
- 删除悬空边
- 把 prompt 拆到模板

### H. Run & Debug Workspace

这是 Studio 从“审查工具”升级成“工作台”的关键。

运行能力建议分 4 个层级：

1. Validate
2. Run once
3. Session play
4. Replay trace

调试界面至少应支持：

- 当前执行节点高亮
- 时间线
- node 输入输出快照
- state diff
- 错误堆栈
- 断点
- 单步
- 重新运行

运行相关对象建议统一成 trace：

- `runId`
- `resourceId`
- `startedAt`
- `finishedAt`
- `status`
- `events[]`
- `snapshots[]`

### I. Review & Comments

协作不一定先上实时多人编辑，但 review 需要尽早支持。

评论对象应能绑定到：

- flow
- node
- edge
- session step
- state key
- trace event

评论线程建议独立存储，不直接写入业务文件。

### J. AI Assistant

Studio 中的 AI 不应直接拥有“任意写项目文件”的能力。

更好的模型是：

- AI 读取 project graph 和 diagnostics
- 生成结构化 proposal
- Studio 渲染 proposal diff
- 用户确认后形成 transaction

proposal 类型建议包括：

- 新增 flow
- 修改 node config
- 重命名引用
- 提取 subflow
- 生成 starter
- 修复诊断问题

## 九、扩展架构

### 1. 总原则

不是“所有东西都是插件”，而是：

`Kernel + First-party Extensions + Third-party Extensions`

### 2. Kernel 负责什么

- workbench shell
- 文档模型
- 事务系统
- 命令总线
- 诊断系统
- 搜索和引用图
- 包管理
- 权限与信任
- 扩展宿主
- 保存与恢复
- 同步协议

### 3. First-party Extensions 负责什么

建议把这些都实现为官方扩展，用来压测 API：

- `kal.flow-editor`
- `kal.session-editor`
- `kal.state-editor`
- `kal.config-editor`
- `kal.debugger`
- `kal.template-browser`
- `kal.package-manager`
- `kal.comments`

### 4. Third-party Extensions 允许贡献什么

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

### 5. 双宿主模型

建议采用双宿主：

- `ui host`
  - 运行浏览器侧扩展
  - 负责 view、panel、inspector、theme
- `workspace host`
  - 运行 engine 侧扩展
  - 负责 node、lint、code action、template、package、debug adapter

这比单一宿主更接近 VS Code 的 `ui/workspace` 分工，也更符合 KAL 现有 browser + engine 结构。

### 6. 权限模型

不要只有 trusted / untrusted 两档，建议 capability-based：

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

### 7. 激活模型

扩展必须懒激活，例如：

- 打开某类资源时
- 进入某个 workspace 时
- 执行某个命令时
- 开始某个 debug session 时

不要 Studio 启动即加载全部扩展。

## 十、包、模板、分享、市场

### 1. 包类型

建议把可分发对象统一纳入 package 系统，但保留种类：

- `node-pack`
- `studio-extension`
- `template-pack`
- `starter-pack`
- `theme-pack`
- `project-template`

### 2. 包结构

可借鉴 Unity 的清晰分层，但适配 KAL：

```text
<root>
├── kal-package.json
├── README.md
├── CHANGELOG.md
├── LICENSE
├── engine/
├── studio/
├── templates/
├── examples/
├── tests/
└── docs/
```

### 3. 安装来源

首批建议支持：

- local path
- git URL
- tarball / zip
- private registry

public marketplace 可以后置。

### 4. 模板与 starter

模板浏览器应内建到 Studio，但模板内容本身可由 package 贡献。

模板至少分 3 类：

- node recipe
- flow template
- project starter

### 5. 分享

分享不只是一键上传市场。

更实用的分享对象是：

- 导出项目包
- 导出 template
- 导出 trace
- 生成 review bundle
- 发布到团队 registry

### 6. 市场

市场应晚于：

- 包结构稳定
- 权限模型稳定
- 签名 / 信任 / 审核策略稳定
- 一方扩展验证过 API

否则只会过早固化错误边界。

## 十一、运行时与调试架构

为了让 Studio 真正可用，Engine 需要从“请求-响应 API”升级为“命令 + 事件流”双通道。

```text
Studio UI
  ├── Query API      -> 获取 project / resources / manifests / packages
  ├── Command API    -> 保存、运行、安装、发布、评论
  └── Event Stream   -> trace、diagnostics、reload、package progress

Engine / Studio Gateway
  ├── Project Loader
  ├── Runtime
  ├── Validation Engine
  ├── Trace Store
  ├── Package Manager
  └── Extension Workspace Host
```

### 1. Query API

- `getProject`
- `listResources`
- `getResource`
- `getDiagnostics`
- `getReferenceGraph`
- `listPackages`
- `listTemplates`

### 2. Command API

- `applyTransaction`
- `runFlow`
- `runSession`
- `stopRun`
- `installPackage`
- `publishPackage`
- `createFromTemplate`
- `createComment`

### 3. Event Stream

- `project.reloaded`
- `resource.changed`
- `diagnostics.updated`
- `run.started`
- `run.event`
- `run.finished`
- `package.install.progress`
- `package.publish.progress`

## 十二、协作设计

### 1. 先做异步协作

第一阶段不要上来就做 Google Docs 式实时协作。

更实际的是：

- 评论
- review 请求
- shareable trace
- patch proposal
- resource diff

### 2. 再做同步协作

如果后面做多人编辑，建议基于 transaction / CRDT 层，而不是直接同步 React state。

### 3. Agent 协作

agent 协作也应走同一条通路：

- 读取资源
- 生成 proposal
- 挂诊断和说明
- 等待人工确认

不要给 agent 绕过 Studio transaction 的直写口子。

## 十三、从现有 Editor 演进到 Studio

你们现在的 editor 已经有几个正确前提：

- 通过 Engine API 工作
- 用 runtime manifest 驱动节点
- 有 Flow / Session 基本画布

问题是还停留在“审查工具”。

建议的演进顺序：

### Phase 1: Workbench Kernel

- 统一 shell、tabs、panel、command palette
- 建立 resource/document 模型
- 建立事务、undo/redo、diagnostics

### Phase 2: First-party Editors

- 把 Flow / Session / State / Config 都做成一方 editor
- 补 rename/delete/reference update
- 补 problems / code actions / search

### Phase 3: Run & Debug

- 增加事件流
- 增加 trace store
- 增加 timeline / state diff / breakpoints

### Phase 4: Package & Template

- 定义 package manifest
- 做 package manager
- 做 template browser 和 starter creator

### Phase 5: Review & Share

- comments
- review bundle
- template export
- private registry publish

### Phase 6: Third-party Ecosystem

- 开放第三方扩展
- 开放第三方 registry
- 最后再考虑 public marketplace

## 十四、从外部产品得到的经验

### VS Code

该学的：

- contribution points
- extension host 隔离
- `ui/workspace` 运行位置区分
- lazy activation
- trust / private marketplace / allowed extensions

不要照抄的：

- 过度泛化成通用 IDE 平台
- 大量 webview 黑盒

### Unity

该学的：

- package layout 清晰分层
- editor/runtime/tests/docs 分离
- scoped registry
- inspector 的数据绑定和 undo
- reload 后状态恢复

不要照抄的：

- 过重的资产和渲染工具链复杂度

### Godot

该学的：

- 轻量插件体验
- dock / inspector / main screen 分级扩展点
- project-local addons
- editor 内安装与导入体验

不要照抄的：

- 让插件直接深度耦合内部 UI 生命周期

### Node-RED

该学的：

- node-first 生态
- palette + config UI + package 分发
- 子流程封装思路

要警惕的：

- 子流程打包与依赖关系在工具不成熟时会很脆

## 十五、建议的首版定义

如果只给 KAL Studio 一个最小但正确的首版定义，我建议是：

`一个项目级 workbench，内建 Flow / Session / State / Config 编辑器、统一问题面板、运行追踪面板、模板浏览器，以及一套只对一方扩展开放的扩展内核。`

这比“先做市场”更对，也比“继续只做轻量审查图形界面”更有价值。

## 十六、参考资料

以下资料在 2026-03-15 查阅，主要来自官方文档：

- VS Code Extension Host: https://code.visualstudio.com/api/advanced-topics/extension-host
- VS Code Contribution Points: https://code.visualstudio.com/api/references/contribution-points
- VS Code Custom Editors: https://code.visualstudio.com/api/extension-guides/custom-editors
- VS Code Webviews UX: https://code.visualstudio.com/api/ux-guidelines/webviews
- VS Code Workspace Trust: https://code.visualstudio.com/api/extension-guides/workspace-trust
- VS Code Extension Runtime Security: https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security
- VS Code Private Marketplace / Enterprise extensions: https://code.visualstudio.com/docs/enterprise/extensions
- Unity package layout: https://docs.unity3d.com/2019.4/Documentation/Manual/cus-layout.html
- Unity custom editor window: https://docs.unity3d.com/2023.2/Documentation/Manual/UIE-HowTo-CreateEditorWindow.html
- Unity custom inspector: https://docs.unity3d.com/2023.1/Documentation/Manual/UIE-HowTo-CreateCustomInspector.html
- Unity scoped registry: https://docs.unity3d.com/current/Documentation/Manual/upm-scoped-use.html
- Godot making plugins: https://docs.godotengine.org/en/stable/tutorials/plugins/editor/making_plugins.html
- Godot EditorPlugin: https://docs.godotengine.org/en/stable/classes/class_editorplugin.html
- Godot Asset Library: https://docs.godotengine.org/en/stable/community/asset_library/using_assetlib.html
- Node-RED packaging: https://nodered.org/docs/creating-nodes/packaging.html
- Node-RED subflow modules: https://nodered.org/docs/creating-nodes/subflow-modules
