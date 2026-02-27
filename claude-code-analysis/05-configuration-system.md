# Claude Code CLI 逆向工程分析报告 - 第5部分：配置系统

## 5. 配置系统详解

### 5.1 配置目录结构

```
~/.claude/
├── settings.json           # 用户设置
├── keybindings.json        # 键盘快捷键
├── memory/                 # 持久化记忆
│   ├── MEMORY.md          # 主记忆文件
│   └── *.md               # 主题记忆文件
├── plans/                  # 计划模式文件
│   └── *.md
├── rules/                  # 自定义规则
│   └── *.md
├── commands/               # 自定义命令
├── agents/                 # Agent 配置
├── plugins/                # 插件目录
├── local/                  # 本地依赖
│   └── node_modules/
├── sessions/               # 会话数据
│   └── current.json
├── debug/                  # 调试日志
├── statusline/             # 状态栏配置
└── projects/               # 项目特定配置
    └── <project-hash>/
        ├── memory/
        └── sessions/
```

### 5.2 settings.json 配置

#### 主要配置项

```json
{
  "model": "claude-sonnet-4-6",
  "permissionMode": "prompt",
  "allowedPrompts": [],
  "mcpServers": {},
  "skills": {},
  "hooks": {
    "user-prompt-submit": null,
    "WorktreeCreate": null,
    "WorktreeRemove": null
  },
  "statusline": {
    "enabled": true,
    "format": "default"
  },
  "theme": "default",
  "fastMode": false,
  "autoMemory": true,
  "contextWindow": "auto"
}
```

#### 配置加载优先级

1. 命令行参数
2. 环境变量
3. 项目级配置 (`.claude/settings.json`)
4. 用户级配置 (`~/.claude/settings.json`)
5. 默认配置

### 5.3 环境变量

#### 核心环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `CLAUDE_CONFIG_DIR` | 配置目录路径 | `~/.claude` |
| `CLAUDE_CODE_DISABLE_1M_CONTEXT` | 禁用 1M 上下文 | `false` |
| `CLAUDE_CODE_DEBUG_LOGS_DIR` | 调试日志目录 | - |
| `CLAUDE_CODE_CUSTOM_OAUTH_URL` | 自定义 OAuth URL | - |
| `CLAUDE_CODE_OAUTH_CLIENT_ID` | OAuth 客户端 ID | - |
| `CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR` | 维护工作目录 | `false` |
| `CLAUDE_CODE_SLOW_OPERATION_THRESHOLD_MS` | 慢操作阈值 | - |
| `CLAUDE_CODE_PROFILE_STARTUP` | 启动性能分析 | `false` |

#### Ripgrep 相关

| 变量名 | 说明 |
|--------|------|
| `RIPGREP_EMBEDDED` | 使用嵌入式 ripgrep |
| `RIPGREP_NODE_PATH` | 自定义 ripgrep 路径 |

#### 调试相关

| 变量名 | 说明 |
|--------|------|
| `DEBUG` | 调试模式 |
| `DEBUG_SDK` | SDK 调试 |

#### AWS/Cloud 相关

| 变量名 | 说明 |
|--------|------|
| `AWS_REGION` | AWS 区域 |
| `AWS_DEFAULT_REGION` | AWS 默认区域 |
| `CLOUD_ML_REGION` | Cloud ML 区域 |

### 5.4 权限模式配置

#### auto 模式

```json
{
  "permissionMode": "auto"
}
```

- 自动批准所有工具调用
- 适合信任的环境
- 最快的执行速度

#### prompt 模式

```json
{
  "permissionMode": "prompt"
}
```

- 每次工具调用都询问用户
- 最安全的模式
- 适合学习和调试

#### allowed-prompts 模式

```json
{
  "permissionMode": "allowed-prompts",
  "allowedPrompts": [
    {
      "tool": "Bash",
      "prompt": "run tests"
    },
    {
      "tool": "Bash",
      "prompt": "install dependencies"
    }
  ]
}
```

- 基于语义提示批准
- 平衡安全性和便利性
- 可配置允许的操作

#### custom 模式

```json
{
  "permissionMode": "custom",
  "customRules": {
    "Bash": {
      "allow": ["npm", "git", "ls"],
      "deny": ["rm -rf", "sudo"]
    },
    "Write": {
      "allowPaths": ["src/**", "tests/**"],
      "denyPaths": [".env", "*.key"]
    }
  }
}
```

- 自定义规则
- 细粒度控制
- 高级用户使用

### 5.5 MCP 服务器配置

#### 配置格式

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed"],
      "env": {}
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
    }
  }
}
```

#### MCP 服务器类型

- **stdio**: 标准输入输出通信
- **sse**: Server-Sent Events 通信

#### 常用 MCP 服务器

1. `@modelcontextprotocol/server-filesystem` - 文件系统访问
2. `@modelcontextprotocol/server-github` - GitHub 集成
3. `@modelcontextprotocol/server-postgres` - PostgreSQL 数据库
4. `@modelcontextprotocol/server-sqlite` - SQLite 数据库
5. `@modelcontextprotocol/server-puppeteer` - 浏览器自动化

### 5.6 技能配置

#### 技能定义

```json
{
  "skills": {
    "my-custom-skill": {
      "path": "~/.claude/skills/my-custom-skill",
      "enabled": true,
      "config": {
        "option1": "value1"
      }
    }
  }
}
```

#### 内置技能

- `keybindings-help` - 键盘快捷键帮助
- `claude-developer-platform` - Claude API 开发
- `frontend-design` - 前端设计
- `skill-creator` - 技能创建器
- `theme-factory` - 主题工厂
- `webapp-testing` - Web 应用测试

### 5.7 Hooks 配置

#### Hook 类型

```json
{
  "hooks": {
    "user-prompt-submit": "~/.claude/hooks/validate-prompt.sh",
    "WorktreeCreate": "~/.claude/hooks/worktree-create.sh",
    "WorktreeRemove": "~/.claude/hooks/worktree-remove.sh"
  }
}
```

#### Hook 执行时机

- `user-prompt-submit`: 用户提交提示前
- `WorktreeCreate`: 创建 worktree 时
- `WorktreeRemove`: 删除 worktree 时

#### Hook 脚本示例

```bash
#!/bin/bash
# ~/.claude/hooks/validate-prompt.sh

# 检查提示是否包含敏感信息
if echo "$1" | grep -i "password\|secret\|token"; then
  echo "ERROR: Prompt contains sensitive information"
  exit 1
fi

exit 0
```

### 5.8 记忆系统配置

#### MEMORY.md 格式

```markdown
# Claude Code Memory

## Project Structure
- Main entry: src/index.ts
- Tests: tests/
- Config: config/

## User Preferences
- Prefers TypeScript over JavaScript
- Uses 2 spaces for indentation
- Likes descriptive variable names

## Common Patterns
- Use async/await for async operations
- Prefer functional programming style
- Write unit tests for all functions

## Known Issues
- Build fails on Windows due to path separators
- Need to run `npm install` after pulling
```

#### 记忆文件组织

```
~/.claude/projects/<project-hash>/memory/
├── MEMORY.md              # 主记忆文件 (前200行自动加载)
├── architecture.md        # 架构记忆
├── debugging.md           # 调试记忆
├── patterns.md            # 模式记忆
└── preferences.md         # 偏好记忆
```

### 5.9 项目特定配置

#### CLAUDE.md

项目根目录的 `CLAUDE.md` 文件提供项目特定指令。

```markdown
# Project Instructions for Claude

## Build Commands
- Build: `npm run build`
- Test: `npm test`
- Dev: `npm run dev`

## Code Style
- Use TypeScript strict mode
- Follow ESLint rules
- Write JSDoc comments

## Testing
- Write tests for all new features
- Maintain 80% code coverage
- Use Jest for testing

## Git Workflow
- Create feature branches from `main`
- Squash commits before merging
- Write descriptive commit messages
```

### 5.10 状态栏配置

#### statusline 配置

```json
{
  "statusline": {
    "enabled": true,
    "format": "{model} | {tokens} | {cost}",
    "position": "bottom",
    "style": {
      "fg": "white",
      "bg": "blue"
    }
  }
}
```

#### 可用变量

- `{model}` - 当前模型
- `{tokens}` - Token 使用量
- `{cost}` - 估算成本
- `{time}` - 响应时间
- `{cache}` - 缓存命中率

### 5.11 键盘快捷键配置

#### keybindings.json

```json
{
  "submit": "ctrl+enter",
  "cancel": "ctrl+c",
  "clear": "ctrl+l",
  "history-prev": "up",
  "history-next": "down",
  "autocomplete": "tab",
  "multiline": "shift+enter"
}
```

#### 和弦快捷键

```json
{
  "chords": {
    "ctrl+k ctrl+s": "open-settings",
    "ctrl+k ctrl+m": "open-memory",
    "ctrl+k ctrl+p": "open-plan"
  }
}
```

### 5.12 主题配置

#### 主题定义

```json
{
  "theme": {
    "name": "custom",
    "colors": {
      "primary": "#007acc",
      "secondary": "#6c757d",
      "success": "#28a745",
      "error": "#dc3545",
      "warning": "#ffc107"
    },
    "syntax": {
      "keyword": "#569cd6",
      "string": "#ce9178",
      "comment": "#6a9955",
      "function": "#dcdcaa"
    }
  }
}
```

### 5.13 配置验证

#### 配置检查命令

```bash
# 检查配置有效性
claude --validate-config

# 显示当前配置
claude --show-config

# 重置配置
claude --reset-config
```

#### 配置迁移

```bash
# 从旧版本迁移配置
claude --migrate-config
```
