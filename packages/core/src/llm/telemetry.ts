/**
 * Telemetry for LLM calls
 */

import type { TokenUsage } from '../types/types';

/**
 * Telemetry record for a single LLM call
 */
export interface TelemetryRecord {
  timestamp: string;
  executionId: string;
  nodeId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  cached: boolean;
  success: boolean;
  error?: string;
}

/**
 * Telemetry collector
 */
export class Telemetry {
  private records: TelemetryRecord[] = [];
  private maxEntries: number;

  constructor(maxEntries: number = 1000) {
    this.maxEntries = maxEntries;
  }

  /**
   * Record a successful LLM call
   */
  record(params: {
    executionId: string;
    nodeId: string;
    model: string;
    usage: TokenUsage;
    latencyMs: number;
    cached: boolean;
  }): void {
    this.records.push({
      timestamp: new Date().toISOString(),
      executionId: params.executionId,
      nodeId: params.nodeId,
      model: params.model,
      promptTokens: params.usage.promptTokens,
      completionTokens: params.usage.completionTokens,
      totalTokens: params.usage.totalTokens,
      latencyMs: params.latencyMs,
      cached: params.cached,
      success: true,
    });

    // LRU eviction: remove oldest if at capacity
    if (this.records.length > this.maxEntries) {
      this.records.shift();
    }
  }

  /**
   * Record a failed LLM call
   */
  recordError(params: {
    executionId: string;
    nodeId: string;
    model: string;
    latencyMs: number;
    error: string;
  }): void {
    this.records.push({
      timestamp: new Date().toISOString(),
      executionId: params.executionId,
      nodeId: params.nodeId,
      model: params.model,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      latencyMs: params.latencyMs,
      cached: false,
      success: false,
      error: params.error,
    });

    // LRU eviction: remove oldest if at capacity
    if (this.records.length > this.maxEntries) {
      this.records.shift();
    }
  }

  /**
   * Get all records
   */
  getRecords(): TelemetryRecord[] {
    return [...this.records];
  }

  /**
   * Get records by execution ID
   */
  getByExecutionId(executionId: string): TelemetryRecord[] {
    return this.records.filter((r) => r.executionId === executionId);
  }

  /**
   * Clear records by execution ID
   */
  clearByExecutionId(executionId: string): void {
    this.records = this.records.filter((r) => r.executionId !== executionId);
  }

  /**
   * Clear all records
   */
  clear(): void {
    this.records = [];
  }

  /**
   * Export records as JSONL string
   */
  toJsonl(): string {
    return this.records.map((r) => JSON.stringify(r)).join('\n');
  }
}
