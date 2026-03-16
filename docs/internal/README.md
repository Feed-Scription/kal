# Internal Development Documents

This directory contains the current architecture and design documents for KAL.

For user-facing documentation, see the [docs root](../README.md).

## Current Documents (v5/)

- **first-principles-architecture.md** — 架构收敛清单：contract-first、manifest-first、validation 前移
- **engine.md** — Engine 模块实现状态（CLI、HTTP API、Managed Run、TUI）
- **studio.md** — Studio 产品设计（Workbench、扩展架构、包系统）
- **agent-debug.md** — `kal debug` 的 Agent 友好调试方案
- **core.md** — Core 模块设计（Node、Flow、Session、State）

## Design Evolution Summary

v1–v4 的技术文档已归档移除。以下是设计演进脉络：

### V1：全功能 SDK（2026.02）

给程序员用的 TypeScript 库。9 个模块（model、state、prompt、tools、safety、observe、infra、flow 等）通过 `KalCore` 入口类组装。设计完备但太重——三层缓存、向量存储、MCP 协议、内容安全全都有，像通用 AI 基础设施框架而非游戏引擎。

仓库结构包含 `packages/core`、`packages/simulator`、`packages/recorder`、`packages/replayer`、`packages/inspector`、`packages/ab-test`、`apps/engine`、`apps/editor-ui`、`apps/devkit`。

### V2：节点式工作流引擎

把 V1 的编程式 API 转化为 Node + Handler + Flow 的声明式模型。用 JSON 定义工作流，数据通过连线在节点间流动。大幅降低使用门槛，但矫枉过正——把基础设施全砍了，LLM 调用失败没有重试、没有缓存、没有可观测性。

### V3：节点式引擎 + 透明基础设施

保持 V2 的节点式模型，把 V1 中真正必要的基础设施融入引擎内部。重试、缓存、JSON 修复对用户透明自动生效，可观测性通过钩子系统实现。补上了 NodeContext、结构化错误处理、配置分层。

### V4：模块化 + 术语统一 + Web UI 契约

在 V3 基础上做了三件事：
1. 模块化与命名统一（Handler → Handle，可观测性 → Telemetry）
2. JSON-first 与 Web UI 友好性（schemaVersion、NodeManifest）
3. 子 Flow Node 化（顶层 inputs/outputs 契约）

### V5：当前版本

收敛为 contract-first、agent-friendly 的 AI 原生运行时。核心变化：
- 新增 Session 层（交互节奏状态机）
- 新增 WriteState（替代 V4 的 ModifyState 批量写入场景，原 ApplyState 已改名）
- 新增 PromptBuild fragments 系统（base/field/when/randomSlot/budget）
- Engine 从纯 HTTP 服务扩展为完整 CLI 工具链（debug/lint/smoke/eval/init/schema/config）
- Editor 从独立产品重新定位为 Studio Phase 0 基础
- 删除了 simulator/recorder/replayer/inspector/ab-test/devkit 等未落地的包规划

一句话概括：V1 什么都有但太重，V2 够轻但太薄，V3 找到平衡，V4 为模块化和 Web UI 做准备，V5 收敛到最小闭环并补齐 agent 友好的验证工具链。
