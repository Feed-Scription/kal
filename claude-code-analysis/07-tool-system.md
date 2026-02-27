# Claude Code CLI 逆向工程分析报告 - 第7部分：工具系统详解

## 7. 工具系统详解

### 7.1 工具架构

#### 工具定义结构

```javascript
// 工具定义格式
{
  name: "ToolName",
  description: "Tool description",
  inputSchema: {
    type: "object",
    properties: {
      param1: {
        type: "string",
        description: "Parameter description"
      }
    },
    required: ["param1"]
  }
}
```

#### 工具执行流程

```
1. Claude 决定调用工具
   ↓
2. 生成 tool_use 内容块
   ↓
3. 权限检查
   ↓
4. 执行工具
   ↓
5. 返回 tool_result
   ↓
6. 继续对话
```

### 7.2 Bash 工具

#### 功能特性

- 执行 shell 命令
- 支持后台运行
- 超时控制（默认 2 分钟，最大 10 分钟）
- 工作目录管理
- 环境变量继承

#### 参数

```javascript
{
  command: string,              // 要执行的命令
  description: string,          // 命令描述（必需）
  timeout?: number,             // 超时时间（毫秒）
  run_in_background?: boolean,  // 后台运行
  dangerouslyDisableSandbox?: boolean  // 禁用沙箱
}
```

#### 使用示例

```javascript
// 简单命令
{
  name: "Bash",
  input: {
    command: "ls -la",
    description: "List files in current directory"
  }
}

// 后台运行
{
  name: "Bash",
  input: {
    command: "npm test",
    description: "Run tests",
    run_in_background: true
  }
}

// 长时间运行
{
  name: "Bash",
  input: {
    command: "npm run build",
    description: "Build project",
    timeout: 300000  // 5 分钟
  }
}
```

#### 安全限制

- 不允许交互式命令（如 vim, nano）
- 不允许长时间运行的服务（如 npm run dev）
- 建议使用 `--run` 标志而不是 watch 模式
- 自动引用包含空格的路径

### 7.3 Read 工具

#### 功能特性

- 读取文本文件
- 支持行范围读取
- PDF 文件支持（最多 20 页）
- 图像文件支持（PNG, JPG 等）
- Jupyter Notebook 支持
- 自动截断长行（2000 字符）

#### 参数

```javascript
{
  file_path: string,    // 文件路径（绝对路径）
  offset?: number,      // 起始行号
  limit?: number,       // 读取行数
  pages?: string        // PDF 页码范围（如 "1-5"）
}
```

#### 使用示例

```javascript
// 读取整个文件
{
  name: "Read",
  input: {
    file_path: "/path/to/file.ts"
  }
}

// 读取特定行范围
{
  name: "Read",
  input: {
    file_path: "/path/to/large-file.ts",
    offset: 100,
    limit: 50
  }
}

// 读取 PDF
{
  name: "Read",
  input: {
    file_path: "/path/to/document.pdf",
    pages: "1-5"
  }
}

// 读取图像
{
  name: "Read",
  input: {
    file_path: "/path/to/screenshot.png"
  }
}
```

#### 输出格式

```
     1→line 1 content
     2→line 2 content
     3→line 3 content
```

### 7.4 Write 工具

#### 功能特性

- 创建新文件
- 覆盖现有文件
- 自动创建父目录
- 必须先 Read 才能覆盖

#### 参数

```javascript
{
  file_path: string,    // 文件路径（绝对路径）
  content: string       // 文件内容
}
```

#### 使用示例

```javascript
// 创建新文件
{
  name: "Write",
  input: {
    file_path: "/path/to/new-file.ts",
    content: "export const foo = 'bar';\n"
  }
}
```

#### 安全检查

- 覆盖现有文件前必须先 Read
- 不自动添加 emoji（除非用户要求）
- 优先使用 Edit 而不是 Write

### 7.5 Edit 工具

#### 功能特性

- 精确字符串替换
- 批量替换支持
- 保留缩进
- 必须先 Read 文件

#### 参数

```javascript
{
  file_path: string,      // 文件路径（绝对路径）
  old_string: string,     // 要替换的字符串
  new_string: string,     // 替换后的字符串
  replace_all?: boolean   // 是否替换所有匹配
}
```

#### 使用示例

```javascript
// 单次替换
{
  name: "Edit",
  input: {
    file_path: "/path/to/file.ts",
    old_string: "const foo = 'bar';",
    new_string: "const foo = 'baz';"
  }
}

// 批量替换（重命名变量）
{
  name: "Edit",
  input: {
    file_path: "/path/to/file.ts",
    old_string: "oldName",
    new_string: "newName",
    replace_all: true
  }
}
```

#### 重要注意事项

- `old_string` 必须在文件中唯一（除非使用 `replace_all`）
- 必须保留精确的缩进（不包括行号前缀）
- 不要包含行号前缀在 old_string 中

### 7.6 Glob 工具

#### 功能特性

- 文件模式匹配
- 支持 glob 语法
- 按修改时间排序
- 快速文件查找

#### 参数

```javascript
{
  pattern: string,    // Glob 模式
  path?: string       // 搜索目录（默认当前目录）
}
```

#### 使用示例

```javascript
// 查找所有 TypeScript 文件
{
  name: "Glob",
  input: {
    pattern: "**/*.ts"
  }
}

// 查找特定目录下的文件
{
  name: "Glob",
  input: {
    pattern: "*.json",
    path: "/path/to/config"
  }
}

// 复杂模式
{
  name: "Glob",
  input: {
    pattern: "src/**/*.{ts,tsx}"
  }
}
```

#### Glob 模式语法

- `*` - 匹配任意字符（不包括 `/`）
- `**` - 匹配任意字符（包括 `/`）
- `?` - 匹配单个字符
- `[abc]` - 匹配字符集
- `{a,b}` - 匹配多个模式

### 7.7 Grep 工具

#### 功能特性

- 基于 ripgrep 的高性能搜索
- 正则表达式支持
- 文件类型过滤
- 多种输出模式
- 上下文行显示

#### 参数

```javascript
{
  pattern: string,              // 搜索模式（正则表达式）
  path?: string,                // 搜索路径
  output_mode?: string,         // 输出模式
  glob?: string,                // 文件过滤
  type?: string,                // 文件类型
  "-i"?: boolean,               // 忽略大小写
  "-n"?: boolean,               // 显示行号
  "-A"?: number,                // 后续行数
  "-B"?: number,                // 前置行数
  "-C"?: number,                // 上下文行数
  context?: number,             // 上下文行数（同 -C）
  head_limit?: number,          // 限制输出行数
  offset?: number,              // 跳过前 N 行
  multiline?: boolean           // 多行模式
}
```

#### 输出模式

- `files_with_matches` - 只显示文件路径（默认）
- `content` - 显示匹配行内容
- `count` - 显示匹配计数

#### 使用示例

```javascript
// 查找包含特定文本的文件
{
  name: "Grep",
  input: {
    pattern: "function.*async",
    output_mode: "files_with_matches"
  }
}

// 查看匹配内容
{
  name: "Grep",
  input: {
    pattern: "TODO",
    output_mode: "content",
    "-n": true,
    "-C": 2
  }
}

// 按文件类型过滤
{
  name: "Grep",
  input: {
    pattern: "import.*React",
    type: "js",
    output_mode: "content"
  }
}

// 使用 glob 过滤
{
  name: "Grep",
  input: {
    pattern: "export.*class",
    glob: "src/**/*.ts",
    output_mode: "content"
  }
}

// 多行搜索
{
  name: "Grep",
  input: {
    pattern: "interface.*\\{[\\s\\S]*?\\}",
    multiline: true,
    output_mode: "content"
  }
}
```

### 7.8 Task 工具

#### 功能特性

- 启动专用子 Agent
- 并行执行支持
- 后台运行支持
- 独立上下文
- 可恢复会话

#### 参数

```javascript
{
  subagent_type: string,        // Agent 类型
  prompt: string,               // 任务描述
  description: string,          // 简短描述（3-5 词）
  model?: string,               // 模型选择
  run_in_background?: boolean,  // 后台运行
  resume?: string,              // 恢复 Agent ID
  isolation?: string,           // 隔离模式（"worktree"）
  max_turns?: number            // 最大轮次
}
```

#### Agent 类型

- `general-purpose` - 通用任务
- `Explore` - 代码库探索（快速）
- `Plan` - 实现计划设计
- `claude-code-guide` - 文档查询
- `statusline-setup` - 状态栏配置

#### 使用示例

```javascript
// 探索代码库
{
  name: "Task",
  input: {
    subagent_type: "Explore",
    description: "Find API endpoints",
    prompt: "Find all API endpoint definitions in the codebase"
  }
}

// 设计实现计划
{
  name: "Task",
  input: {
    subagent_type: "Plan",
    description: "Plan authentication feature",
    prompt: "Design an implementation plan for adding user authentication"
  }
}

// 后台运行
{
  name: "Task",
  input: {
    subagent_type: "general-purpose",
    description: "Run comprehensive tests",
    prompt: "Run all tests and analyze failures",
    run_in_background: true
  }
}

// 使用 Haiku 模型（更快更便宜）
{
  name: "Task",
  input: {
    subagent_type: "Explore",
    description: "Quick file search",
    prompt: "Find all configuration files",
    model: "haiku"
  }
}

// Worktree 隔离
{
  name: "Task",
  input: {
    subagent_type: "general-purpose",
    description: "Experimental refactor",
    prompt: "Refactor the authentication module",
    isolation: "worktree"
  }
}
```

### 7.9 WebFetch 工具

#### 功能特性

- 获取网页内容
- HTML 转 Markdown
- 15 分钟缓存
- AI 处理内容

#### 参数

```javascript
{
  url: string,      // 网页 URL
  prompt: string    // 处理提示
}
```

#### 使用示例

```javascript
// 获取文档
{
  name: "WebFetch",
  input: {
    url: "https://docs.example.com/api",
    prompt: "Extract API endpoint information"
  }
}

// 分析网页
{
  name: "WebFetch",
  input: {
    url: "https://example.com",
    prompt: "Summarize the main features described on this page"
  }
}
```

#### 限制

- HTTP 自动升级为 HTTPS
- 优先使用 MCP web fetch 工具（如果可用）
- 不适用于 GitHub URL（使用 gh CLI）

### 7.10 WebSearch 工具

#### 功能特性

- 网页搜索
- 域名过滤
- 返回搜索结果
- 仅限美国

#### 参数

```javascript
{
  query: string,              // 搜索查询
  allowed_domains?: string[], // 允许的域名
  blocked_domains?: string[]  // 屏蔽的域名
}
```

#### 使用示例

```javascript
// 基本搜索
{
  name: "WebSearch",
  input: {
    query: "React hooks best practices 2026"
  }
}

// 域名过滤
{
  name: "WebSearch",
  input: {
    query: "TypeScript tutorial",
    allowed_domains: ["typescriptlang.org", "github.com"]
  }
}

// 屏蔽域名
{
  name: "WebSearch",
  input: {
    query: "JavaScript frameworks",
    blocked_domains: ["w3schools.com"]
  }
}
```

#### 重要提示

- 必须在响应中包含 "Sources:" 部分
- 列出所有相关 URL 作为 Markdown 链接

### 7.11 AskUserQuestion 工具

#### 功能特性

- 询问用户问题
- 单选/多选支持
- 预览功能
- 自动添加 "Other" 选项

#### 参数

```javascript
{
  questions: [
    {
      question: string,       // 问题文本
      header: string,         // 短标签（最多 12 字符）
      options: [
        {
          label: string,      // 选项标签
          description: string,// 选项描述
          markdown?: string   // 预览内容（可选）
        }
      ],
      multiSelect: boolean    // 是否多选
    }
  ]
}
```

#### 使用示例

```javascript
// 单选问题
{
  name: "AskUserQuestion",
  input: {
    questions: [
      {
        question: "Which library should we use for date formatting?",
        header: "Library",
        multiSelect: false,
        options: [
          {
            label: "date-fns (Recommended)",
            description: "Modern, modular, tree-shakeable"
          },
          {
            label: "moment.js",
            description: "Popular but large bundle size"
          },
          {
            label: "dayjs",
            description: "Lightweight moment.js alternative"
          }
        ]
      }
    ]
  }
}

// 多选问题
{
  name: "AskUserQuestion",
  input: {
    questions: [
      {
        question: "Which features do you want to enable?",
        header: "Features",
        multiSelect: true,
        options: [
          {
            label: "Dark mode",
            description: "Add dark theme support"
          },
          {
            label: "Offline mode",
            description: "Enable offline functionality"
          },
          {
            label: "Analytics",
            description: "Add usage analytics"
          }
        ]
      }
    ]
  }
}

// 带预览的问题
{
  name: "AskUserQuestion",
  input: {
    questions: [
      {
        question: "Choose a layout for the dashboard?",
        header: "Layout",
        multiSelect: false,
        options: [
          {
            label: "Grid Layout",
            description: "Responsive grid with cards",
            markdown: "┌─────┬─────┐\n│  A  │  B  │\n├─────┼─────┤\n│  C  │  D  │\n└─────┴─────┘"
          },
          {
            label: "List Layout",
            description: "Vertical list of items",
            markdown: "┌───────────┐\n│     A     │\n├───────────┤\n│     B     │\n├───────────┤\n│     C     │\n└───────────┘"
          }
        ]
      }
    ]
  }
}
```

### 7.12 其他工具

#### EnterPlanMode

进入计划模式，设计实现方案。

```javascript
{
  name: "EnterPlanMode",
  input: {}
}
```

#### ExitPlanMode

退出计划模式，请求用户批准。

```javascript
{
  name: "ExitPlanMode",
  input: {
    allowedPrompts: [
      {
        tool: "Bash",
        prompt: "run tests"
      }
    ]
  }
}
```

#### Skill

调用技能插件。

```javascript
{
  name: "Skill",
  input: {
    skill: "commit",
    args: "-m 'Fix bug'"
  }
}
```

#### TaskCreate/Update/List/Get

任务管理工具。

```javascript
// 创建任务
{
  name: "TaskCreate",
  input: {
    subject: "Fix authentication bug",
    description: "The login form is not validating email addresses correctly",
    activeForm: "Fixing authentication bug"
  }
}

// 更新任务
{
  name: "TaskUpdate",
  input: {
    taskId: "1",
    status: "completed"
  }
}

// 列出任务
{
  name: "TaskList",
  input: {}
}

// 获取任务
{
  name: "TaskGet",
  input: {
    taskId: "1"
  }
}
```

#### NotebookEdit

编辑 Jupyter Notebook。

```javascript
{
  name: "NotebookEdit",
  input: {
    notebook_path: "/path/to/notebook.ipynb",
    cell_id: "abc123",
    new_source: "print('Hello, World!')",
    cell_type: "code",
    edit_mode: "replace"
  }
}
```

### 7.13 工具使用最佳实践

#### 并行执行

```javascript
// 同时执行多个独立工具
await Promise.all([
  executeTool('Bash', { command: 'git status' }),
  executeTool('Bash', { command: 'git diff' }),
  executeTool('Read', { file_path: 'package.json' })
]);
```

#### 错误处理

```javascript
// 工具执行失败时的处理
{
  type: 'tool_result',
  tool_use_id: 'toolu_123',
  is_error: true,
  content: 'Error: File not found'
}
```

#### 工具链

```javascript
// 工具调用链
1. Glob("**/*.ts") → 找到所有 TS 文件
2. Read(files[0]) → 读取第一个文件
3. Edit(file, old, new) → 编辑文件
4. Bash("npm test") → 运行测试
```

#### 权限优化

```javascript
// 使用 allowed-prompts 减少询问
{
  "allowedPrompts": [
    { "tool": "Bash", "prompt": "run tests" },
    { "tool": "Bash", "prompt": "install dependencies" },
    { "tool": "Read", "prompt": "read file" },
    { "tool": "Glob", "prompt": "find files" },
    { "tool": "Grep", "prompt": "search code" }
  ]
}
```
