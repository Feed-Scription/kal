# Engine 模块

**状态：未完成**

Engine 在整体架构中是非常重要的一层，但当前仓库中并没有独立实现。V5 不再把它写成一个已经存在的 CLI/API 服务，而是把它视为**规划中的宿主层**。

## Engine 在架构中的职责

Engine 按设计应当负责：

1. 加载项目目录
2. 读取配置、Flow、初始 State 和自定义 Node
3. 创建并持有 Core 实例
4. 提供 CLI
5. 提供 HTTP API
6. 记录日志、执行历史和运行事件
7. 为 Editor 提供统一服务入口

一句话说，Engine 是把 Core 变成“可运行产品能力”的那一层。

## 当前缺失项

当前仓库里，以下 Engine 能力都没有独立实现：

- `apps/engine` 模块
- `kal init`
- `kal validate`
- `kal run`
- `kal serve`
- 项目目录加载器
- HTTP API
- 热重载
- 统一错误响应模型
- 执行事件流
- 日志文件输出
- Telemetry 查询服务

因此，V4 中大量 CLI 与 REST API 设计在当前仓库里都还不存在。

## 当前与 Core / Editor 的关系

### 与 Core 的关系

目标关系：

```text
Engine -> Core
```

Engine 应当：

- 构造 `KalConfig`
- 加载 `FlowDefinition`
- 初始化初始 State
- 注册自定义 Node
- 调用 Core 执行 Flow

当前状态是：

- Core 已存在
- 但没有 Engine 去承接这些宿主职责

### 与 Editor 的关系

目标关系：

```text
Editor -> Engine -> Core
```

当前状态是：

```text
Editor -> 本地文件
Core -> 独立存在
```

也就是说，Editor 还没有与 Engine 建立连接，因为 Engine 本身还没有落地。

## V5 对 Engine 的文档策略

V5 不再保留 V4 那种详细 API/CLI 设计正文，原因很简单：

- 当前实现中没有对应代码
- 继续把它写成完整接口文档，会误导读者认为功能已存在

因此，V5 中 Engine 文档只做三件事：

1. 说明它在架构中的职责
2. 说明当前尚未落地
3. 给出下一阶段最小落地范围

## 下一阶段最小落地范围

如果后续开始实现 Engine，建议最小范围如下：

### 1. 项目加载

最小能力：

- 读取 `kal_config.json`
- 读取 `initial_state.json`
- 读取 `flow/*.json`
- 构造 Core 实例

### 2. 基础 CLI

最小命令：

- `run`
- `serve`

这两个命令足以把 Core 从“库”变成“可用执行入口”。

### 3. 最小 HTTP API

最小接口：

- 读取项目信息
- 获取 Flow 列表与 Flow 内容
- 保存 Flow
- 触发一次 Flow 执行
- 获取 Node manifest

### 4. Editor 集成支点

只要有了最小 HTTP API，Editor 才能开始从“本地模式”转向“服务模式”。

## 当前最准确的定位

当前 Engine 不是一个可用模块，而是：

- 一个清晰存在于架构中的空位
- Core 服务化和产品化所必需的宿主层
- Editor 与 Core 打通之前必须补上的那一层

所以在 V5 里，Engine 应被视为**下一阶段实现对象**，而不是现有能力。
