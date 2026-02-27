# Claude Code CLI 逆向工程分析报告 - 第8部分：特殊功能

## 8. 特殊功能详解

### 8.1 Auto Memory（自动记忆系统）

#### 工作原理

Auto Memory 是一个持久化记忆系统，允许 Claude 在会话之间保留信息。

#### 记忆目录结构

```
~/.claude/projects/<project-hash>/memory/
├── MEMORY.md              # 主记忆文件（前200行自动加载）
├── architecture.md        # 架构相关记忆
├── debugging.md           # 调试经验
├── patterns.md            # 代码模式
└── preferences.md         # 用户偏好
```

#### 记忆管理策略

**应该保存的内容**:
- 稳定的模式和约定（经过多次交互确认）
- 关键架构决策、重要文件路径、项目结构
- 用户对工作流、工具和沟通风格的偏好
- 重复问题的解决方案和调试见解

**不应该保存的内容**:
- 会话特定的上下文（当前任务细节、进行中的工作、临时状态）
- 可能不完整的信息
- 与现有 CLAUDE.md 指令重复或矛盾的内容
- 未经验证的推测性结论

#### 记忆操作

```javascript
// 写入记忆
await writeMemory('MEMORY.md', content);

// 读取记忆
const memory = await readMemory('MEMORY.md');

// 更新记忆
await updateMemory('patterns.md', newPattern);

// 删除过时记忆
await deleteMemory('outdated-info.md');
```

#### 显式用户请求

当用户明确要求记住某事时（如"总是使用 bun"、"永远不要自动提交"），立即保存 - 无需等待多次交互。

### 8.2 Plan Mode（计划模式）

#### 什么是 Plan Mode

Plan Mode 是一个特殊模式，允许 Claude 在实际编写代码之前探索代码库并设计实现方案。

#### 何时使用 Plan Mode

**应该使用**:
- 新功能实现（有多种实现方式）
- 多文件变更（影响 2-3 个以上文件）
- 架构决策（需要在模式或技术之间选择）
- 代码修改（影响现有行为或结构）
- 需求不明确（需要先探索再理解完整范围）

**不应该使用**:
- 单行或少量行修复
- 添加单个函数（需求明确）
- 用户给出非常具体详细的指令
- 纯研究/探索任务（使用 Task 工具的 explore agent）

#### Plan Mode 工作流程

```
1. EnterPlanMode
   ↓
2. 探索代码库（Glob, Grep, Read）
   ↓
3. 理解现有模式和架构
   ↓
4. 设计实现方案
   ↓
5. 写入计划文件（~/.claude/plans/<plan-id>.md）
   ↓
6. 使用 AskUserQuestion 澄清方法（如需要）
   ↓
7. ExitPlanMode（请求用户批准）
   ↓
8. 用户批准后，执行计划
```

#### 计划文件格式

```markdown
# Implementation Plan: Add User Authentication

## Overview
Add JWT-based authentication to the API.

## Approach
1. Install dependencies (jsonwebtoken, bcrypt)
2. Create auth middleware
3. Add login/register endpoints
4. Protect existing routes
5. Add tests

## Files to Modify
- src/middleware/auth.ts (new)
- src/routes/auth.ts (new)
- src/routes/api.ts (modify)
- src/types/user.ts (modify)
- tests/auth.test.ts (new)

## Implementation Steps

### Step 1: Install Dependencies
```bash
npm install jsonwebtoken bcrypt
npm install -D @types/jsonwebtoken @types/bcrypt
```

### Step 2: Create Auth Middleware
Create `src/middleware/auth.ts` with JWT verification logic.

### Step 3: Add Auth Routes
Create `src/routes/auth.ts` with login and register endpoints.

### Step 4: Protect Routes
Modify `src/routes/api.ts` to use auth middleware.

### Step 5: Add Tests
Create comprehensive tests in `tests/auth.test.ts`.

## Considerations
- Use bcrypt for password hashing (10 rounds)
- JWT expiry: 24 hours
- Store JWT secret in environment variable
- Add rate limiting to auth endpoints

## Risks
- Breaking existing API clients (need migration guide)
- Performance impact of JWT verification
```

### 8.3 Worktree（Git Worktree 隔离）

#### 什么是 Worktree

Worktree 功能允许在隔离的 Git worktree 中工作，避免影响主工作目录。

#### 何时使用

- 用户明确说"worktree"
- 实验性重构
- 并行开发多个特性
- 需要隔离的变更

#### 工作流程

```
1. EnterWorktree
   ↓
2. 创建 .claude/worktrees/<name>
   ↓
3. 创建新分支
   ↓
4. 切换工作目录到 worktree
   ↓
5. 执行任务
   ↓
6. 会话结束时提示用户
   ↓
7. 保留或删除 worktree
```

#### 使用示例

```javascript
// 进入 worktree
{
  name: "EnterWorktree",
  input: {
    name: "experimental-refactor"
  }
}

// 在 worktree 中工作
// ... 执行各种操作 ...

// 退出时用户选择
// - Keep: 保留 worktree 和分支
// - Remove: 删除 worktree 和分支
```

#### Worktree Hooks

```json
{
  "hooks": {
    "WorktreeCreate": "~/.claude/hooks/worktree-create.sh",
    "WorktreeRemove": "~/.claude/hooks/worktree-remove.sh"
  }
}
```

### 8.4 Skills（技能系统）

#### 什么是 Skills

Skills 是可扩展的插件系统，为 Claude 添加专门的知识和工作流。

#### 内置 Skills

1. **keybindings-help** - 键盘快捷键自定义
2. **claude-developer-platform** - Claude API 开发
3. **add-character** - 添加游戏角色（项目特定）
4. **frontend-design** - 前端界面设计
5. **skill-creator** - 创建新技能的指南
6. **theme-factory** - 主题样式工具
7. **webapp-testing** - Web 应用测试（Playwright）

#### 调用 Skills

```javascript
// 使用斜杠命令
/commit -m "Fix bug"

// 使用 Skill 工具
{
  name: "Skill",
  input: {
    skill: "commit",
    args: "-m 'Fix bug'"
  }
}
```

#### 创建自定义 Skill

```javascript
// ~/.claude/skills/my-skill/skill.json
{
  "name": "my-skill",
  "version": "1.0.0",
  "description": "My custom skill",
  "trigger": "/my-skill",
  "prompt": "You are a specialized assistant for...",
  "tools": ["Bash", "Read", "Write"],
  "config": {
    "option1": "default-value"
  }
}
```

### 8.5 MCP Servers（Model Context Protocol）

#### 什么是 MCP

MCP 是一个协议，允许 Claude 与外部工具和服务集成。

#### MCP 服务器类型

- **stdio**: 通过标准输入输出通信
- **sse**: 通过 Server-Sent Events 通信

#### 常用 MCP 服务器

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/allowed/path"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "ghp_..."
      }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "DATABASE_URL": "postgresql://..."
      }
    },
    "puppeteer": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-puppeteer"]
    },
    "brave-search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "..."
      }
    }
  }
}
```

#### MCP 工具使用

```javascript
// MCP 工具会自动添加到可用工具列表
// Claude 可以像使用内置工具一样使用它们

// 例如：使用 GitHub MCP 服务器
{
  name: "github_create_issue",
  input: {
    repo: "owner/repo",
    title: "Bug report",
    body: "Description..."
  }
}
```

### 8.6 Chrome Bridge（浏览器集成）

#### 功能

- 与 Chrome 浏览器交互
- 执行 JavaScript 代码
- 获取页面内容
- 截图
- 自动化测试

#### 工作原理

```
Claude Code CLI
      ↓ WebSocket
Chrome Bridge Server
      ↓ Chrome DevTools Protocol
Chrome Browser
```

#### 使用场景

- Web 应用测试
- 页面内容提取
- 自动化操作
- 调试前端问题

#### 配置

```javascript
// 环境变量
CLAUDE_CODE_CHROME_BRIDGE_URL=ws://localhost:9222
```

### 8.7 Remote Mode（远程协作）

#### 功能

- 远程会话共享
- 多人协作
- 会话同步

#### 工作原理

```
User A (Local)
      ↓
Remote Server
      ↓
User B (Remote)
```

#### 使用场景

- 结对编程
- 代码审查
- 远程协助
- 教学演示

#### 配置

```bash
# 启动远程模式
claude --remote

# 连接到远程会话
claude --connect <session-id>
```

### 8.8 Fast Mode（快速输出模式）

#### 功能

Fast Mode 使用相同的 Claude Opus 4.6 模型，但输出速度更快。

#### 特点

- **不切换模型**: 仍然使用 Opus 4.6
- **更快输出**: 优化输出速度
- **相同质量**: 保持相同的响应质量

#### 切换

```bash
# 切换到 Fast Mode
/fast

# 再次切换回正常模式
/fast
```

#### 实现原理

```javascript
// 可能的实现方式
{
  model: "claude-opus-4-6",
  stream: true,
  // 优化参数
  temperature: 0.7,  // 稍微降低随机性
  top_p: 0.9,        // 优化采样
  // 其他优化...
}
```

### 8.9 Task Management（任务管理）

#### 功能

- 创建任务列表
- 跟踪进度
- 任务依赖
- 状态管理

#### 任务状态

- `pending` - 待处理
- `in_progress` - 进行中
- `completed` - 已完成
- `deleted` - 已删除

#### 任务依赖

```javascript
// 任务 2 依赖任务 1
{
  name: "TaskUpdate",
  input: {
    taskId: "2",
    addBlockedBy: ["1"]
  }
}

// 任务 1 阻塞任务 2
{
  name: "TaskUpdate",
  input: {
    taskId: "1",
    addBlocks: ["2"]
  }
}
```

#### 任务工作流

```
1. TaskCreate - 创建任务
   ↓
2. TaskUpdate(status: in_progress) - 开始工作
   ↓
3. 执行任务
   ↓
4. TaskUpdate(status: completed) - 完成任务
   ↓
5. TaskList - 查看下一个任务
```

### 8.10 Jupyter Notebook 支持

#### 功能

- 读取 Notebook
- 编辑单元格
- 插入/删除单元格
- 查看输出

#### 编辑模式

- `replace` - 替换单元格内容
- `insert` - 插入新单元格
- `delete` - 删除单元格

#### 使用示例

```javascript
// 读取 Notebook
{
  name: "Read",
  input: {
    file_path: "/path/to/notebook.ipynb"
  }
}

// 编辑单元格
{
  name: "NotebookEdit",
  input: {
    notebook_path: "/path/to/notebook.ipynb",
    cell_id: "abc123",
    new_source: "import pandas as pd\ndf = pd.read_csv('data.csv')",
    cell_type: "code",
    edit_mode: "replace"
  }
}

// 插入新单元格
{
  name: "NotebookEdit",
  input: {
    notebook_path: "/path/to/notebook.ipynb",
    cell_id: "abc123",  // 在此单元格后插入
    new_source: "# New analysis",
    cell_type: "markdown",
    edit_mode: "insert"
  }
}
```

### 8.11 Git 自动化

#### 自动 Commit

```javascript
// 工作流程
1. git status - 查看未跟踪文件
2. git diff - 查看变更
3. git log - 查看提交历史
4. 分析变更，生成 commit 消息
5. git add <files> - 暂存文件
6. git commit -m "message" - 创建提交
7. git status - 验证成功
```

#### Commit 消息格式

```
<type>: <subject>

<body>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

#### 自动 PR 创建

```javascript
// 工作流程
1. git status - 检查状态
2. git diff - 查看变更
3. git log main..HEAD - 查看所有提交
4. git diff main...HEAD - 查看完整差异
5. 分析所有提交，生成 PR 描述
6. git push -u origin <branch> - 推送分支
7. gh pr create - 创建 PR
```

#### PR 描述格式

```markdown
## Summary
- Bullet point 1
- Bullet point 2
- Bullet point 3

## Test plan
- [ ] Test case 1
- [ ] Test case 2
- [ ] Test case 3

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

### 8.12 Context Compression（上下文压缩）

#### 触发条件

- Token 使用率超过 80%
- 接近上下文限制

#### 压缩策略

```javascript
function compressContext(messages) {
  // 1. 保留系统提示
  const systemMessages = messages.filter(m => m.role === 'system');

  // 2. 保留最近 10 条消息
  const recentMessages = messages.slice(-10);

  // 3. 压缩旧消息
  const oldMessages = messages.slice(0, -10);
  const summary = summarizeMessages(oldMessages);

  // 4. 重建消息列表
  return [
    ...systemMessages,
    {
      role: 'user',
      content: `[Previous conversation summary]\n${summary}`
    },
    ...recentMessages
  ];
}
```

#### 压缩内容

- 旧的对话历史
- 重复的信息
- 不重要的细节

#### 保留内容

- 系统提示
- 最近的消息
- 关键上下文
- 工具定义

### 8.13 Cost Tracking（成本追踪）

#### 追踪指标

```javascript
{
  totalTokens: 125000,
  inputTokens: 100000,
  outputTokens: 25000,
  cacheCreationTokens: 50000,
  cacheReadTokens: 30000,
  estimatedCost: 2.50,  // USD
  cacheSavings: 1.35    // USD
}
```

#### 成本计算

```javascript
function calculateCost(usage, model) {
  const pricing = MODEL_PRICING[model];

  const inputCost = usage.inputTokens * pricing.input;
  const outputCost = usage.outputTokens * pricing.output;
  const cacheCost = usage.cacheCreationTokens * pricing.cacheWrite;
  const cacheReadCost = usage.cacheReadTokens * pricing.input * 0.1;

  return inputCost + outputCost + cacheCost + cacheReadCost;
}
```

#### 成本优化建议

- 使用 Prompt Caching
- 选择合适的模型（Haiku vs Sonnet vs Opus）
- 压缩上下文
- 减少不必要的工具调用

### 8.14 Performance Monitoring（性能监控）

#### 监控指标

```javascript
{
  apiLatency: 1250,        // ms
  toolExecutionTime: 340,  // ms
  totalDuration: 1590,     // ms
  tokensPerSecond: 45,
  cacheHitRate: 0.75       // 75%
}
```

#### 性能优化

- 并行工具调用
- 缓存优化
- 模型选择
- 减少 API 往返

#### 慢操作阈值

```javascript
// 环境变量
CLAUDE_CODE_SLOW_OPERATION_THRESHOLD_MS=5000

// 超过阈值时记录警告
if (duration > SLOW_OPERATION_THRESHOLD) {
  logger.warn(`Slow operation: ${operation} took ${duration}ms`);
}
```
