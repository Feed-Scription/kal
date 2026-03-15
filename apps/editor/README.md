# KAL Editor

KAL Editor 是一个连接 `kal serve` 的前端审查工具，不再直接读写本地文件。

## 定位

- 查看和轻调 `Flow`
- 查看和轻调 `Session`
- 基于 runtime manifest 渲染节点
- 提供薄的 Session runtime 面板，用 `RunView + SSE` 驱动交互

Editor 不是主要创作工具，也不是最终游戏 UI。

## 快速开始

```bash
# 1. 启动 engine
kal serve <project-path>

# 2. 启动 editor
cd apps/editor
pnpm install
pnpm dev
```

默认连接 `http://localhost:3000`。如需修改，设置 `VITE_ENGINE_URL`。

## 主要能力

- Flow 列表、Flow 画布、自动保存
- Session 画布、自动保存
- 单次 Flow 执行面板
- Session runtime 面板：
  - `POST /api/runs`
  - `POST /api/runs/:id/advance`
  - `GET /api/runs/:id/stream`

## 开发

```bash
pnpm build
```

构建会做 TypeScript 检查并产出 Vite bundle。
