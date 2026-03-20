import type { SessionEvent, StateValue } from '@kal-ai/core';
import { Box, Static, Text, useApp, useInput } from 'ink';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EngineRuntime } from '../runtime';
import { resolveBuiltinCommand, resolveChoiceSubmission } from './controls';
import { t, type TuiLocale } from './i18n';
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
  locale?: TuiLocale;
}

function getHelpLines(locale: TuiLocale): string[] {
  return [
    t(locale, 'help.help'),
    t(locale, 'help.state'),
    t(locale, 'help.quit'),
  ];
}

const generationFrames = ['|', '/', '-', '\\'];

function cloneState(state: Record<string, StateValue>): Record<string, StateValue> {
  if (typeof structuredClone === 'function') {
    return structuredClone(state);
  }

  return JSON.parse(JSON.stringify(state)) as Record<string, StateValue>;
}

export function getFooterHint(waiting: WaitingState | null, locale: TuiLocale = 'en'): string {
  if (!waiting) {
    return t(locale, 'footer.ended');
  }

  if (waiting.kind === 'prompt') {
    return t(locale, 'footer.promptHint');
  }

  return t(locale, 'footer.choiceHint');
}

export function getGenerationStatus(frame: number, locale: TuiLocale = 'en'): { hint: string; body: string } {
  const indicator = generationFrames[frame % generationFrames.length] ?? generationFrames[0]!;
  return {
    hint: t(locale, 'gen.hint', { indicator }),
    body: t(locale, 'gen.body', { indicator }),
  };
}

export function createPlayerInputEntry(
  waiting: WaitingState,
  submittedText: string,
  locale: TuiLocale = 'en',
): LogEntryInput {
  const title = waiting.promptText ?? (waiting.kind === 'choice' ? t(locale, 'input.yourChoice') : t(locale, 'input.yourInput'));
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

export function InkTuiApp({ runtime, autoExit = true, locale = 'en' }: InkTuiAppProps) {
  const { exit } = useApp();
  const generatorRef = useRef(runtime.createSession());
  const nextEntryIdRef = useRef(1);
  const pumpingRef = useRef(false);
  const pumpRef = useRef<(input?: string) => Promise<void>>(null!);
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
      if (mountedRef.current) setInputValue('');
      return true;
    }

    if (action === 'state') {
      appendEntry({
        kind: 'state',
        title: t(locale, 'cmd.currentState'),
        state: cloneState(runtime.getState()),
      });
      if (mountedRef.current) setInputValue('');
      return true;
    }

    if (action === 'quit') {
      appendEntry({
        kind: 'system',
        title: t(locale, 'cmd.sessionEnd'),
        body: t(locale, 'cmd.goodbye'),
      });
      if (mountedRef.current) {
        setWaiting(null);
        setInputValue('');
      }
      try {
        await generatorRef.current.return(undefined);
      } finally {
        if (mountedRef.current && autoExit) {
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
  pumpRef.current = pump;

  const submitCurrentInput = useCallback(async () => {
    if (!waiting) return;
    const trimmed = inputValue.trim();

    if (waiting.kind === 'prompt') {
      if (await processCommand(trimmed)) return;
      if (!trimmed) return;
      appendEntry(createPlayerInputEntry(waiting, trimmed, locale));
      beginGenerationState(setWaiting, setInputValue, setIsBusy);
      await pumpRef.current(trimmed);
      return;
    }

    // choice mode — resolveChoiceSubmission handles commands internally
    const resolution = resolveChoiceSubmission(trimmed, waiting.options, selectedChoiceIndex);
    if (resolution.kind === 'command') {
      await processCommand(`/${resolution.command}`);
      return;
    }
    if (resolution.kind === 'noop') return;
    if (resolution.kind === 'submit') {
      const selectedLabel = waiting.options.find((o) => o.value === resolution.value)?.label ?? resolution.value;
      appendEntry(createPlayerInputEntry(waiting, selectedLabel, locale));
      beginGenerationState(setWaiting, setInputValue, setIsBusy);
      await pumpRef.current(resolution.value);
      return;
    }

    appendEntry({
      kind: 'system',
      title: t(locale, 'cmd.invalidInput'),
      body: t(locale, 'cmd.invalidChoiceBody', { max: waiting.options.length }),
    });
    setInputValue('');
  }, [appendEntry, inputValue, processCommand, selectedChoiceIndex, waiting]);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      if (shouldExit) return;
      void processCommand('/quit');
      return;
    }

    if (!waiting || isBusy) {
      return;
    }

    if (waiting.kind === 'choice') {
      if (key.upArrow) {
        if (inputValue.length > 0) setInputValue('');
        setSelectedChoiceIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (key.downArrow) {
        if (inputValue.length > 0) setInputValue('');
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
    void pumpRef.current();

    return () => {
      mountedRef.current = false;
      void generatorRef.current.return(undefined);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const generationStatus = useMemo(() => getGenerationStatus(busyFrame, locale), [busyFrame, locale]);

  const footerHint = useMemo(() => {
    if (!waiting && isBusy) {
      return generationStatus.hint;
    }

    return getFooterHint(waiting, locale);
  }, [generationStatus.hint, isBusy, locale, waiting]);

  return (
    <Box flexDirection="column" padding={1}>
      <Static items={entries}>
        {(entry) => <LogEntryView key={entry.id} entry={entry} locale={locale} />}
      </Static>

      <Box marginTop={1} borderStyle="round" borderColor={waiting ? 'green' : 'gray'} flexDirection="column" paddingX={1}>
        <Text color="cyanBright">KAL-AI Play</Text>
        <Text dimColor>{footerHint}</Text>
        {waiting ? (
          <>
            <Box marginTop={1}>
              <Text color="green">{waiting.promptText ?? t(locale, 'ui.waitingInput')}</Text>
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
                  <Text color="gray">{t(locale, 'ui.inputPrompt')}</Text>
                  <Text>{inputValue || t(locale, 'ui.enterConfirm')}</Text>
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
          <Text dimColor>{isBusy ? generationStatus.body : t(locale, 'ui.gameEnded')}</Text>
        )}
      </Box>
    </Box>
  );
}

function LogEntryView({ entry, locale }: { entry: LogEntry; locale: TuiLocale }) {
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
            <Text color="yellow">{t(locale, 'ui.stateChanges')}</Text>
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
      <Card borderColor="blue" title={`${t(locale, 'ui.you')} · ${entry.title}`}>
        <Text color="cyanBright">{entry.body}</Text>
      </Card>
    );
  }

  if (entry.kind === 'state') {
    const rows = createStateRows(entry.state);
    return (
      <Card borderColor="yellow" title={entry.title}>
        {rows.length === 0 ? (
          <Text dimColor>{t(locale, 'ui.empty')}</Text>
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
    const helpLines = getHelpLines(locale);
    return (
      <Card borderColor="magenta" title={t(locale, 'ui.help')}>
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
      <Card borderColor="red" title={t(locale, 'ui.error')}>
        <Text color="red">{entry.message}</Text>
      </Card>
    );
  }

  return (
    <Card borderColor="green" title={t(locale, 'ui.end')}>
      <Text>{entry.message ?? t(locale, 'ui.gameOver')}</Text>
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
