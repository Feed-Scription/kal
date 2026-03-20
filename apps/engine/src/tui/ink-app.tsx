import type { SessionEvent, StateValue } from '@kal-ai/core';
import { Box, Static, Text, useApp, useInput } from 'ink';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EngineRuntime } from '../runtime';
import { resolveBuiltinCommand, resolveChoiceSubmission } from './controls';
import {
  createOutputViewModel,
  createStateRows,
  formatStateValueText,
} from './renderer';

type TuiRuntime = Pick<EngineRuntime, 'createSession' | 'getProjectInfo' | 'getSession' | 'getState'>;

type LogEntry =
  | { id: number; kind: 'welcome'; name: string; description?: string }
  | { id: number; kind: 'input'; title: string; body: string }
  | { id: number; kind: 'output'; title: string; primaryText?: string; stateChanges: Array<{ key: string; value: unknown }>; fallback?: string }
  | { id: number; kind: 'state'; title: string; state: Record<string, StateValue> }
  | { id: number; kind: 'help' }
  | { id: number; kind: 'system'; title: string; body: string }
  | { id: number; kind: 'error'; message: string }
  | { id: number; kind: 'end'; message?: string };

type LogEntryInput =
  | { kind: 'welcome'; name: string; description?: string }
  | { kind: 'input'; title: string; body: string }
  | { kind: 'output'; title: string; primaryText?: string; stateChanges: Array<{ key: string; value: unknown }>; fallback?: string }
  | { kind: 'state'; title: string; state: Record<string, StateValue> }
  | { kind: 'help' }
  | { kind: 'system'; title: string; body: string }
  | { kind: 'error'; message: string }
  | { kind: 'end'; message?: string };

type WaitingState =
  | { kind: 'prompt'; stepId: string; promptText?: string }
  | { kind: 'choice'; stepId: string; promptText?: string; options: Array<{ label: string; value: string }> };

export interface InkTuiAppProps {
  runtime: TuiRuntime;
  autoExit?: boolean;
}

const helpLines = [
  '/help  查看帮助',
  '/state 查看当前状态',
  '/quit  退出游戏',
];

const generationFrames = ['|', '/', '-', '\\'];

function cloneState(state: Record<string, StateValue>): Record<string, StateValue> {
  if (typeof structuredClone === 'function') {
    return structuredClone(state);
  }

  return JSON.parse(JSON.stringify(state)) as Record<string, StateValue>;
}

export function getFooterHint(waiting: WaitingState | null): string {
  if (!waiting) {
    return '会话已结束';
  }

  if (waiting.kind === 'prompt') {
    return '输入文本后回车，支持 /help /state /quit';
  }

  return '方向键选择并回车，或直接输入数字；支持 /help /state /quit';
}

export function getGenerationStatus(frame: number): { hint: string; body: string } {
  const indicator = generationFrames[frame % generationFrames.length] ?? generationFrames[0]!;
  return {
    hint: `正在生成中 ${indicator}`,
    body: `请稍候，正在生成下一段内容 ${indicator}`,
  };
}

export function createPlayerInputEntry(
  waiting: WaitingState,
  submittedText: string,
): LogEntryInput {
  const title = waiting.promptText ?? (waiting.kind === 'choice' ? '你的选择' : '你的输入');
  return {
    kind: 'input',
    title,
    body: submittedText,
  };
}

function beginGenerationState(setWaiting: (value: WaitingState | null) => void, setInputValue: (value: string) => void, setIsBusy: (value: boolean) => void): void {
  setWaiting(null);
  setInputValue('');
  setIsBusy(true);
}

export function InkTuiApp({ runtime, autoExit = true }: InkTuiAppProps) {
  const { exit } = useApp();
  const generatorRef = useRef(runtime.createSession());
  const nextEntryIdRef = useRef(1);
  const pumpingRef = useRef(false);
  const mountedRef = useRef(true);

  const projectInfo = runtime.getProjectInfo();
  const session = runtime.getSession()!;

  const [entries, setEntries] = useState<LogEntry[]>([
    {
      id: 0,
      kind: 'welcome',
      name: projectInfo.name,
      description: session.description ?? session.name,
    },
  ]);
  const [waiting, setWaiting] = useState<WaitingState | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [selectedChoiceIndex, setSelectedChoiceIndex] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [busyFrame, setBusyFrame] = useState(0);
  const [shouldExit, setShouldExit] = useState(false);

  const appendEntry = useCallback((entry: LogEntryInput) => {
    if (!mountedRef.current) return;
    setEntries((current) => [...current, { id: nextEntryIdRef.current++, ...entry }]);
  }, []);

  const finishSession = useCallback((entry: LogEntryInput) => {
    appendEntry(entry);
    if (mountedRef.current) {
      setWaiting(null);
      setInputValue('');
      setIsBusy(false);
      if (autoExit) {
        setShouldExit(true);
      }
    }
  }, [appendEntry, autoExit]);

  const processCommand = useCallback(async (command: string): Promise<boolean> => {
    const action = resolveBuiltinCommand(command);
    if (action === 'help') {
      appendEntry({ kind: 'help' });
      setInputValue('');
      return true;
    }

    if (action === 'state') {
      appendEntry({
        kind: 'state',
        title: '当前状态',
        state: cloneState(runtime.getState()),
      });
      setInputValue('');
      return true;
    }

    if (action === 'quit') {
      appendEntry({
        kind: 'system',
        title: '会话结束',
        body: '再见!',
      });
      setWaiting(null);
      setInputValue('');
      try {
        await generatorRef.current.return(undefined);
      } finally {
        if (autoExit) {
          setShouldExit(true);
        }
      }
      return true;
    }

    return false;
  }, [appendEntry, autoExit, runtime]);

  const pump = useCallback(async (userInput?: string) => {
    if (pumpingRef.current) {
      return;
    }

    pumpingRef.current = true;
    if (mountedRef.current) {
      setIsBusy(true);
    }

    try {
      let result = await generatorRef.current.next(userInput);

      while (!result.done) {
        const event: SessionEvent = result.value;

        if (event.type === 'output') {
          if (event.data && Object.keys(event.data).length > 0) {
            const viewModel = createOutputViewModel(event.data);
            appendEntry({
              kind: 'output',
              title: event.stepId,
              primaryText: viewModel.primaryText,
              stateChanges: viewModel.stateChanges,
              fallback: viewModel.fallback,
            });
          }
          result = await generatorRef.current.next(undefined);
          continue;
        }

        if (event.type === 'prompt') {
          if (mountedRef.current) {
            setWaiting({
              kind: 'prompt',
              stepId: event.stepId,
              promptText: event.promptText,
            });
            setInputValue('');
            setSelectedChoiceIndex(0);
            setIsBusy(false);
          }
          return;
        }

        if (event.type === 'choice') {
          if (mountedRef.current) {
            setWaiting({
              kind: 'choice',
              stepId: event.stepId,
              promptText: event.promptText,
              options: event.options,
            });
            setInputValue('');
            setSelectedChoiceIndex(0);
            setIsBusy(false);
          }
          return;
        }

        if (event.type === 'error') {
          finishSession({
            kind: 'error',
            message: event.message,
          });
          return;
        }

        finishSession({
          kind: 'end',
          message: event.message,
        });
        return;
      }

      if (mountedRef.current) {
        setWaiting(null);
        setIsBusy(false);
      }
    } finally {
      pumpingRef.current = false;
      if (mountedRef.current) {
        setIsBusy(false);
      }
    }
  }, [appendEntry, finishSession]);

  const submitCurrentInput = useCallback(async () => {
    if (!waiting) {
      return;
    }

    const trimmed = inputValue.trim();
    if (await processCommand(trimmed)) {
      return;
    }

    if (waiting.kind === 'prompt') {
      if (!trimmed) {
        return;
      }
      appendEntry(createPlayerInputEntry(waiting, trimmed));
      beginGenerationState(setWaiting, setInputValue, setIsBusy);
      await pump(trimmed);
      return;
    }

    const resolution = resolveChoiceSubmission(trimmed, waiting.options, selectedChoiceIndex);
    if (resolution.kind === 'command') {
      await processCommand(trimmed);
      return;
    }
    if (resolution.kind === 'noop') {
      return;
    }
    if (resolution.kind === 'submit') {
      // Choice history prefers the visible label so the transcript reads like dialogue,
      // instead of logging the raw numeric shortcut the player typed.
      const selectedLabel = waiting.options.find((option) => option.value === resolution.value)?.label ?? resolution.value;
      appendEntry(createPlayerInputEntry(waiting, selectedLabel));
      beginGenerationState(setWaiting, setInputValue, setIsBusy);
      await pump(resolution.value);
      return;
    }

    appendEntry({
      kind: 'system',
      title: '输入无效',
      body: `请选择 1-${waiting.options.length} 之间的数字，或使用方向键后按 Enter`,
    });
    setInputValue('');
  }, [appendEntry, inputValue, processCommand, pump, selectedChoiceIndex, waiting]);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      void processCommand('/quit');
      return;
    }

    if (!waiting || isBusy) {
      return;
    }

    if (waiting.kind === 'choice' && inputValue.length === 0) {
      if (key.upArrow) {
        setSelectedChoiceIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedChoiceIndex((current) => Math.min(waiting.options.length - 1, current + 1));
        return;
      }
    }

    if (key.return) {
      void submitCurrentInput();
      return;
    }

    if (key.backspace || key.delete) {
      setInputValue((current) => current.slice(0, -1));
      return;
    }

    if (key.escape) {
      setInputValue('');
      return;
    }

    if (!key.ctrl && !key.meta && input) {
      setInputValue((current) => current + input);
    }
  }, { isActive: true });

  useEffect(() => {
    mountedRef.current = true;
    void pump();

    return () => {
      mountedRef.current = false;
      void generatorRef.current.return(undefined);
    };
  }, [pump]);

  useEffect(() => {
    if (!shouldExit) {
      return;
    }

    const timer = setTimeout(() => exit(), 10);
    return () => clearTimeout(timer);
  }, [exit, shouldExit]);

  useEffect(() => {
    if (!isBusy) {
      setBusyFrame(0);
      return;
    }

    const timer = setInterval(() => {
      setBusyFrame((current) => (current + 1) % generationFrames.length);
    }, 120);

    return () => clearInterval(timer);
  }, [isBusy]);

  const generationStatus = useMemo(() => getGenerationStatus(busyFrame), [busyFrame]);

  const footerHint = useMemo(() => {
    if (!waiting && isBusy) {
      return generationStatus.hint;
    }

    return getFooterHint(waiting);
  }, [generationStatus.hint, isBusy, waiting]);

  return (
    <Box flexDirection="column" padding={1}>
      <Static items={entries}>
        {(entry) => <LogEntryView key={entry.id} entry={entry} />}
      </Static>

      <Box marginTop={1} borderStyle="round" borderColor={waiting ? 'green' : 'gray'} flexDirection="column" paddingX={1}>
        <Text color="cyanBright">KAL-AI Play</Text>
        <Text dimColor>{footerHint}</Text>
        {waiting ? (
          <>
            <Box marginTop={1}>
              <Text color="green">{waiting.promptText ?? '等待输入'}</Text>
            </Box>
            {waiting.kind === 'choice' ? (
              <>
                <Box flexDirection="column" marginTop={1}>
                  {waiting.options.map((option, index) => (
                    <Text key={`${waiting.stepId}-${option.value}-${index}`} color={index === selectedChoiceIndex ? 'cyan' : undefined}>
                      {index === selectedChoiceIndex ? '>' : ' '} {index + 1}. {option.label}
                    </Text>
                  ))}
                </Box>
                <Box marginTop={1}>
                  <Text color="gray">输入命令或数字: </Text>
                  <Text>{inputValue || '(回车直接确认当前选项)'}</Text>
                </Box>
              </>
            ) : (
              <Box marginTop={1}>
                <Text color="green">{'>'} </Text>
                <Text>{inputValue}</Text>
                <Text color="greenBright">_</Text>
              </Box>
            )}
          </>
        ) : (
          <Text dimColor>{isBusy ? generationStatus.body : '游戏已结束，按 Ctrl+C 返回终端'}</Text>
        )}
      </Box>
    </Box>
  );
}

function LogEntryView({ entry }: { entry: LogEntry }) {
  if (entry.kind === 'welcome') {
    return (
      <Card borderColor="blue" title={entry.name}>
        {entry.description ? <Text>{entry.description}</Text> : null}
      </Card>
    );
  }

  if (entry.kind === 'output') {
    return (
      <Card borderColor="green" title={entry.title}>
        {entry.primaryText ? <Text>{entry.primaryText}</Text> : null}
        {entry.stateChanges.length > 0 ? (
          <Box flexDirection="column" marginTop={entry.primaryText ? 1 : 0}>
            <Text color="yellow">状态变化</Text>
            {entry.stateChanges.map(({ key, value }) => (
              <Text key={key}>
                {key}: {formatStateValueText(value)}
              </Text>
            ))}
          </Box>
        ) : null}
        {!entry.primaryText && entry.fallback ? (
          <Text>{entry.fallback}</Text>
        ) : null}
      </Card>
    );
  }

  if (entry.kind === 'input') {
    return (
      <Card borderColor="blue" title={`你 · ${entry.title}`}>
        <Text color="cyanBright">{entry.body}</Text>
      </Card>
    );
  }

  if (entry.kind === 'state') {
    const rows = createStateRows(entry.state);
    return (
      <Card borderColor="yellow" title={entry.title}>
        {rows.length === 0 ? (
          <Text dimColor>(空)</Text>
        ) : (
          rows.map((row) => (
            <Text key={row.key}>
              {row.key} ({row.type}): {formatStateValueText(row.value)}
            </Text>
          ))
        )}
      </Card>
    );
  }

  if (entry.kind === 'help') {
    return (
      <Card borderColor="magenta" title="帮助">
        {helpLines.map((line) => (
          <Text key={line}>{line}</Text>
        ))}
      </Card>
    );
  }

  if (entry.kind === 'system') {
    return (
      <Card borderColor="cyan" title={entry.title}>
        <Text>{entry.body}</Text>
      </Card>
    );
  }

  if (entry.kind === 'error') {
    return (
      <Card borderColor="red" title="错误">
        <Text color="red">{entry.message}</Text>
      </Card>
    );
  }

  return (
    <Card borderColor="green" title="结束">
      <Text>{entry.message ?? '游戏结束'}</Text>
    </Card>
  );
}

function Card(
  { borderColor, title, children }: {
    borderColor: 'blue' | 'green' | 'yellow' | 'magenta' | 'cyan' | 'red';
    title: string;
    children: ReactNode;
  },
) {
  return (
    <Box borderStyle="round" borderColor={borderColor} flexDirection="column" paddingX={1} marginBottom={1}>
      <Text color={borderColor}>{title}</Text>
      {children}
    </Box>
  );
}
