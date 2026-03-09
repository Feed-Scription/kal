# Editor 模块

**状态：部分完成**

Editor 当前不是一个通过 Engine API 驱动的前端，而是一个**纯前端本地文件编辑器**。它通过浏览器的 File System Access API 直接读写本地 KAL 项目目录。

这和 V4 中“Editor 通过 Engine 的 HTTP API 工作”的描述不同。V5 以当前代码实现为准。

## 当前已实现能力

### 1. 本地项目打开

当前 Editor 可以：

- 让用户选择本地项目目录
- 读取 `kal_config.json`
- 读取 `flow/*.json`
- 读取可选的 `initial_state.json`

项目结构要求已经体现在界面中，浏览器要求也已明确。

### 2. Flow 列表管理

当前已支持：

- 查看 Flow 列表
- 创建 Flow
- 重命名 Flow
- 删除 Flow
- 切换当前 Flow

这些操作都是直接修改本地 `flow/*.json` 文件，而不是通过服务端 API。

### 3. Flow 画布编辑

当前已支持：

- React Flow 画布渲染
- 内置节点展示
- 拖拽节点
- 连线
- 右键菜单添加节点
- 小地图与控制面板

当前画布主要目标是编辑和保存，而不是执行和调试。

### 4. 保存与导出

当前已支持：

- 自动保存
- 手动保存
- `Ctrl/Cmd + S`
- 导出当前 Flow 为 JSON
- 保存状态栏反馈

保存目标是本地项目目录中的对应 JSON 文件。

### 5. State 编辑

当前已支持：

- 查看当前 `initial_state.json`
- 添加 State
- 编辑 State 值
- 删除 State
- 保存回本地文件

当前 State 页编辑的是项目初始状态文件，不是运行时在线状态。

### 6. Config 编辑

当前已支持：

- 编辑项目名和版本
- 编辑 engine 配置
- 编辑 llm 配置
- 编辑部分 retry 配置
- 保存回 `kal_config.json`

当前是手写表单，不是 schema 驱动表单。

## 部分完成的能力

### 1. 节点编辑体验

**状态：部分完成**

已实现：

- 节点渲染
- 节点默认配置
- 基础画布交互

未实现：

- 更完整的节点级配置体验
- 类型感知的连线校验
- 基于 manifest 的动态节点面板

### 2. SubFlow 编辑体验

**状态：部分完成**

已实现：

- `SubFlow` 节点已在编辑器中注册
- 可以像其他内置节点一样被添加到画布、连线和保存

未实现：

- 双击进入子 Flow
- 面包屑导航
- 父子 Flow 接口同步

### 3. 项目编辑器整体框架

**状态：部分完成**

当前已经具备一个可用的本地编辑器壳，但还没有形成“完整作者工具”的闭环，因为运行、调试、校验这条链没有接上。

## 当前未完成能力

以下能力在 V4 文档中描述较多，但当前代码并未实现：

- 运行 Flow
- 执行高亮
- 节点级调试详情
- SSE 执行事件流
- 运行时 State 同步
- 通过 Engine API 加载和保存项目
- 动态 `configSchema` 表单
- JSON 源码视图
- Flow 保存前远程校验
- Telemetry 面板

其中最关键的一点是：

**当前 Editor 不能执行 Flow。**

当前点击“运行”只会弹出“功能待实现”的提示，还没有真正执行 Flow 的能力。

## 当前架构关系

当前 Editor 的真实工作链路是：

```text
浏览器 UI -> File System Access API -> 本地项目文件
```

而不是：

```text
浏览器 UI -> Engine HTTP API -> Core
```

这意味着：

- 优点：无需后端即可编辑项目，离线可用
- 限制：无法获得服务端执行、调试、校验、运行时状态等能力

## 当前最准确的定位

当前 Editor 更适合被描述为：

- 一个 KAL 项目的本地可视化编辑器
- 一个 Flow / State / Config 的 JSON 编辑前端
- 一个未来可接入 Engine 的作者工具雏形

而不是完整的在线调试工作台。

## 后续与 Engine 的关系

未来如果 Engine 落地，Editor 的理想演进方向是：

```text
Editor -> Engine API -> Core
```

到那时才适合恢复以下能力：

- 运行 Flow
- 执行监控
- 节点级调试
- 远程校验
- 在线状态同步

在此之前，V5 文档默认把 Editor 视为”本地模式”。

## 下一阶段相关改进

Core 侧规划了 Flow JSON meta/data 分离（详见 [core.md 改进 #5](./core.md#改进-5flow-json-meta--data-分离)），这会直接影响 Editor：

- Editor 当前读写的 `flow/*.json` 结构会从扁平变为 `{ meta, data }` 两层
- `projectStore.ts` 的 `loadProject` / `saveFlow` / `createFlow` 等方法需要适配新结构
- Editor 关心的 `position` 等视觉信息仍保留在 `NodeDefinition` 中，不受影响
