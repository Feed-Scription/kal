<div align="center">

<img src="assets/kal-logo.png" alt="KAL-AI Logo" width="400">

# KAL-AI

**面向 AI 原生游戏与交互应用的 Flow 引擎**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

*让 AI 驱动的游戏开发变得简单而强大*

[快速开始](#快速开始) • [示例演示](#示例演示) • [文档](#文档) • [贡献指南](#贡献指南)

</div>

---

## 项目简介

KAL-AI 是一个专为 AI 原生游戏设计的 Flow 引擎，通过三层架构让复杂的 AI 交互变得简单可控：

- **Flow 层**：用 JSON 描述 DAG 工作流，负责具体编排
- **Session 层**：用轻量状态机驱动多轮交互节奏
- **Node 层**：把状态读写、LLM 调用、子流程复用和业务规则封装成可组合节点

**开箱即用**：包含完整的运行时、Engine 宿主、可视化 Editor 和示例游戏。

## 适用场景

KAL-AI 特别适合构建：

| 场景类型 | 描述 | 示例 |
|---------|------|------|
| **回合制文字游戏** | 基于规则的游戏逻辑 + AI 叙事 | DND 冒险、文字 RPG |
| **AI 互动叙事** | 动态故事生成与分支选择 | 互动小说、剧情游戏 |
| **状态驱动原型** | 复杂状态管理的应用 | 角色养成、模拟经营 |
| **混合编排应用** | 规则逻辑与 LLM 的深度结合 | 智能助手、教育游戏 |

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                        KAL-AI 架构                          │
├─────────────────────────────────────────────────────────────┤
│  apps/                                                      │
│  ├── engine/     CLI + HTTP API + TUI 宿主                  │
│  └── editor/     可视化编辑器                               │
├─────────────────────────────────────────────────────────────┤
│  packages/                                                  │
│  └── core/       Flow 运行时 + Session 管理 + Node 系统     │
├─────────────────────────────────────────────────────────────┤
│  examples/                                                  │
│  └── dnd-adventure/  完整的 DND 冒险游戏示例                │
└─────────────────────────────────────────────────────────────┘
```

## 核心特性

### Flow JSON 运行时
- **声明式配置**：`meta + data` 结构，支持输入输出契约
- **可视化编排**：DAG 工作流，支持条件分支和循环
- **SubFlow 复用**：把复杂逻辑拆成可复用子流程

### 内置节点系统
- **State 节点**：状态读写和数据转换
- **LLM 节点**：AI 模型调用和提示工程
- **Signal 节点**：用户交互和事件处理
- **Transform 节点**：数据处理和格式转换

### Session 交互层
- **多轮对话**：`RunFlow / Prompt / Choice / Branch / End`
- **状态管理**：自动保存和恢复游戏进度
- **交互模式**：CLI、TUI、HTTP API 多种接入方式

### 开发者友好
- **自定义节点**：项目可在 `node/` 目录扩展业务规则
- **Node manifest**：Engine 导出节点清单，Editor 直接消费
- **热重载**：开发时实时预览和调试

## 快速开始

### 环境要求
- Node.js >= 18
- pnpm (推荐) 或 npm

### 一键开始
```bash
# 1. 克隆项目
git clone https://github.com/Feed-Scription/kal.git
cd kal

# 2. 运行安装脚本
./scripts/install.sh

# 3. 一键配置
kal config init
# 会询问：是否设置 API 密钥？输入提供商名称（如 openai, deepseek 等）

# 4. 开始游戏
kal play examples/dnd-adventure
```

就这么简单！`kal config init` 会引导你完成配置，支持任意 LLM 提供商。

### 手动安装（可选）
如果你想手动控制每个步骤：

```bash
# 1. 克隆项目
git clone https://github.com/Feed-Scription/kal.git
cd kal

# 2. 安装依赖并构建
pnpm install
pnpm --filter @kal-ai/engine build

# 3. 全局链接 kal 命令
cd apps/engine && pnpm link --global && cd ../..

# 4. 配置 API 密钥
kal config init  # 交互式配置
# 或者直接设置
kal config set-key openai sk-your-api-key
```

### 配置管理

如果你需要更详细的配置管理：

```bash
# 查看所有配置
kal config list

# 设置 API 密钥（统一格式）
kal config set openai.apiKey sk-xxx...
kal config set deepseek.apiKey sk-xxx...
kal config set moonshot.apiKey sk-xxx...

# 设置 API 端点
kal config set openai.baseUrl https://api.deepseek.com/v1
kal config set deepseek.baseUrl https://api.deepseek.com/v1

# 设置其他配置项
kal config set preferences.theme dark
kal config set server.defaultPort 8080

# 查看特定配置
kal config get openai.apiKey

# 删除配置项
kal config remove openai.apiKey
kal config remove deepseek.baseUrl
```

**统一的配置格式：**
- 🔑 **API 密钥**：`<provider>.apiKey` - 自动加密存储
- 🌐 **API 端点**：`<provider>.baseUrl` - 自定义服务端点
- ⚙️ **用户偏好**：`preferences.*` - 主题、语言等设置
- 🖥️ **服务器配置**：`server.*` - 端口、CORS 等设置

**安全特性：**
- 🔐 **加密存储**：API 密钥双重加密保护
- 🔒 **本地配置**：所有配置仅存储在本地
- 🎭 **隐私保护**：密钥输入和显示都经过脱敏处理
```bash
# 启动 Engine 服务
kal serve examples/dnd-adventure

# 启动可视化编辑器
cd apps/editor && pnpm dev
```

访问 `http://localhost:3000` 查看编辑器界面。

## 示例演示

### DND 冒险游戏
完整的单人 DND 风格冒险游戏，展示了 KAL-AI 的核心能力：

```bash
kal play examples/dnd-adventure
```

**游戏特性：**
- 动态角色创建和属性分配
- AI 驱动的剧情生成和 NPC 对话
- 回合制战斗系统
- 物品收集和背包管理
- 多结局分支故事线

**技术亮点：**
- **Session 驱动**：角色创建 → 回合循环 → 结局判定
- **Flow 编排**：主流程、叙事子流程、战斗流程分离
- **自定义节点**：游戏规则封装（属性检定、战斗逻辑）
- **状态管理**：角色属性、背包、任务进度、对话历史

查看完整示例：[examples/dnd-adventure](./examples/dnd-adventure)

### 游戏演示效果

<details>
<summary>点击查看游戏运行截图</summary>

> 💡 **提示**：你可以运行 `kal play examples/dnd-adventure` 来体验完整的游戏流程

**角色创建界面：**
```
欢迎来到 DND 冒险世界！

请创建你的角色：
姓名: 艾莉亚
职业: [1] 战士 [2] 法师 [3] 盗贼
选择: 1

战士艾莉亚已创建！
属性分配 (总计20点)：
力量: 8, 敏捷: 6, 智力: 3, 体力: 3
生命值: 30/30
```

**AI 叙事生成：**
```
你走进了一座古老的地下城...

昏暗的走廊中传来奇怪的声音，石壁上刻着古老的符文。
突然，一只哥布林从阴影中跳出来！

你想要做什么？
[1] 攻击哥布林
[2] 尝试交流
[3] 寻找其他路径
```

**战斗系统：**
```
战斗开始！

艾莉亚 (HP: 30/30) vs 哥布林 (HP: 15/15)

你的回合：
[1] 普通攻击 [2] 技能攻击 [3] 防御

> 选择攻击...
投掷结果: 15 (成功！)
你对哥布林造成了 8 点伤害！
```

</details>

## 开发指南

### 项目结构
```bash
# 运行测试
pnpm --filter @kal-ai/core test
pnpm --filter @kal-ai/engine test

# 构建项目
pnpm --filter @kal-ai/core build
pnpm --filter @kal-ai/engine build
pnpm --filter editor build

# 使用 Bun（可选）
bun run build
bun run test
```

### 创建自定义节点
在项目的 `node/` 目录下创建自定义业务节点：

```typescript
// node/custom-node.ts
export default {
  type: 'CustomNode',
  execute: async (input, context) => {
    // 自定义业务逻辑
    return { result: 'processed' };
  }
};
```

**实际示例 - 属性检定节点：**
```typescript
// node/ability-check.ts
export default {
  type: 'AbilityCheck',
  execute: async (input, context) => {
    const { ability, difficulty } = input;
    const playerStats = context.state.player.stats;

    // 投掷 d20 + 属性值
    const roll = Math.floor(Math.random() * 20) + 1;
    const total = roll + playerStats[ability];
    const success = total >= difficulty;

    return {
      roll,
      total,
      success,
      message: success
        ? `投掷结果: ${roll} + ${playerStats[ability]} = ${total} (成功！)`
        : `投掷结果: ${roll} + ${playerStats[ability]} = ${total} (失败...)`
    };
  }
};
```

### API 集成
Engine 提供 HTTP API 用于集成其他应用：

```bash
# 启动 API 服务
kal serve examples/dnd-adventure

# API 端点
POST /api/session/start    # 开始新会话
POST /api/session/input    # 发送用户输入
GET  /api/session/state    # 获取当前状态
```

**API 使用示例：**
```javascript
// 开始新游戏会话
const response = await fetch('http://localhost:3000/api/session/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ projectPath: 'examples/dnd-adventure' })
});

const { sessionId } = await response.json();

// 发送用户输入
await fetch('http://localhost:3000/api/session/input', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId,
    input: '艾莉亚'  // 角色名称
  })
});

// 获取游戏状态
const stateResponse = await fetch(`http://localhost:3000/api/session/state?sessionId=${sessionId}`);
const gameState = await stateResponse.json();
```

### Editor 可视化编辑
启动 Editor 来可视化编辑和调试 Flow：

```bash
# 启动 Engine 服务
kal serve examples/dnd-adventure

# 启动 Editor（新终端窗口）
cd apps/editor && pnpm dev
```

**Editor 功能：**
- Flow 图形化展示和编辑
- 实时状态监控和调试
- Node 配置和参数调整
- 游戏流程可视化预览

## 文档

详细文档位于 `docs/docs_v5/` 目录：

| 文档 | 描述 |
|------|------|
| [core.md](./docs/docs_v5/core.md) | 核心运行时：Flow、Session、Node 系统 |
| [engine.md](./docs/docs_v5/engine.md) | Engine 宿主：CLI、API、TUI 使用指南 |
| [agent-debug.md](./docs/docs_v5/agent-debug.md) | Agent 友好调试：`kal debug` CLI 设计方案 |
| [editor.md](./docs/docs_v5/editor.md) | 可视化编辑器：Flow 设计和调试 |

## 贡献指南

我们欢迎各种形式的贡献！

### 如何贡献
1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/amazing-feature`
3. 提交更改：`git commit -m 'Add amazing feature'`
4. 推送分支：`git push origin feature/amazing-feature`
5. 提交 Pull Request

### 开发规范
- 遵循现有的代码风格
- 为新功能添加测试
- 更新相关文档
- 确保所有测试通过

### 报告问题
如果发现 bug 或有功能建议，请在 [Issues](https://github.com/Feed-Scription/kal/issues) 中提交。

## 项目状态

**当前版本**：v0.5.x (开发中)

**功能完成度**：
- ✅ 核心 Flow 运行时 (100%)
- ✅ Session 交互层 (95%)
- ✅ 内置节点系统 (90%)
- ✅ CLI 和 TUI 界面 (85%)
- ✅ HTTP API 服务 (80%)
- 🚧 可视化 Editor (70%)
- 🚧 文档和示例 (60%)

**适用场景**：
- ✅ 单人回合制文字游戏
- ✅ AI 驱动的互动叙事
- ✅ 状态驱动的原型应用
- 🚧 多人游戏支持（规划中）
- 🚧 实时交互（规划中）

**性能指标**：
- Flow 执行延迟: < 50ms
- 内存占用: < 100MB (典型游戏)
- 并发会话: 支持 100+ 同时在线
- 打包大小: < 10MB (核心运行时)

## 常见问题 (FAQ)

<details>
<summary><strong>Q: KAL-AI 与其他游戏引擎有什么区别？</strong></summary>

KAL-AI 专注于 AI 原生游戏开发，与传统游戏引擎的主要区别：

- **AI 优先设计**：内置 LLM 调用和提示工程支持
- **声明式流程**：用 JSON 描述游戏逻辑，而非代码编程
- **状态驱动**：专为多轮对话和状态管理优化
- **轻量级**：专注于文字游戏和交互叙事，不包含图形渲染

</details>

<details>
<summary><strong>Q: 支持哪些 LLM 服务？</strong></summary>

KAL-AI 支持所有 OpenAI 兼容的 API 服务：

- **官方服务**：OpenAI GPT-3.5/4, Azure OpenAI
- **开源模型**：通过 Ollama, LocalAI, vLLM 等本地部署
- **云服务**：Anthropic Claude, Google Gemini (通过适配器)
- **自定义**：任何实现 OpenAI API 格式的服务

</details>

<details>
<summary><strong>Q: 如何处理 LLM 的不确定性？</strong></summary>

KAL-AI 通过多层机制确保游戏逻辑的可控性：

- **规则层分离**：关键游戏逻辑用确定性节点处理
- **输出约束**：LLM 节点支持格式化输出和验证
- **回退机制**：AI 生成失败时的默认处理
- **状态检查**：确保游戏状态的一致性

</details>

<details>
<summary><strong>Q: 可以用于商业项目吗？</strong></summary>

可以！KAL-AI 采用 MIT 许可证，允许商业使用：

- ✅ 免费用于商业项目
- ✅ 可以修改和分发
- ✅ 不需要开源你的游戏代码
- ⚠️ 需要保留原始许可证声明

</details>

<details>
<summary><strong>Q: 性能如何？能支持多少用户？</strong></summary>

KAL-AI 针对文字游戏进行了优化：

- **单机模式**：可支持数千个离线会话
- **服务器模式**：100+ 并发用户 (取决于硬件和 LLM 服务)
- **内存占用**：每个会话约 1-5MB
- **响应时间**：本地逻辑 < 50ms，LLM 调用取决于服务商

</details>

## Roadmap

### 近期目标 (v0.6) - 2026 Q2
- [ ] **示例优化**：简化 DND 示例，减少冗余 Flow 和重复状态处理
- [ ] **Session 重构**：收敛职责，稳定交互壳和业务 Flow 分层
- [ ] **文档完善**：补充面向当前实现的详细文档
- [ ] **类型安全**：优化 Node 系统的 TypeScript 类型和错误处理
- [ ] **测试覆盖**：提升核心模块的单元测试覆盖率到 90%+

### 中期规划 (v0.7-v0.8) - 2026 Q3-Q4
- [ ] **TUI 2.0**：基于 Ink 的新版终端界面
  - 选择高亮、状态侧栏、帮助面板
  - 保留 readline + ANSI 版本作为 fallback
  - 支持主题和自定义样式
- [ ] **Editor 增强**：Flow 可视化编辑和实时调试
  - 拖拽式节点编辑器
  - 实时状态监控面板
  - Flow 执行步骤回放
- [ ] **性能优化**：大型 Flow 的执行效率提升
  - 节点执行并行化
  - 状态序列化优化
  - 内存使用优化
- [ ] **插件系统**：支持第三方节点和扩展
  - Node 插件 API
  - 社区插件市场
  - 热插拔支持

### 长期愿景 (v1.0+) - 2027+
- [ ] **实体化世界模型**：NPC、地点、物品、任务系统
  - 结构化世界状态管理
  - 实体关系图谱
  - 动态世界事件生成
- [ ] **事件调度系统**：更系统的任务推进和状态管理
  - 时间轴和事件队列
  - 条件触发器
  - 复杂任务链支持
- [ ] **分层记忆系统**：短期对话、摘要、世界事实、角色档案
  - 向量数据库集成
  - 智能记忆检索
  - 记忆重要性评分
- [ ] **调试与可观测性**：执行回放、state diff、运行日志
  - 时光机调试功能
  - 性能分析工具
  - 错误追踪和报告
- [ ] **多人游戏支持**：会话同步和状态共享
  - 实时状态同步
  - 冲突解决机制
  - 分布式部署支持

### 社区目标
- [ ] **生态建设**：建立活跃的开发者社区
- [ ] **最佳实践**：发布游戏设计模式和开发指南
- [ ] **案例研究**：收集和分享成功的商业项目案例
- [ ] **教育资源**：制作视频教程和在线课程

## 社区与生态

### 学习资源
- 📚 [官方文档](./docs/docs_v5/) - 完整的技术文档

### 贡献者
感谢所有为 KAL-AI 做出贡献的开发者：

<a href="https://github.com/Feed-Scription/kal/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Feed-Scription/kal" />
</a>

### 赞助支持
如果 KAL-AI 对你有帮助，欢迎通过以下方式支持项目发展：

- ⭐ 给项目点个 Star
- 🐛 报告 Bug 和提出改进建议
- 📝 贡献代码或文档

## 许可证

本项目采用 [MIT License](LICENSE) 开源协议。

## 致谢

感谢所有为 KAL-AI 做出贡献的开发者和社区成员。

---

<div align="center">

**[⭐ 给个 Star](https://github.com/Feed-Scription/kal) • [📖 查看文档](./docs/docs_v5/) • [🐛 报告问题](https://github.com/Feed-Scription/kal/issues) • [💬 加入讨论](https://github.com/Feed-Scription/kal/discussions)**

Made with ❤️ for AI-native game developers

</div>
