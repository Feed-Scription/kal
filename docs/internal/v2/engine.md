# Engine 模块

Engine 是 KAL 的命令行执行入口和运行时服务，提供 CLI 和 HTTP API 两种使用方式。

## CLI 命令

### `kal run`

运行 KAL 项目。

```bash
kal run [project-path]
```

### `kal serve`

启动 HTTP 服务，供编辑器或其他工具调用。

```bash
kal serve [project-path] [--port <port>]
```

### `kal init`

初始化新的 KAL 项目（生成目录结构和默认配置）。

### `kal validate`

验证项目配置和 flow 定义（JSON 格式、DAG 结构、类型匹配等）。

## HTTP API

### 项目

- `GET /api/project` — 获取项目信息
- `POST /api/project/reload` — 重新加载项目

### Flow 执行

- `POST /api/flow/trigger` — 触发 SignalIn 节点
- `GET /api/flow/status/:executionId` — 查询执行状态
- `POST /api/flow/stop/:executionId` — 停止执行

### State

- `GET /api/state` — 获取所有 state
- `GET /api/state/:key` — 获取指定 state
- `POST /api/state/:key` — 设置/修改 state
- `DELETE /api/state/:key` — 删除 state
- `POST /api/state/reset` — 重置为初始状态

### Node

- `GET /api/nodes` — 获取所有可用 node 类型（内置 + 自定义）
- `GET /api/nodes/:type` — 获取指定 node 类型的定义

## 项目配置（kal_config.json）

```json
{
  "name": "my-game",
  "version": "1.0.0",
  "engine": {
    "logLevel": "info",
    "maxConcurrentFlows": 10,
    "timeout": 30000
  },
  "llm": {
    "provider": "openai",
    "apiKey": "${OPENAI_API_KEY}",
    "defaultModel": "gpt-4"
  },
  "image": {
    "provider": "openai",
    "apiKey": "${OPENAI_API_KEY}"
  }
}
```

## 执行流程

```
加载 kal_config.json → 加载 initial_state.json
  → 扫描 flow/*.json → 扫描 node/*.ts
  → 构建 DAG、验证类型 → 初始化 state store
  → 等待信号触发（CLI 输入 / HTTP 请求 / Timer）
```

## 错误处理

- Node 执行失败：中断当前分支，其他独立分支继续
- 类型不匹配：加载时检测，拒绝加载
- 超时：超过 timeout 强制终止
- 循环引用：加载时检测，拒绝加载
