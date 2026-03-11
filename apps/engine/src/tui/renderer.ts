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

export function renderOutput(outputs: Record<string, any>): string {
  // Unwrap single-key output
  const keys = Object.keys(outputs);
  const data = keys.length === 1 ? outputs[keys[0]!] : outputs;

  if (typeof data === 'string') {
    return data;
  }

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const parts: string[] = [];

    // Render narrative
    if (typeof data.narrative === 'string') {
      parts.push(data.narrative);
    }

    // Render state changes summary
    if (data.stateChanges && typeof data.stateChanges === 'object') {
      const changes = Object.entries(data.stateChanges)
        .map(([k, v]) => `  ${c.dim}${k}${c.reset}: ${formatStateValue(v)}`)
        .join('\n');
      if (changes) {
        parts.push(`\n${c.gray}── 状态变化 ──${c.reset}\n${changes}`);
      }
    }

    if (parts.length > 0) {
      return parts.join('\n');
    }

    // Fallback: formatted JSON
    return JSON.stringify(data, null, 2);
  }

  return String(data);
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
  return String(value);
}

export function renderStateTable(state: Record<string, StateValue>): string {
  const entries = Object.entries(state);
  if (entries.length === 0) {
    return `${c.dim}(空)${c.reset}`;
  }

  const lines = entries.map(([key, sv]) => {
    const label = `${c.bold}${key}${c.reset}`;
    const type = `${c.dim}(${sv.type})${c.reset}`;
    const val = formatStateValue(sv.value);
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
