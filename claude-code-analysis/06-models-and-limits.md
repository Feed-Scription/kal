# Claude Code CLI 逆向工程分析报告 - 第6部分：模型与限制

## 6. 模型与限制详解

### 6.1 支持的模型

#### Claude 4.6 系列（最新）

| 模型 | 模型 ID | 特点 | 输入限制 | 输出限制 |
|------|---------|------|----------|----------|
| Opus 4.6 | `claude-opus-4-6` | 最强推理能力 | 200K / 1M | 64K |
| Sonnet 4.6 | `claude-sonnet-4-6` | 平衡性能 | 200K / 1M | 64K |

#### Claude 4.5 系列

| 模型 | 模型 ID | 特点 | 输入限制 | 输出限制 |
|------|---------|------|----------|----------|
| Opus 4.5 | `claude-opus-4-5` | 强推理能力 | 200K / 1M | 64K |
| Sonnet 4.5 | `claude-sonnet-4-5` | 高性能 | 200K / 1M | 64K |
| Haiku 4.5 | `claude-haiku-4-5` | 最快速度 | 200K / 1M | 32K |

#### Claude 4.0/4.1 系列

| 模型 | 模型 ID | 特点 | 输入限制 | 输出限制 |
|------|---------|------|----------|----------|
| Opus 4.1 | `claude-opus-4-1` | 强推理 | 200K | 32K |
| Opus 4.0 | `claude-opus-4` | 基础版 | 200K | 32K |
| Sonnet 4.0 | `claude-sonnet-4` | 基础版 | 200K | 32K |

#### Claude 3.x 系列（旧版）

| 模型 | 模型 ID | 输入限制 | 输出限制 |
|------|---------|----------|----------|
| Sonnet 3.7 | `claude-sonnet-3-7` | 200K / 1M | 64K |
| Sonnet 3.5 | `claude-3-5-sonnet` | 200K | 8K |
| Opus 3 | `claude-3-opus` | 200K | 4K |
| Haiku 3.5 | `claude-3-5-haiku` | 200K | 8K |
| Haiku 3 | `claude-3-haiku` | 200K | 4K |

### 6.2 模型选择策略

#### 默认模型

```javascript
// 默认使用 Sonnet 4.6
const DEFAULT_MODEL = 'claude-sonnet-4-6';
```

#### 自动模型选择

```javascript
// 伪代码
function selectModel(task) {
  if (task.requiresDeepReasoning) {
    return 'claude-opus-4-6';
  }

  if (task.isSimple || task.needsSpeed) {
    return 'claude-haiku-4-5';
  }

  // 默认使用 Sonnet
  return 'claude-sonnet-4-6';
}
```

#### Agent 模型选择

```javascript
// 子 Agent 默认使用 Haiku（更快更便宜）
const AGENT_DEFAULT_MODEL = 'claude-haiku-4-5';

// 可以在 Task 工具中指定模型
{
  subagent_type: 'explore',
  model: 'haiku', // 或 'sonnet', 'opus'
  prompt: '...'
}
```

### 6.3 Token 限制详解

#### 上下文窗口

```javascript
// 默认上下文限制
const DEFAULT_CONTEXT_LIMIT = 200000; // 200K tokens

// 1M 上下文支持（部分模型）
const EXTENDED_CONTEXT_LIMIT = 1000000; // 1M tokens

// 检查是否支持 1M 上下文
function supports1MContext(model) {
  // 包含 [1M] 标记的模型
  if (/\[1M\]/i.test(model)) return true;

  // Sonnet 4.x 和 Opus 4.6
  const modelLower = model.toLowerCase();
  return modelLower.includes('claude-sonnet-4') ||
         modelLower.includes('opus-4-6');
}
```

#### 输出限制

```javascript
// 根据模型确定输出限制
function getOutputLimits(model) {
  const modelLower = model.toLowerCase();

  if (modelLower.includes('opus-4-5') ||
      modelLower.includes('opus-4-6') ||
      modelLower.includes('sonnet-4') ||
      modelLower.includes('haiku-4')) {
    return {
      default: 32000,
      upperLimit: 64000
    };
  }

  if (modelLower.includes('opus-4-1') ||
      modelLower.includes('opus-4')) {
    return {
      default: 32000,
      upperLimit: 32000
    };
  }

  if (modelLower.includes('3-7-sonnet')) {
    return {
      default: 32000,
      upperLimit: 64000
    };
  }

  if (modelLower.includes('3-5-sonnet') ||
      modelLower.includes('3-5-haiku')) {
    return {
      default: 8192,
      upperLimit: 8192
    };
  }

  if (modelLower.includes('claude-3-opus')) {
    return {
      default: 4096,
      upperLimit: 4096
    };
  }

  // 默认值
  return {
    default: 32000,
    upperLimit: 64000
  };
}
```

#### Token 计数

```javascript
// Token 使用统计
{
  input_tokens: 12500,           // 输入 tokens
  output_tokens: 3200,           // 输出 tokens
  cache_creation_input_tokens: 8000,  // 缓存创建
  cache_read_input_tokens: 4500       // 缓存读取
}

// 总消耗计算
const totalInput = input_tokens + cache_creation_input_tokens;
const totalOutput = output_tokens;
const cacheSavings = cache_read_input_tokens * 0.9; // 90% 折扣
```

### 6.4 上下文管理策略

#### 上下文使用率监控

```javascript
// 计算上下文使用率
function calculateContextUsage(usage, contextLimit) {
  const used = usage.input_tokens +
               usage.cache_creation_input_tokens +
               usage.cache_read_input_tokens;

  const percentage = Math.round(used / contextLimit * 100);
  const remaining = 100 - percentage;

  return {
    used: Math.min(100, Math.max(0, percentage)),
    remaining: remaining
  };
}
```

#### 自动压缩触发

```javascript
// 当使用率超过 80% 时触发压缩
const COMPRESSION_THRESHOLD = 0.8;

function shouldCompressContext(usage, contextLimit) {
  const usageRate = usage.input_tokens / contextLimit;
  return usageRate > COMPRESSION_THRESHOLD;
}
```

#### 压缩策略

```javascript
// 压缩策略
function compressContext(messages) {
  // 1. 保留系统提示
  const systemPrompt = messages.filter(m => m.role === 'system');

  // 2. 保留最近 10 条消息
  const recentMessages = messages.slice(-10);

  // 3. 压缩中间消息
  const middleMessages = messages.slice(0, -10);
  const compressed = summarizeMessages(middleMessages);

  // 4. 重建消息列表
  return [
    ...systemPrompt,
    {
      role: 'user',
      content: `[Previous conversation summary]\n${compressed}`
    },
    ...recentMessages
  ];
}
```

### 6.5 Prompt Caching 详解

#### 缓存标记

```javascript
// 标记可缓存内容
{
  system: [
    {
      type: 'text',
      text: 'Long system prompt...',
      cache_control: { type: 'ephemeral' }
    }
  ],
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Large codebase context...',
          cache_control: { type: 'ephemeral' }
        }
      ]
    }
  ]
}
```

#### 缓存策略

1. **系统提示缓存**: 总是缓存系统提示
2. **工具定义缓存**: 缓存工具定义（很少变化）
3. **大文件缓存**: 缓存大型文件内容
4. **对话历史缓存**: 缓存旧的对话历史

#### 缓存有效期

- **有效期**: 5 分钟
- **刷新**: 每次使用时刷新
- **失效**: 5 分钟无使用后失效

#### 缓存成本

```javascript
// Token 成本计算
function calculateCost(usage, model) {
  const pricing = getPricing(model);

  // 输入成本
  const inputCost =
    usage.input_tokens * pricing.input +
    usage.cache_creation_input_tokens * pricing.cacheWrite;

  // 缓存读取成本（90% 折扣）
  const cacheCost =
    usage.cache_read_input_tokens * pricing.input * 0.1;

  // 输出成本
  const outputCost =
    usage.output_tokens * pricing.output;

  return inputCost + cacheCost + outputCost;
}
```

### 6.6 速率限制

#### API 速率限制

```javascript
// 速率限制错误处理
class RateLimitError extends Error {
  constructor(retryAfter) {
    super('Rate limit exceeded');
    this.retryAfter = retryAfter; // 秒
  }
}

// 自动重试
async function handleRateLimit(error) {
  if (error instanceof RateLimitError) {
    console.log(`Rate limited. Retrying after ${error.retryAfter}s`);
    await sleep(error.retryAfter * 1000);
    return retry();
  }
}
```

#### 并发限制

```javascript
// 限制并发请求数
const MAX_CONCURRENT_REQUESTS = 5;

class RequestQueue {
  constructor(maxConcurrent) {
    this.maxConcurrent = maxConcurrent;
    this.running = 0;
    this.queue = [];
  }

  async add(fn) {
    while (this.running >= this.maxConcurrent) {
      await this.waitForSlot();
    }

    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      this.processQueue();
    }
  }
}
```

### 6.7 成本优化

#### 模型选择优化

```javascript
// 根据任务复杂度选择模型
function optimizeModelSelection(task) {
  // 简单任务使用 Haiku（便宜）
  if (task.complexity === 'low') {
    return 'claude-haiku-4-5';
  }

  // 中等任务使用 Sonnet（平衡）
  if (task.complexity === 'medium') {
    return 'claude-sonnet-4-6';
  }

  // 复杂任务使用 Opus（强大）
  return 'claude-opus-4-6';
}
```

#### 缓存优化

```javascript
// 最大化缓存利用率
function optimizeCaching(messages) {
  // 1. 将不变的内容放在前面
  // 2. 使用 cache_control 标记
  // 3. 保持缓存内容稳定

  return messages.map((msg, index) => {
    // 前面的消息更可能被缓存
    if (index < messages.length - 3) {
      return {
        ...msg,
        cache_control: { type: 'ephemeral' }
      };
    }
    return msg;
  });
}
```

#### Token 优化

```javascript
// 减少 token 使用
function optimizeTokenUsage(content) {
  // 1. 移除不必要的空白
  content = content.trim();

  // 2. 压缩重复内容
  content = deduplicateContent(content);

  // 3. 使用简洁的表达
  content = simplifyLanguage(content);

  return content;
}
```

### 6.8 Vertex AI 和 Bedrock 支持

#### Vertex AI 配置

```javascript
// Vertex AI 区域配置
const VERTEX_REGIONS = {
  'claude-haiku-4-5': process.env.VERTEX_REGION_CLAUDE_HAIKU_4_5,
  'claude-3-5-haiku': process.env.VERTEX_REGION_CLAUDE_3_5_HAIKU,
  'claude-3-5-sonnet': process.env.VERTEX_REGION_CLAUDE_3_5_SONNET,
  'claude-3-7-sonnet': process.env.VERTEX_REGION_CLAUDE_3_7_SONNET,
  'claude-opus-4-1': process.env.VERTEX_REGION_CLAUDE_4_1_OPUS,
  'claude-opus-4': process.env.VERTEX_REGION_CLAUDE_4_0_OPUS,
  'claude-sonnet-4-6': process.env.VERTEX_REGION_CLAUDE_4_6_SONNET,
  'claude-sonnet-4-5': process.env.VERTEX_REGION_CLAUDE_4_5_SONNET,
  'claude-sonnet-4': process.env.VERTEX_REGION_CLAUDE_4_0_SONNET
};
```

#### AWS Bedrock 配置

```javascript
// Bedrock 区域配置
const AWS_REGION = process.env.AWS_REGION ||
                   process.env.AWS_DEFAULT_REGION ||
                   'us-east-1';
```
