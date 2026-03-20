/**
 * TUI output renderer — renders flow execution results to terminal
 */

import type { StateValue } from '@kal-ai/core';

// ANSI color helpers
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

export interface OutputViewModel {
  primaryText?: string;
  stateChanges: Array<{ key: string; value: unknown }>;
  fallback?: string;
}

export interface StateRow {
  key: string;
  type: string;
  value: unknown;
}

function unwrapOutput(outputs: Record<string, any>): unknown {
  const keys = Object.keys(outputs);
  return keys.length === 1 ? outputs[keys[0]!] : outputs;
}

export function formatStateValueText(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => formatStateValueText(item)).join(', ')}]`;
  }
  if (value && typeof value === 'object') {
    return JSON.stringify(value) ?? String(value);
  }
  return String(value);
}

export function createOutputViewModel(outputs: Record<string, any>): OutputViewModel {
  const data = unwrapOutput(outputs);

  if (typeof data === 'string') {
    return {
      primaryText: data,
      stateChanges: [],
    };
  }

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const outputRecord = data as {
      narrative?: unknown;
      stateChanges?: unknown;
    };
    const primaryText = typeof outputRecord.narrative === 'string' ? outputRecord.narrative : undefined;
    const stateChanges = outputRecord.stateChanges && typeof outputRecord.stateChanges === 'object'
      ? Object.entries(outputRecord.stateChanges).map(([key, value]) => ({ key, value }))
      : [];

    if (primaryText || stateChanges.length > 0) {
      return {
        primaryText,
        stateChanges,
      };
    }

    return {
      stateChanges: [],
      fallback: JSON.stringify(data, null, 2),
    };
  }

  return {
    primaryText: String(data),
    stateChanges: [],
  };
}

export function createStateRows(state: Record<string, StateValue>): StateRow[] {
  return Object.entries(state).map(([key, stateValue]) => ({
    key,
    type: stateValue.type,
    value: stateValue.value,
  }));
}

export function renderOutput(outputs: Record<string, any>): string {
  const viewModel = createOutputViewModel(outputs);
  const parts: string[] = [];

  if (viewModel.primaryText) {
    parts.push(viewModel.primaryText);
  }

  if (viewModel.stateChanges.length > 0) {
    const changes = viewModel.stateChanges
      .map(({ key, value }) => `  ${c.dim}${key}${c.reset}: ${formatStateValue(value)}`)
      .join('\n');
    parts.push(`\n${c.gray}── 状态变化 ──${c.reset}\n${changes}`);
  }

  if (parts.length > 0) {
    return parts.join('\n');
  }

  return viewModel.fallback ?? '';
}

function formatStateValue(value: unknown): string {
  if (typeof value === 'number') {
    return `${c.yellow}${value}${c.reset}`;
  }
  if (typeof value === 'string') {
    return `${c.cyan}${value}${c.reset}`;
  }
  if (Array.isArray(value)) {
    return `${c.dim}[${value.join(', ')}]${c.reset}`;
  }
  return formatStateValueText(value);
}

export function renderStateTable(state: Record<string, StateValue>): string {
  const rows = createStateRows(state);
  if (rows.length === 0) {
    return `${c.dim}(空)${c.reset}`;
  }

  const lines = rows.map((row) => {
    const label = `${c.bold}${row.key}${c.reset}`;
    const type = `${c.dim}(${row.type})${c.reset}`;
    const val = formatStateValue(row.value);
    return `  ${label} ${type}: ${val}`;
  });

  return `${c.gray}── 当前状态 ──${c.reset}\n${lines.join('\n')}`;
}

export function renderWelcome(name: string, description?: string, flowId?: string): string {
  const parts = [
    `${c.bold}${c.cyan}KAL-AI Play${c.reset} — ${name}`,
  ];
  if (description) {
    parts.push(`${c.dim}${description}${c.reset}`);
  }
  if (flowId) {
    parts.push(`${c.dim}Flow: ${flowId}${c.reset}`);
  }
  parts.push(`${c.dim}输入 /help 查看命令, /quit 退出${c.reset}`);
  parts.push('');
  return parts.join('\n');
}

export function renderHelp(): string {
  return [
    `${c.bold}可用命令:${c.reset}`,
    `  ${c.cyan}/quit${c.reset}    退出游戏`,
    `  ${c.cyan}/state${c.reset}   查看当前状态`,
    `  ${c.cyan}/help${c.reset}    显示此帮助`,
    '',
  ].join('\n');
}

export function renderError(message: string): string {
  return `${c.red}错误: ${message}${c.reset}`;
}
