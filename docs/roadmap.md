# Roadmap

KAL 的核心定位：AI 交互叙事游戏的运行时 + 编辑器。价值锚点在编排和约束层（Session 状态机、State 管理、Flow DAG），不在 LLM 调用层。

原则：
- 每个阶段结束时，外部开发者应该能用 KAL 做出一个完整的游戏
- 不做投机功能 — 只做当前阶段需要的东西
- Showcase 游戏和文档与代码同等重要

---

## Phase 0: 地基（当前 → 2026 Q2 中）

目标：让项目从"能跑"变成"能用"。一个外部开发者 clone 下来，30 分钟内能跑通自己的第一个游戏。

### 修复和清理

- [ ] 修复 `json-repair.test.ts` 失败的测试（`repairJson('not json at all')` 应抛错）
- [ ] 清理 git status 中的已删除文件，提交干净的状态
- [x] README 中的文档链接指向 `docs/docs_v5/`，修正为 `docs/`
- [x] README 中 "当前版本 v0.5.x" 与 package.json 的 v0.1.0 不一致，统一版本号
- [x] 移除 README 中未经验证的性能指标（"100+ 并发会话"等），替换为诚实的项目状态描述
- [x] README 改为英文默认，中文版独立为 README.zh-CN.md

### 上手体验

- [ ] `kal play` 和 `kal lint` 在没有配置 API key 时给出清晰的错误提示，而不是崩溃
- [ ] getting-started.md 中的命令从 `node apps/engine/dist/bin.js` 改为 `kal`（假设已 link）
- [ ] 写一个 3 分钟的 minimal example：从 `mkdir` 到 `kal play` 跑通，不超过 20 行 JSON
- [ ] `kal init` 命令：交互式创建项目骨架（kal_config.json + initial_state.json + session.json + 一个 flow）

### 测试

- [ ] 补齐 `apps/engine` 的核心测试：CLI 参数解析、runtime 创建、server 启动/关闭
- [ ] 给 `kal lint` 和 `kal smoke` 加集成测试，用 dnd-adventure 和 guess-who 作为 fixture
- [ ] CI 配置：GitHub Actions 跑 `pnpm test` + `pnpm typecheck`

### 文档

- [ ] 检查 `docs/reference/` 下 5 个自动生成文档的准确性，确保与代码一致
- [ ] 给 guess-who 示例写一个 README，说明它展示了什么模式
- [x] 在 docs/README.md 中加入 roadmap 链接

---

## Phase 1: Showcase 游戏（2026 Q2）

目标：用 KAL 做一个让人想玩的游戏，而不是技术 demo。这是最重要的阶段 — 没有 showcase，后面的一切都没有意义。

### Showcase 游戏开发

- [ ] 选定游戏类型和设计方向（候选：AI 狼人杀、AI 侦探推理、AI 角色养成、AI TTRPG 单人冒险）
- [ ] 完成游戏设计文档（soul.md + rules.md + content.md）
- [ ] 实现完整游戏，可玩时长 15-30 分钟
- [ ] 内部 playtest 至少 10 轮，修复体验问题
- [ ] 游戏本身作为 `examples/` 下的完整示例，附带详细 README

### 在 Showcase 过程中暴露的引擎问题

（这些 TODO 会在做游戏的过程中自然产生，现在无法预知具体内容，但方向是确定的）

- [ ] 记录做游戏过程中遇到的所有 friction point
- [ ] 修复阻塞游戏开发的 bug
- [ ] 补充 showcase 游戏需要但 KAL 缺少的节点或能力

### 示例优化

- [ ] 简化 dnd-adventure：减少冗余 flow，合并重复的状态处理逻辑
- [ ] 确保 dnd-adventure 和 guess-who 都能用 `kal lint` 零警告通过

---

## Phase 2: 外部开发者可用（2026 Q3）

目标：第一批非作者的开发者能独立用 KAL 做游戏，不需要看源码。

### 文档补全

- [ ] 写 "Design Patterns" 文档：常见游戏模式的 KAL 实现方式（回合制循环、分支叙事、角色创建、物品系统、对话历史管理）
- [ ] 写 "Troubleshooting" 文档：常见错误和解决方法
- [ ] 写 "Custom Nodes Guide"：从零创建自定义节点的完整教程
- [ ] 每个内置节点在 reference/nodes.md 中有至少一个可运行的使用示例

### 编辑器打磨

- [ ] Editor 能加载任意 KAL 项目（不只是 dnd-adventure）
- [ ] Editor 中的节点配置修改能保存回 flow JSON 文件
- [ ] Editor 显示 flow 执行状态（哪个节点在跑、输入输出值）
- [ ] `kal studio` 一键启动 engine + editor 的体验打磨

### State 层加强（护城河）

- [ ] State 变更日志：每次 ApplyState 记录 before/after diff
- [ ] State 约束声明：在 initial_state.json 中支持 `min`/`max`/`enum` 约束，不只是 type
- [ ] `kal debug --state` 输出可读的状态快照，支持 diff 两个快照

### LLM 层瘦身（降低被替代风险）

- [ ] GenerateText 节点支持 structured output（JSON schema 约束），减少对 json-repair 的依赖
- [ ] 支持 Ollama 本地模型作为 provider，降低开发者的 API 成本门槛
- [ ] LLM provider 配置支持 per-node 覆盖（关键叙事用大模型，简单判断用小模型）

---

## Phase 3: 生态萌芽（2026 Q4）

目标：有 10 个以上非作者创建的 KAL 游戏项目存在。

### 降低门槛

- [ ] `npx create-kal-game` 脚手架：选模板 → 配置 provider → 生成项目 → 直接 play
- [ ] 在线 Playground（可选）：浏览器里编辑 flow JSON + 预览执行结果，不需要本地安装
- [ ] `kal generate` 命令：从自然语言描述生成 flow JSON 骨架（用 LLM 生成 KAL flow，而不是被 LLM 替代）

### 社区基础

- [ ] npm 发布 `@kal-ai/core` 和 `@kal-ai/engine`
- [ ] CONTRIBUTING.md：如何贡献代码、如何提 issue、代码规范
- [ ] 第一次 KAL Game Jam（哪怕只有 3 个参赛作品）
- [ ] Discord 或 GitHub Discussions 开通

### 编辑器增强

- [ ] 拖拽创建节点和连线（目前只能查看）
- [ ] Session 编辑器：可视化编辑步骤和分支
- [ ] 导入/导出 flow JSON

---

## 不做的事情（至少 2027 年之前）

以下功能在当前阶段是过度设计，明确不做：

- **多人游戏支持** — 先把单人体验做到极致
- **实时交互** — KAL 是回合制引擎，不是实时引擎
- **向量数据库 / 分层记忆系统** — 等模型上下文窗口再大一些，这个问题可能自己消失
- **插件市场** — 没有用户就没有插件生态
- **分布式部署** — 没有流量就不需要分布式
- **TUI 2.0（基于 Ink）** — 当前 TUI 够用，不是瓶颈
- **性能优化（节点并行化、状态序列化优化）** — 没有性能问题就不需要优化
- **实体化世界模型（NPC、地点、物品系统）** — 等 showcase 游戏暴露出真实需求再设计
- **事件调度系统（时间轴、事件队列）** — 同上

这些不是不重要，而是现在做它们是浪费时间。等有了真实用户和真实游戏，再根据实际需求决定优先级。
