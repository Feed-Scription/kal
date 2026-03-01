import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigLoader, FlowLoader, createKalCore } from '@kal-ai/core';
import type { ChatMessage } from '@kal-ai/core';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 1. 读取并解析引擎配置
const configJson = readFileSync(resolve(__dirname, 'kal_config.json'), 'utf-8');
const config = ConfigLoader.parse(configJson);

// 2. 读取初始状态
const initialStateJson = readFileSync(resolve(__dirname, 'initial_state.json'), 'utf-8');
const initialState = JSON.parse(initialStateJson);

// 3. 创建引擎实例（带 hooks）
const core = createKalCore({
  config,
  initialState,
  hooks: {
    onLLMResponse: (event) => {
      console.log(`  [tokens: ${event.usage.totalTokens}, 耗时: ${event.latencyMs}ms]`);
    },
  },
});

// 4. 读取并解析 Flow
const flowJson = readFileSync(resolve(__dirname, 'flow/main.json'), 'utf-8');
const flow = FlowLoader.parse(flowJson);

// 5. 对话历史
const history: ChatMessage[] = [];

// 6. 状态栏显示
function printStatusBar() {
  const state = core.state.getAll();
  const hp = state.health?.value ?? '?';
  const loc = state.currentLocation?.value ?? '?';
  const inv = Array.isArray(state.inventory?.value)
    ? state.inventory.value.join(', ')
    : '空';
  const gold = state.gold?.value ?? '?';
  console.log(`\n[HP:${hp} | 位置:${loc} | 背包:[${inv}] | 瓶盖:${gold}]`);
}

// 7. 详细状态
function printDetailedState() {
  const state = core.state.getAll();
  console.log('\n--- 详细状态 ---');
  for (const [key, val] of Object.entries(state)) {
    console.log(`  ${key} (${val.type}): ${JSON.stringify(val.value)}`);
  }
  console.log('----------------\n');
}

// 8. 应用状态变更
function applyStateChanges(changes: Record<string, any>) {
  for (const [key, newValue] of Object.entries(changes)) {
    if (core.state.has(key)) {
      const result = core.state.modify(key, newValue);
      if (!result.success) {
        console.error(`  状态更新失败 [${key}]: ${result.error?.message}`);
      }
    }
  }
}

// 9. 欢迎语
console.log('==========================================');
console.log('   ☢  废土求生 - KAL-AI 引擎  ☢');
console.log('==========================================');
console.log('2147年，核战后的废土世界。');
console.log('你是13号避难所的幸存者，今天，你第一次推开了那扇锈迹斑斑的大门...\n');
console.log('命令: /quit 退出, /state 查看详细状态\n');
printStatusBar();

// 10. REPL 循环
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

const prompt = () => rl.question('\n> ', async (input) => {
  const trimmed = input.trim();

  if (!trimmed) {
    prompt();
    return;
  }

  if (trimmed === '/quit') {
    console.log('\n愿废土对你仁慈一些...再见。');
    rl.close();
    return;
  }

  if (trimmed === '/state') {
    printDetailedState();
    prompt();
    return;
  }

  // 读取当前全部状态作为 gameState
  const gameState = core.state.getAll();

  // 执行 Flow
  const result = await core.executeFlow(flow, 'main', {
    playerInput: trimmed,
    gameState,
    history: [...history],
  });

  if (result.errors.length > 0) {
    console.error('\n执行出错:', result.errors[0]?.message);
    prompt();
    return;
  }

  // 尝试从 json-parse 节点获取结构化数据
  const jsonParseOutput = result.outputs['json-parse'];
  const rawText = result.outputs['generate-text']?.text as string | undefined;

  if (jsonParseOutput?.success && jsonParseOutput.data) {
    const { narrative, stateChanges } = jsonParseOutput.data as {
      narrative?: string;
      stateChanges?: Record<string, any>;
    };

    // 打印叙事
    if (narrative) {
      console.log(`\n${narrative}`);
    }

    // 应用状态变更
    if (stateChanges) {
      applyStateChanges(stateChanges);
    }

    // 追加历史（用 narrative 作为 assistant 回复）
    history.push({ role: 'user', content: trimmed });
    history.push({ role: 'assistant', content: narrative ?? rawText ?? '' });
  } else {
    // JSON 解析失败，fallback 显示原始文本
    if (rawText) {
      console.log(`\n${rawText}`);
    }
    history.push({ role: 'user', content: trimmed });
    history.push({ role: 'assistant', content: rawText ?? '' });
  }

  // 显示状态栏
  printStatusBar();

  // 检查死亡
  const hp = core.state.get('health');
  if (hp.exists && typeof hp.value?.value === 'number' && hp.value.value <= 0) {
    console.log('\n你倒在了废土之上...辐射尘埃覆盖了你的身体。游戏结束。');
    rl.close();
    return;
  }

  prompt();
});

prompt();
