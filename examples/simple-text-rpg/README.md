# Simple Text RPG

使用 KAL-AI Core 引擎构建的交互式文字冒险 RPG。

## 项目结构

```
simple-text-rpg/
├── kal_config.json       # 引擎配置
├── initial_state.json    # 初始游戏状态
├── flow/
│   └── main.json         # 游戏循环 Flow
├── main.ts               # 交互式 REPL 入口
├── package.json
└── tsconfig.json
```

## 运行

```bash
# 设置环境变量
export OPENAI_API_KEY=your-api-key
export OPENAI_BASE_URL=https://api.openai.com/v1  # 可选，自定义 API 地址

# 安装依赖
bun install

# 启动游戏
bun run examples/simple-text-rpg/main.ts
```

## 游戏命令

- 直接输入动作（如"看看四周"、"去森林"、"捡起火把"）
- `/state` — 查看详细游戏状态
- `/quit` — 退出游戏

## Flow 说明

主 Flow (`flow/main.json`) 实现了完整的游戏循环：

1. **SignalIn** — 接收玩家输入、游戏状态、对话历史
2. **PromptBuild** — 用 fragment 系统组装 system prompt（GM 设定 + 当前状态 + JSON 输出格式）
3. **Message** — 组装 system/user/history 消息
4. **GenerateText** — 调用 LLM 生成回复
5. **JSONParse** — 解析 LLM 返回的结构化 JSON（带容错）
6. **SignalOut** — 输出结果

## Core 能力使用

- ConfigLoader + 环境变量替换
- StateStore（getAll / modify）管理游戏状态
- FlowLoader + FlowExecutor 执行游戏循环
- PromptBuild fragment 系统（base + field）声明式组装 prompt
- Message + history 多轮对话记忆
- JSONParse + repairJson 容错解析
- Hooks（onLLMResponse）监听 token 用量
