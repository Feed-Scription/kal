# Core 模块

Core 模块是 KAL 引擎的核心，定义了 Node、Flow、State 等基础概念的接口和实现。

## Node（节点）

Node 是功能实现的最小单位，通过 Handler（输入/输出端口）连接形成数据流。

### Node 的结构

Node 在 flow JSON 中的完整结构：

```typescript
interface NodeDefinition {
  id: string;                    // 节点唯一标识
  type: string;                  // 节点类型（如 "SignalIn", "GenerateText"）
  label?: string;                // 显示名称（用于编辑器）
  position?: { x: number; y: number };  // 编辑器中的位置
  inputs: HandlerDefinition[];   // 输入端口定义
  outputs: HandlerDefinition[];  // 输出端口定义
  config?: Record<string, any>;  // 节点特有配置（如模板内容、正则表达式等）
}
```

### Handler（端口）

Handler 是 Node 上的输入/输出端口，用于连接不同的 Node。

```typescript
interface HandlerDefinition {
  name: string;           // 端口名称
  type: string;           // 数据类型
  defaultValue?: any;     // 默认值（仅输入端口）
  required?: boolean;     // 是否必需（仅输入端口）
}
```

#### 输入端口的值来源

类似 ComfyUI，输入端口的值有两种来源：

1. **节点属性面板直接设置**：在编辑器中直接在节点上填写固定值，无需连线
2. **上游连线传入**：通过 edge 从上游节点的输出端口动态传入

当输入端口同时有属性面板设置的值和连线传入的值时，连线传入的值优先。

这意味着像 State 管理类节点的 `key` 参数，虽然大多数情况下会在节点上直接填写，但它本质上是一个输入 handler，也可以通过连线动态传入。

#### Handler 类型系统

Handler 支持内置类型和用户自定义类型：

**内置类型：**
- `string`: 字符串
- `number`: 数字
- `boolean`: 布尔值
- `ChatMessage[]`: 聊天消息数组（用于 LLM）
- `ImageUrl`: 图像 URL
- `object`: 任意对象
- `array`: 任意数组

**自定义类型：**
用户可以通过 TypeScript 定义新的类型，在自定义 Node 中使用。

**类型检查：**
连接两个 Handler 时，引擎会检查类型兼容性。输出端口的类型必须与输入端口的类型匹配。

### 内置 Node 类型

#### 信号类

信号类节点作为 flow 的起点和终点，具有完全对应的输入和输出参数。

**SignalIn（信号输入）**
- 作用：flow 的入口点
- 没有输入连接时：作为事件输入口对接引擎层
- 有输入连接时：仅作为数据验证
- 输出：根据具体信号类型定义的数据

**SignalOut（信号输出）**
- 作用：flow 的出口点
- 没有输出连接时：作为事件输出口对接引擎层
- 有输出连接时：仅作为数据验证
- 输入：根据具体信号类型定义的数据

**Timer（计时器）**
- 作用：特殊的信号输入，按时间触发
- 配置：
  - `delay`: 延迟触发（毫秒）
  - `interval`: 间隔触发（毫秒）
- 输出：触发时间戳

#### State 管理类

**AddState（添加状态）**
- 输入：
  - `key`: string - 状态键名（可在节点上直接设置或连线传入）
  - `type`: string - 状态类型（可在节点上直接设置或连线传入）
  - `value`: any - 状态值
- 输出：
  - `success`: boolean - 是否成功

**RemoveState（删除状态）**
- 输入：
  - `key`: string - 状态键名（可在节点上直接设置或连线传入）
- 输出：
  - `success`: boolean - 是否成功

**ReadState（读取状态）**
- 输入：
  - `key`: string - 状态键名（可在节点上直接设置或连线传入）
- 输出：
  - `value`: any - 状态值
  - `exists`: boolean - 是否存在

**ModifyState（修改状态）**
- 输入：
  - `key`: string - 状态键名（可在节点上直接设置或连线传入）
  - `value`: any - 新的状态值
- 输出：
  - `success`: boolean - 是否成功

#### 文本类

**UseTemplate（使用文本模板）**
- 配置：
  - `template`: string - 模板字符串（支持变量插值）
- 输入：
  - 动态输入（根据模板中的变量）
- 输出：
  - `text`: string - 渲染后的文本

**Prompt（组装 Prompt）**
- 作用：将数据组装为 ChatMessage[]
- 输入：
  - `system`: string - 系统消息
  - `user`: string - 用户消息
  - `history`: ChatMessage[] - 历史消息
- 输出：
  - `messages`: ChatMessage[] - 组装后的消息数组

**GenerateText（生成文本）**
- 作用：调用 LLM 生成文本
- 配置：
  - `model`: string - 模型名称
  - `temperature`: number - 温度参数
  - `maxTokens`: number - 最大 token 数
- 输入：
  - `messages`: ChatMessage[] - 输入消息
- 输出：
  - `text`: string - 生成的文本
  - `usage`: object - token 使用情况

**Regex（正则匹配处理）**
- 配置：
  - `pattern`: string - 正则表达式
  - `flags`: string - 正则标志（如 "gi"）
- 输入：
  - `text`: string - 待处理文本
- 输出：
  - `matches`: string[] - 匹配结果
  - `groups`: object - 捕获组

#### 图像类

**GenerateImage（生成图像）**
- 配置：
  - `model`: string - 模型名称
  - `size`: string - 图像尺寸
- 输入：
  - `prompt`: string - 图像描述
- 输出：
  - `imageUrl`: ImageUrl - 生成的图像 URL

#### 数据处理类

**JSONParse（JSON 解析与修复）**
- 作用：解析 JSON，处理截断、注释、尾逗号等问题
- 输入：
  - `text`: string - 待解析的 JSON 字符串
- 输出：
  - `data`: object - 解析后的数据
  - `success`: boolean - 是否成功
  - `error`: string - 错误信息（如果失败）

### 自定义 Node

用户可以通过编写 TypeScript 文件来定义自定义 Node。

#### 自定义 Node 的接口

```typescript
interface CustomNode {
  // Node 元信息
  type: string;
  label: string;

  // Handler 声明
  inputs: HandlerDefinition[];
  outputs: HandlerDefinition[];

  // 执行函数
  execute: (inputs: Record<string, any>, config: Record<string, any>) => Promise<Record<string, any>>;
}
```

#### 示例：自定义 Node

```typescript
// node/MyCustomNode.ts
export default {
  type: 'MyCustomNode',
  label: '我的自定义节点',

  inputs: [
    { name: 'input1', type: 'string', required: true },
    { name: 'input2', type: 'number', defaultValue: 0 }
  ],

  outputs: [
    { name: 'result', type: 'string' }
  ],

  async execute(inputs, config) {
    const result = `${inputs.input1} - ${inputs.input2}`;
    return { result };
  }
};
```

#### 自定义 Node 的加载

引擎会自动扫描项目 `node/` 目录下的所有 `.ts` 文件，加载并注册自定义 Node。

## Flow（工作流）

Flow 是由 Node 组成的有向无环图（DAG），使用 JSON 文件存储。

### Flow 的结构

```json
{
  "nodes": [
    {
      "id": "node1",
      "type": "SignalIn",
      "label": "开始",
      "position": { "x": 100, "y": 100 },
      "inputs": [],
      "outputs": [
        { "name": "message", "type": "string" }
      ]
    },
    {
      "id": "node2",
      "type": "GenerateText",
      "label": "生成文本",
      "position": { "x": 300, "y": 100 },
      "inputs": [
        { "name": "messages", "type": "ChatMessage[]" }
      ],
      "outputs": [
        { "name": "text", "type": "string" }
      ],
      "config": {
        "model": "gpt-4",
        "temperature": 0.7
      }
    }
  ],
  "edges": [
    {
      "source": "node1",
      "sourceHandler": "message",
      "target": "node2",
      "targetHandler": "messages"
    }
  ]
}
```

### Flow 的执行模型

Flow 采用**事件驱动/响应式**执行模型：

1. **触发起点**：当一个 SignalIn 节点被触发（接收到事件或数据）时，开始执行
2. **数据传播**：
   - 节点执行完成后，将输出数据传递给所有连接的下游节点
   - 当一个节点的所有输入端口都接收到数据时，该节点自动触发执行
3. **并行执行**：没有依赖关系的节点可以并行执行
4. **终止条件**：当数据到达 SignalOut 节点时，该分支的执行结束

#### 执行示例

```
SignalIn (触发)
  → Node A (执行)
    → Node B (等待 A 完成)
    → Node C (等待 A 完成)
      → Node D (等待 B 和 C 都完成)
        → SignalOut (输出)
```

### 子 Flow（Flow 嵌套）

Flow 支持嵌套子 Flow，但不允许循环引用。

#### 子 Flow 的引用方式

在 `nodes` 数组中，可以引用子 Flow：

```json
{
  "nodes": [
    {
      "id": "subflow1",
      "type": "SubFlow",
      "label": "子流程",
      "position": { "x": 200, "y": 200 },
      "ref": "sub-flow.json",
      "inputs": [
        { "name": "input", "type": "string" }
      ],
      "outputs": [
        { "name": "output", "type": "string" }
      ]
    }
  ]
}
```

- `ref`: 子 Flow 的文件路径，相对于项目 `flow/` 目录
- 子 Flow 的输入/输出端口由其内部的 SignalIn/SignalOut 节点定义

#### 子 Flow 的限制

- 不允许循环引用：Flow A 引用 Flow B，Flow B 不能直接或间接引用 Flow A
- 引擎在加载时会检测循环引用并报错

## State（状态管理）

State 是全局共享的键值存储，用于在 Flow 执行过程中保存和读取游戏状态。

### State 的结构

```typescript
interface StateStore {
  [key: string]: StateValue;
}

interface StateValue {
  type: string;    // 状态类型
  value: any;      // 状态值
}
```

### State 的类型系统

State 支持以下基础类型：

- `string`: 字符串
- `number`: 数字
- `boolean`: 布尔值
- `object`: 对象（任意 JSON 对象）
- `array`: 数组（任意 JSON 数组）

每个 State 键在声明时必须指定类型，运行时会进行类型检查。

### State 的初始化

项目根目录的 `initial_state.json` 定义游戏的初始状态：

```json
{
  "playerName": {
    "type": "string",
    "value": "Player"
  },
  "score": {
    "type": "number",
    "value": 0
  },
  "inventory": {
    "type": "array",
    "value": []
  },
  "gameConfig": {
    "type": "object",
    "value": {
      "difficulty": "normal",
      "language": "zh-CN"
    }
  }
}
```

### State 的操作

通过 State 管理类节点（AddState、RemoveState、ReadState、ModifyState）进行操作。

#### 操作规则

1. **AddState**：
   - 如果 key 已存在，操作失败
   - 必须指定 type 和 value

2. **RemoveState**：
   - 如果 key 不存在，操作失败

3. **ReadState**：
   - 如果 key 不存在，返回 `exists: false`

4. **ModifyState**：
   - 如果 key 不存在，操作失败
   - 新值的类型必须与声明的类型匹配

### State 的作用域

State 是全局共享的，所有 Flow 和 Node 都可以访问同一个 State Store。

## 类型系统总结

KAL 的类型系统贯穿 Handler 和 State：

| 类型 | Handler | State | 说明 |
|------|---------|-------|------|
| `string` | ✓ | ✓ | 字符串 |
| `number` | ✓ | ✓ | 数字 |
| `boolean` | ✓ | ✓ | 布尔值 |
| `object` | ✓ | ✓ | 任意 JSON 对象 |
| `array` | ✓ | ✓ | 任意 JSON 数组 |
| `ChatMessage[]` | ✓ | ✗ | LLM 消息数组（仅 Handler） |
| `ImageUrl` | ✓ | ✗ | 图像 URL（仅 Handler） |
| 自定义类型 | ✓ | ✗ | 用户通过 TS 定义（仅 Handler） |

## 错误处理

### Node 执行错误

当 Node 执行失败时：
1. 抛出异常，中断当前分支的执行
2. 错误信息会传递到引擎层
3. 其他独立分支继续执行

### 类型不匹配错误

在以下情况会触发类型检查错误：
1. 连接 Handler 时，输出类型与输入类型不匹配
2. ModifyState 时，新值类型与声明类型不匹配
3. 自定义 Node 返回的输出类型与声明不符

### 循环引用错误

引擎在加载 Flow 时会检测子 Flow 的循环引用，如果发现循环引用会立即报错并拒绝加载。

## 性能优化

### 并行执行

引擎会自动识别没有依赖关系的节点，并行执行以提高性能。

### 懒加载

子 Flow 在首次使用时才加载，避免不必要的文件读取。

### 状态缓存

State 的读取操作会缓存结果，减少重复访问的开销。
