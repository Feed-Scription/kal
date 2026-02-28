# Editor-UI 模块

Editor-UI 是 KAL 的可视化编辑器，Web 应用，通过浏览器访问，连接 Engine 的 HTTP API 进行操作。

## 核心功能

### Flow 可视化编辑

- 节点画布：拖拽添加 node，连线连接 handler
- 节点属性面板：编辑 node 的输入参数值、config 配置
- 连线管理：连接/断开 handler，类型不匹配时提示
- 子 Flow：将 flow 文件作为子节点引用到当前 flow 中
- 节点库：浏览所有可用 node 类型（内置 + 自定义），拖拽到画布

### State 管理

- 查看当前所有 state 键值
- 编辑 initial_state.json（添加/删除/修改 state 定义）
- 运行时 state 查看（连接 Engine 服务时）

### 项目配置管理

- 编辑 kal_config.json（引擎设置、LLM 配置、图像服务配置等）
- 项目信息总览

## 页面结构

### Flow 编辑页

- 左侧：节点库（按分类展示可用 node）
- 中央：画布（DAG 可视化编辑）
- 右侧：属性面板（选中 node 的输入参数、config 编辑）

### State 管理页

- State 列表（key、type、当前值）
- 添加/编辑/删除 state

### 项目设置页

- kal_config.json 的表单化编辑

## 与 Engine 的交互

Editor-UI 通过 Engine 的 HTTP API（`kal serve`）进行所有操作：

- 读取/保存 flow JSON
- 读取/修改 state
- 获取可用 node 类型列表
- 读取/保存项目配置
