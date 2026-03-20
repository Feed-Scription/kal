/**
 * TUI launcher — Ink UI for interactive terminals with a legacy fallback.
 */

import type { EngineRuntime } from '../runtime';
import { render } from 'ink';
import { createElement } from 'react';
import { InkTuiApp } from './ink-app';
import { runLegacyTui } from './legacy-tui';

export interface TuiOptions {
  runtime: EngineRuntime;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

export async function runTui(options: TuiOptions): Promise<void> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  if (!isInteractiveStream(input) || !isInteractiveStream(output)) {
    await runLegacyTui(options);
    return;
  }

  const instance = render(
    createElement(InkTuiApp, { runtime: options.runtime }),
    {
      stdin: input as any,
      stdout: output as any,
      exitOnCtrlC: false,
    },
  );

  await instance.waitUntilExit();
}

function isInteractiveStream(stream: NodeJS.ReadableStream | NodeJS.WritableStream): stream is (NodeJS.ReadableStream | NodeJS.WritableStream) & { isTTY: true } {
  return 'isTTY' in stream && stream.isTTY === true;
}
