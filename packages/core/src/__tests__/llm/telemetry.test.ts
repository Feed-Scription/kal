import { describe, it, expect, beforeEach } from 'vitest';
import { Telemetry } from '../../llm/telemetry';

describe('Telemetry', () => {
  let telemetry: Telemetry;

  beforeEach(() => {
    telemetry = new Telemetry();
  });

  it('应该记录成功的 LLM 调用', () => {
    telemetry.record({
      executionId: 'exec-1',
      nodeId: 'node-1',
      model: 'gpt-4',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      latencyMs: 1234,
      cached: false,
    });

    const records = telemetry.getRecords();
    expect(records).toHaveLength(1);
    expect(records[0]!.success).toBe(true);
    expect(records[0]!.model).toBe('gpt-4');
    expect(records[0]!.totalTokens).toBe(150);
    expect(records[0]!.latencyMs).toBe(1234);
  });

  it('应该记录失败的 LLM 调用', () => {
    telemetry.recordError({
      executionId: 'exec-1',
      nodeId: 'node-1',
      model: 'gpt-4',
      latencyMs: 500,
      error: 'API error',
    });

    const records = telemetry.getRecords();
    expect(records).toHaveLength(1);
    expect(records[0]!.success).toBe(false);
    expect(records[0]!.error).toBe('API error');
  });

  it('应该按 executionId 过滤记录', () => {
    telemetry.record({
      executionId: 'exec-1',
      nodeId: 'node-1',
      model: 'gpt-4',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      latencyMs: 100,
      cached: false,
    });
    telemetry.record({
      executionId: 'exec-2',
      nodeId: 'node-2',
      model: 'gpt-4',
      usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
      latencyMs: 200,
      cached: false,
    });

    const filtered = telemetry.getByExecutionId('exec-1');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.nodeId).toBe('node-1');
  });

  it('应该导出为 JSONL 格式', () => {
    telemetry.record({
      executionId: 'exec-1',
      nodeId: 'node-1',
      model: 'gpt-4',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      latencyMs: 100,
      cached: false,
    });

    const jsonl = telemetry.toJsonl();
    const parsed = JSON.parse(jsonl);
    expect(parsed.executionId).toBe('exec-1');
    expect(parsed.success).toBe(true);
  });

  it('应该能清空记录', () => {
    telemetry.record({
      executionId: 'exec-1',
      nodeId: 'node-1',
      model: 'gpt-4',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      latencyMs: 100,
      cached: false,
    });

    telemetry.clear();
    expect(telemetry.getRecords()).toHaveLength(0);
  });

  it('记录应该包含 ISO 时间戳', () => {
    telemetry.record({
      executionId: 'exec-1',
      nodeId: 'node-1',
      model: 'gpt-4',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      latencyMs: 100,
      cached: false,
    });

    const records = telemetry.getRecords();
    expect(records[0]!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
