# KAL Studio

KAL Studio 是 KAL 的项目级工作台，既可以通过 `kal studio` 一体化启动，也可以在前端开发模式下连接独立的 Engine HTTP API。

Studio 通过 Engine API 读写项目资源，不直接操作本地文件。

## 定位

- 查看和轻调 `Flow`
- 查看和轻调 `Session`
- 基于 runtime manifest 渲染节点
- 提供薄的 Session runtime 面板，用 `RunView + SSE` 驱动交互

Studio 不是最终游戏 UI，而是围绕 Flow / Session / State / Config / Run 的工作台。

## 快速开始

推荐直接使用一体化入口：

```bash
# 启动 Studio + Engine
kal studio <project-path>
```

如果你要单独开发前端，可以使用双进程模式：

```bash
# 1. 启动 engine
kal serve <project-path>

# 2. 启动 studio
cd apps/studio
pnpm install
pnpm dev
```

默认连接 `http://localhost:3000`。如需修改，设置 `VITE_ENGINE_URL`。

## 主要能力

- Flow 列表、Flow 画布、自动保存
- Session 画布、自动保存
- 单次 Flow 执行与 Prompt Preview
- Managed run / Debugger / Trace / State Diff
- Problems、Config、Version Control、Review、Comments
- Packages、Template Browser、Terminal
- Session runtime 面板，基于 `/api/runs` 与 SSE 驱动交互

## 开发

```bash
pnpm build
```

构建会做 TypeScript 检查并产出 Vite bundle。
