# Claude Code CLI 逆向工程分析报告 - 第3部分：工作流程

## 3. 工作流程详解

### 3.1 整体流程图

```
用户输入
   ↓
解析命令/消息
   ↓
权限检查 ←─────────┐
   ↓                │
构建 API 请求       │
   ↓                │
发送到 Anthropic API│
   ↓                │
接收流式响应        │
   ↓                │
解析响应事件        │
   ↓                │
┌──────────────┐   │
│ 文本内容？   │───┤ 显示给用户
│ 工具调用？   │───┤ 执行工具 → 返回结果 ──┘
│ 结束？       │───┤ 完成对话
└──────────────┘   │
   ↓                │
上下文管理          │
Token 计数          │
缓存优化 ───────────┘
```

### 3.2 启动流程

1. **初始化阶段**
   - 读取配置文件 (`~/.claude/settings.json`)
   - 加载环境变量
   - 检查认证状态 (OAuth/API Key)
   - 初始化终端 UI
   - 加载 MCP 服务器
   - 加载技能插件

2. **会话恢复**
   - 检查是否有未完成的会话
   - 加载对话历史
   - 恢复上下文状态

3. **主循环启动**
   - 显示欢迎信息
   - 进入交互模式
   - 等待用户输入

### 3.3 消息处理流程

#### 用户输入处理

```javascript
// 伪代码示例
async function handleUserInput(input) {
  // 1. 解析输入
  const message = parseInput(input);

  // 2. 检查是否是命令
  if (isCommand(message)) {
    return executeCommand(message);
  }

  // 3. 添加到对话历史
  conversationHistory.push({
    role: 'user',
    content: message
  });

  // 4. 发送 API 请求
  const response = await sendAPIRequest();

  // 5. 处理流式响应
  await handleStreamResponse(response);
}
```

#### API 请求构建

```javascript
// 伪代码示例
function buildAPIRequest() {
  return {
    model: getSelectedModel(), // claude-sonnet-4-6
    max_tokens: getMaxTokens(), // 32000-64000
    messages: conversationHistory,
    tools: getAvailableTools(), // Bash, Read, Write, etc.
    system: getSystemPrompt(),
    stream: true,
    // Prompt Caching
    cache_control: {
      type: 'ephemeral'
    }
  };
}
```

### 3.4 流式响应处理

#### 事件处理循环

```javascript
// 伪代码示例
async function handleStreamResponse(stream) {
  for await (const event of stream) {
    switch (event.type) {
      case 'message_start':
        // 初始化消息
        initializeMessage(event);
        break;

      case 'content_block_start':
        // 开始新的内容块
        if (event.content_block.type === 'text') {
          startTextBlock();
        } else if (event.content_block.type === 'tool_use') {
          startToolUseBlock(event.content_block);
        }
        break;

      case 'content_block_delta':
        // 增量更新
        if (event.delta.type === 'text_delta') {
          displayText(event.delta.text);
        }
        break;

      case 'content_block_stop':
        // 内容块结束
        finalizeContentBlock();
        break;

      case 'message_delta':
        // 消息元数据更新
        updateMessageMetadata(event.delta);
        break;

      case 'message_stop':
        // 消息完成
        finalizeMessage();
        break;
    }
  }
}
```

### 3.5 工具调用流程

#### 工具执行

```javascript
// 伪代码示例
async function executeToolCall(toolUse) {
  // 1. 权限检查
  const permitted = await checkPermission(toolUse);
  if (!permitted) {
    return {
      type: 'tool_result',
      tool_use_id: toolUse.id,
      is_error: true,
      content: 'Permission denied'
    };
  }

  // 2. 执行工具
  try {
    const result = await executeTool(toolUse.name, toolUse.input);

    // 3. 返回结果
    return {
      type: 'tool_result',
      tool_use_id: toolUse.id,
      content: result
    };
  } catch (error) {
    return {
      type: 'tool_result',
      tool_use_id: toolUse.id,
      is_error: true,
      content: error.message
    };
  }
}
```

#### 工具结果处理

```javascript
// 伪代码示例
async function handleToolResults(toolResults) {
  // 1. 添加工具结果到对话历史
  conversationHistory.push({
    role: 'user',
    content: toolResults
  });

  // 2. 继续对话（发送新的 API 请求）
  const response = await sendAPIRequest();

  // 3. 处理响应
  await handleStreamResponse(response);
}
```

### 3.6 权限检查流程

```javascript
// 伪代码示例
async function checkPermission(toolUse) {
  const mode = getPermissionMode();

  switch (mode) {
    case 'auto':
      // 自动批准
      return true;

    case 'prompt':
      // 询问用户
      return await askUserForPermission(toolUse);

    case 'allowed-prompts':
      // 检查是否在允许列表中
      return isAllowedPrompt(toolUse);

    case 'custom':
      // 自定义规则
      return evaluateCustomRules(toolUse);

    default:
      return false;
  }
}
```

### 3.7 上下文管理流程

#### Token 计数

```javascript
// 伪代码示例
function updateTokenCount(usage) {
  const {
    input_tokens,
    output_tokens,
    cache_creation_input_tokens,
    cache_read_input_tokens
  } = usage;

  // 计算总消耗
  const totalTokens = input_tokens + output_tokens;

  // 计算缓存节省
  const cacheSavings = cache_read_input_tokens * 0.9;

  // 更新统计
  updateUsageStats({
    totalTokens,
    cacheSavings,
    cost: calculateCost(usage)
  });

  // 检查是否接近限制
  if (totalTokens > CONTEXT_LIMIT * 0.8) {
    compressContext();
  }
}
```

#### 上下文压缩

```javascript
// 伪代码示例
function compressContext() {
  // 1. 保留最近的消息
  const recentMessages = conversationHistory.slice(-10);

  // 2. 压缩旧消息
  const oldMessages = conversationHistory.slice(0, -10);
  const compressed = summarizeMessages(oldMessages);

  // 3. 重建对话历史
  conversationHistory = [
    { role: 'system', content: compressed },
    ...recentMessages
  ];
}
```

### 3.8 错误处理流程

```javascript
// 伪代码示例
async function handleError(error) {
  if (error instanceof RateLimitError) {
    // 速率限制 - 等待重试
    await sleep(error.retryAfter);
    return retry();
  }

  if (error instanceof AuthenticationError) {
    // 认证失败 - 重新登录
    await reauthenticate();
    return retry();
  }

  if (error instanceof TimeoutError) {
    // 超时 - 询问用户是否重试
    const shouldRetry = await askUserToRetry();
    if (shouldRetry) return retry();
  }

  // 其他错误 - 显示错误信息
  displayError(error);
}
```

### 3.9 会话持久化

```javascript
// 伪代码示例
async function saveSession() {
  const session = {
    conversationHistory,
    context: getCurrentContext(),
    timestamp: Date.now(),
    model: getSelectedModel(),
    usage: getUsageStats()
  };

  await writeFile(
    '~/.claude/sessions/current.json',
    JSON.stringify(session)
  );
}

async function loadSession() {
  const sessionData = await readFile(
    '~/.claude/sessions/current.json'
  );

  const session = JSON.parse(sessionData);
  conversationHistory = session.conversationHistory;
  restoreContext(session.context);
}
```

### 3.10 Agent 工作流程

#### 启动子 Agent

```javascript
// 伪代码示例
async function launchAgent(config) {
  const agent = createAgent({
    type: config.subagent_type, // explore, plan, etc.
    prompt: config.prompt,
    model: config.model || 'haiku', // 默认使用 haiku
    isolation: config.isolation, // worktree 隔离
    run_in_background: config.run_in_background
  });

  if (config.run_in_background) {
    // 后台运行
    agent.start();
    return { task_id: agent.id };
  } else {
    // 前台运行，等待完成
    const result = await agent.run();
    return result;
  }
}
```

#### Agent 通信

```javascript
// 伪代码示例
class Agent {
  async run() {
    // 1. 初始化 Agent 上下文
    this.context = initializeContext(this.config);

    // 2. 执行 Agent 任务
    while (!this.isComplete()) {
      const response = await this.sendAPIRequest();
      await this.handleResponse(response);
    }

    // 3. 返回结果
    return this.getResult();
  }

  async handleResponse(response) {
    // Agent 有自己的工具执行循环
    for await (const event of response) {
      // 处理流式事件
      await this.processEvent(event);
    }
  }
}
```
