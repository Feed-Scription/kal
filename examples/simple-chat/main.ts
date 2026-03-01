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

// 2. 创建引擎实例
const core = createKalCore({ config });

// 3. 读取并解析 Flow 定义
const flowJson = readFileSync(resolve(__dirname, 'flow/chat.json'), 'utf-8');
const flow = FlowLoader.parse(flowJson);

// 4. 交互式多轮对话
const history: ChatMessage[] = [];

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log('简单对话示例 (输入 /quit 退出)\n');

const prompt = () => rl.question('你: ', async (userMessage) => {
  const trimmed = userMessage.trim();
  if (!trimmed || trimmed === '/quit') {
    console.log('再见！');
    rl.close();
    return;
  }

  const result = await core.executeFlow(flow, 'chat', {
    userMessage: trimmed,
    history: [...history],
  });

  if (result.errors.length > 0) {
    console.error('执行出错:', result.errors[0]?.message);
    prompt();
    return;
  }

  const reply = result.outputs['signal-out']?.data as string;
  console.log(`助手: ${reply}\n`);

  // 追加到历史
  history.push({ role: 'user', content: trimmed });
  history.push({ role: 'assistant', content: reply });

  prompt();
});

prompt();
