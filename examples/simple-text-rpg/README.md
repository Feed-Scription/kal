# Simple Text RPG Example

这是一个使用 KAL-AI Core 引擎构建的简单文本 RPG 游戏示例。

## 项目结构

```
simple-text-rpg/
├── kal_config.json       # 引擎配置
├── initial_state.json    # 初始游戏状态
├── flow/                 # Flow 定义
│   └── main.json
└── node/                 # 自定义节点（可选）
```

## 运行示例

```bash
# 设置环境变量
export OPENAI_API_KEY=your-api-key

# 使用 @kal-ai/core 运行
node -e "
const { createKalCore, ConfigLoader, FlowLoader } = require('@kal-ai/core');
const fs = require('fs');

const configJson = fs.readFileSync('./kal_config.json', 'utf-8');
const config = ConfigLoader.parse(configJson);

const initialStateJson = fs.readFileSync('./initial_state.json', 'utf-8');
const initialState = JSON.parse(initialStateJson);

const core = createKalCore({ config, initialState });

const flowJson = fs.readFileSync('./flow/main.json', 'utf-8');
const flow = FlowLoader.parse(flowJson);

core.executeFlow(flow, 'main', { playerInput: 'Look around' })
  .then(result => console.log('Result:', result))
  .catch(err => console.error('Error:', err));
"
```

## Flow 说明

主 Flow (`flow/main.json`) 实现了一个简单的游戏循环：

1. **SignalIn** - 接收玩家输入
2. **ReadState** - 读取玩家状态
3. **PromptBuild** - 构建 AI Prompt
4. **Message** - 组装消息
5. **GenerateText** - 调用 LLM 生成回复
6. **SignalOut** - 输出结果

## 扩展

你可以通过以下方式扩展这个示例：

1. 添加更多状态管理节点（ModifyState, AddState）
2. 使用 JSONParse 解析 LLM 输出的结构化数据
3. 创建自定义节点实现游戏逻辑
4. 使用子 Flow 实现复杂的游戏场景
