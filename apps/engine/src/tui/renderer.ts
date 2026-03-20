/**
 * TUI output renderer — renders flow execution results to terminal
 */

import type { StateValue } from '@kal-ai/core';
import { t, type TuiLocale } from './i18n';

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
  let data = unwrapOutput(outputs);

  // LLM nodes often output structured data as a JSON string — try to parse it
  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        data = JSON.parse(trimmed);
      } catch {
        // not valid JSON, treat as plain text below
      }
    }
  }

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

export function renderOutput(outputs: Record<string, any>, locale: TuiLocale = 'en'): string {
  const viewModel = createOutputViewModel(outputs);
  const parts: string[] = [];

  if (viewModel.primaryText) {
    parts.push(viewModel.primaryText);
  }

  if (viewModel.stateChanges.length > 0) {
    const changes = viewModel.stateChanges
      .map(({ key, value }) => `  ${c.dim}${key}${c.reset}: ${formatStateValue(value)}`)
      .join('\n');
    parts.push(`\n${c.gray}${t(locale, 'render.stateChanges')}${c.reset}\n${changes}`);
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

export function renderStateTable(state: Record<string, StateValue>, locale: TuiLocale = 'en'): string {
  const rows = createStateRows(state);
  if (rows.length === 0) {
    return `${c.dim}${t(locale, 'ui.empty')}${c.reset}`;
  }

  const lines = rows.map((row) => {
    const label = `${c.bold}${row.key}${c.reset}`;
    const type = `${c.dim}(${row.type})${c.reset}`;
    const val = formatStateValue(row.value);
    return `  ${label} ${type}: ${val}`;
  });

  return `${c.gray}${t(locale, 'render.currentState')}${c.reset}\n${lines.join('\n')}`;
}

export function renderWelcome(name: string, description?: string, flowId?: string, locale: TuiLocale = 'en'): string {
  const parts = [
    `${c.bold}${c.cyan}KAL-AI Play${c.reset} — ${name}`,
  ];
  if (description) {
    parts.push(`${c.dim}${description}${c.reset}`);
  }
  if (flowId) {
    parts.push(`${c.dim}Flow: ${flowId}${c.reset}`);
  }
  parts.push(`${c.dim}${t(locale, 'render.welcomeHint')}${c.reset}`);
  parts.push('');
  return parts.join('\n');
}

export function renderHelp(locale: TuiLocale = 'en'): string {
  return [
    `${c.bold}${t(locale, 'render.commands')}${c.reset}`,
    `  ${c.cyan}/quit${c.reset}    ${t(locale, 'render.cmdQuit')}`,
    `  ${c.cyan}/state${c.reset}   ${t(locale, 'render.cmdState')}`,
    `  ${c.cyan}/help${c.reset}    ${t(locale, 'render.cmdHelp')}`,
    '',
  ].join('\n');
}

export function renderError(message: string, locale: TuiLocale = 'en'): string {
  return `${c.red}${t(locale, 'render.error', { message })}${c.reset}`;
}
