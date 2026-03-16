/**
 * Real LLM dogfooding test for managed run runtime.
 *
 * Exercises the full managed run lifecycle with a real LLM call
 * through OpenRouter (Message → GenerateText flow).
 *
 * Skipped when OPENAI_API_KEY is not available in the environment.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FlowDefinition, SessionDefinition } from '@kal-ai/core';
import { EngineRuntime } from './runtime';
import { startEngineServer } from './server';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()!();
  }
});

function createLLMFlow(): FlowDefinition {
  return {
    meta: {
      schemaVersion: '1.0.0',
      inputs: [{ name: 'message', type: 'string', required: true }],
      outputs: [{ name: 'reply', type: 'string' }],
    },
    data: {
      nodes: [
        {
          id: 'signal-in',
          type: 'SignalIn',
          inputs: [],
          outputs: [{ name: 'data', type: 'string' }],
          config: { channel: 'message' },
        },
        {
          id: 'msg',
          type: 'Message',
          inputs: [
            { name: 'system', type: 'string' },
            { name: 'context', type: 'string' },
            { name: 'user', type: 'string' },
          ],
          outputs: [{ name: 'messages', type: 'ChatMessage[]' }],
          config: { format: 'xml', historyKey: '' },
        },
        {
          id: 'gen',
          type: 'GenerateText',
          inputs: [{ name: 'messages', type: 'ChatMessage[]', required: true }],
          outputs: [
            { name: 'text', type: 'string' },
            { name: 'usage', type: 'object' },
          ],
          config: {
            model: 'deepseek/deepseek-chat',
            temperature: 0,
            maxTokens: 60,
            historyKey: '',
          },
        },
        {
          id: 'signal-out',
          type: 'SignalOut',
          inputs: [{ name: 'data', type: 'string' }],
          outputs: [{ name: 'data', type: 'string' }],
          config: { channel: 'reply' },
        },
      ],
      edges: [
        { source: 'signal-in', sourceHandle: 'data', target: 'msg', targetHandle: 'user' },
        { source: 'msg', sourceHandle: 'messages', target: 'gen', targetHandle: 'messages' },
        { source: 'gen', sourceHandle: 'text', target: 'signal-out', targetHandle: 'data' },
      ],
    },
  };
}

function createStateMutationFlow(): FlowDefinition {
  return {
    meta: { schemaVersion: '1.0.0' },
    data: {
      nodes: [
        {
          id: 'add-state',
          type: 'AddState',
          inputs: [
            { name: 'key', type: 'string', required: true, defaultValue: 'game_started' },
            { name: 'type', type: 'string', required: true, defaultValue: 'boolean' },
            { name: 'value', type: 'any', required: true, defaultValue: true },
          ],
          outputs: [{ name: 'success', type: 'boolean' }],
        },
      ],
      edges: [],
    },
  };
}

async function createLLMProject(): Promise<{ projectRoot: string; cleanup(): Promise<void> }> {
  const projectRoot = await mkdtemp(join(tmpdir(), 'kal-llm-dogfood-'));
  await mkdir(join(projectRoot, 'flow'), { recursive: true });

  const config = {
    name: 'llm-dogfood',
    version: '1.0.0',
    engine: { logLevel: 'error', maxConcurrentFlows: 4, timeout: 30000 },
    llm: {
      provider: 'openai',
      apiKey: '${OPENAI_API_KEY}',
      defaultModel: 'deepseek/deepseek-chat',
      baseUrl: '${OPENAI_BASE_URL}',
      retry: { maxRetries: 0, initialDelayMs: 0, maxDelayMs: 0, backoffMultiplier: 2, jitter: false },
      cache: { enabled: false },
    },
  };

  const session: SessionDefinition = {
    schemaVersion: '1.0.0',
    steps: [
      { id: 'intro', type: 'RunFlow', flowRef: 'intro', next: 'turn' },
      { id: 'turn', type: 'Prompt', promptText: '请输入：', flowRef: 'llm', inputChannel: 'message', next: 'end' },
      { id: 'end', type: 'End', message: '对话结束' },
    ],
  };

  await writeFile(join(projectRoot, 'kal_config.json'), JSON.stringify(config, null, 2), 'utf8');
  await writeFile(join(projectRoot, 'initial_state.json'), '{}', 'utf8');
  await writeFile(join(projectRoot, 'flow', 'llm.json'), JSON.stringify(createLLMFlow(), null, 2), 'utf8');
  await writeFile(join(projectRoot, 'flow', 'intro.json'), JSON.stringify(createStateMutationFlow(), null, 2), 'utf8');
  await writeFile(join(projectRoot, 'session.json'), JSON.stringify(session, null, 2), 'utf8');

  return {
    projectRoot,
    async cleanup() {
      await rm(projectRoot, { recursive: true, force: true });
    },
  };
}

function ensureApiKeys(): boolean {
  // bridgeUserConfigToEnv() runs inside EngineRuntime.create(), but we need
  // the key available earlier for the skip check.  Trigger it manually.
  try {
    const { ConfigManager } = require('@kal-ai/core');
    const cm = new ConfigManager();
    const cfg = cm.loadConfig();
    if (cfg.openai?.apiKey && !process.env.OPENAI_API_KEY) {
      process.env.OPENAI_API_KEY = cfg.openai.apiKey;
    }
    if (cfg.openai?.baseUrl && !process.env.OPENAI_BASE_URL) {
      process.env.OPENAI_BASE_URL = cfg.openai.baseUrl;
    }
  } catch { /* no .kal dir — that's fine */ }

  return !!process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.startsWith('test-');
}

const HAS_REAL_KEY = ensureApiKeys();

describe('Dogfooding: real LLM call', () => {
  it.skipIf(!HAS_REAL_KEY)(
    '完整 managed run 生命周期 + 真实 LLM 调用',
    async () => {
      const fixture = await createLLMProject();
      cleanups.push(fixture.cleanup);

      const runtime = await EngineRuntime.create(fixture.projectRoot);
      const server = await startEngineServer({ runtime, host: '127.0.0.1', port: 0 });
      cleanups.push(server.close);

      // 1. Create run → should execute intro flow and pause at prompt
      const created = await fetch(`${server.url}/api/runs`, { method: 'POST' }).then(r => r.json());
      expect(created.success).toBe(true);
      expect(created.data.run.status).toBe('waiting_input');
      expect(created.data.run.waiting_for).toMatchObject({ kind: 'prompt', step_id: 'turn' });
      expect(created.data.run.state_summary.changed_values).toHaveProperty('game_started');

      const runId = created.data.run.run_id;

      // 2. Check state
      const state = await fetch(`${server.url}/api/runs/${runId}/state`).then(r => r.json());
      expect(state.data.run.state.game_started.value).toBe(true);

      // 3. Advance with real LLM input
      const startMs = Date.now();
      const advanced = await fetch(`${server.url}/api/runs/${runId}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: 'Say "hello world" and nothing else.' }),
      }).then(r => r.json());
      const elapsedMs = Date.now() - startMs;

      expect(advanced.success).toBe(true);
      expect(advanced.data.run.status).toBe('ended');

      // Verify LLM actually responded
      const outputEvent = advanced.data.run.recent_events.find((e: any) => e.type === 'output');
      expect(outputEvent).toBeDefined();
      expect(typeof outputEvent.raw.reply).toBe('string');
      expect(outputEvent.raw.reply.length).toBeGreaterThan(0);
      console.log(`  LLM reply (${elapsedMs}ms): ${outputEvent.raw.reply}`);

      // Verify end event
      const endEvent = advanced.data.run.recent_events.find((e: any) => e.type === 'end');
      expect(endEvent).toEqual({ type: 'end', message: '对话结束' });

      // 4. Verify run list — ended run should not be active
      const listed = await fetch(`${server.url}/api/runs`).then(r => r.json());
      expect(listed.data.runs.length).toBe(1);
      expect(listed.data.runs[0].active).toBe(false);
    },
    30000, // 30s timeout for LLM call
  );
});
