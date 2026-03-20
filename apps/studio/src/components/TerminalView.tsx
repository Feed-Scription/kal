import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Gamepad2, Loader2, RotateCcw, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRunDebug, useStudioCommands } from '@/kernel/hooks';
import { cn } from '@/lib/utils';
import type { PlayTranscriptEntry, RunWaitingFor } from '@/types/project';

type TranscriptLine = {
  id: string;
  timestamp: number;
  role: 'player' | 'narrator' | 'system';
  text: string;
};

type InputDisplayOverride = {
  text: string;
  hidden?: boolean;
};

type PendingSubmission = {
  id: string;
  runId: string;
  expectedHistoryIndex: number;
  text: string;
  hidden: boolean;
  timestamp: number;
};

const generationFrames = ['|', '/', '-', '\\'];

function buildTranscript(
  transcript: PlayTranscriptEntry[],
  inputHistory: Array<{ step_id: string; timestamp: number; input: string }>,
  inputOverrides: Record<number, InputDisplayOverride>,
  pendingSubmission: PendingSubmission | null,
): TranscriptLine[] {
  const orderedOutputs = [...transcript].sort((left, right) => left.timestamp - right.timestamp);
  const lines: TranscriptLine[] = [];
  let nextInputIndex = 0;

  const appendPlayerLine = (index: number) => {
    const entry = inputHistory[index];
    if (!entry) {
      return;
    }

    const override = inputOverrides[index];
    if (override?.hidden) {
      return;
    }

    lines.push({
      id: `${entry.step_id}:${entry.timestamp}:player:${index}`,
      timestamp: entry.timestamp,
      role: 'player',
      text: override?.text ?? entry.input,
    });
  };

  for (const entry of orderedOutputs) {
    const entryInputCount = Math.min(entry.inputCount, inputHistory.length);
    while (nextInputIndex < entryInputCount) {
      appendPlayerLine(nextInputIndex);
      nextInputIndex += 1;
    }

    lines.push({
      id: entry.id,
      timestamp: entry.timestamp,
      role: entry.eventType === 'end' ? 'system' : 'narrator',
      text: entry.text,
    });
  }

  while (nextInputIndex < inputHistory.length) {
    appendPlayerLine(nextInputIndex);
    nextInputIndex += 1;
  }

  if (pendingSubmission && !pendingSubmission.hidden && pendingSubmission.expectedHistoryIndex >= inputHistory.length) {
    lines.push({
      id: pendingSubmission.id,
      timestamp: pendingSubmission.timestamp,
      role: 'player',
      text: pendingSubmission.text,
    });
  }

  return lines;
}

function resolveSubmittedInput(
  rawValue: string,
  waitingFor: RunWaitingFor,
): { value: string; displayText: string; hidden: boolean } | null {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

  if (waitingFor.kind !== 'choice') {
    return {
      value: trimmed,
      displayText: trimmed,
      hidden: false,
    };
  }

  const options = waitingFor.options ?? [];
  const numericChoice = Number.parseInt(trimmed, 10);
  if (Number.isInteger(numericChoice) && String(numericChoice) === trimmed) {
    const option = options[numericChoice - 1];
    return option
      ? {
          value: option.value,
          displayText: option.label,
          hidden: options.length === 1,
        }
      : null;
  }

  const normalized = trimmed.toLowerCase();
  const matched = options.find((option) =>
    option.value === trimmed || option.label.toLowerCase() === normalized,
  );
  return matched
    ? {
        value: matched.value,
        displayText: matched.label,
        hidden: options.length === 1,
      }
    : null;
}

function TranscriptBubble({ entry }: { entry: TranscriptLine }) {
  const isPlayer = entry.role === 'player';
  const isSystem = entry.role === 'system';

  return (
    <div className={cn('flex', isPlayer ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-lg border px-4 py-3 text-sm shadow-xs',
          isPlayer && 'border-primary/20 bg-primary/10',
          !isPlayer && !isSystem && 'bg-card',
          isSystem && 'border-amber-500/20 bg-amber-500/10',
        )}
      >
        <div className={cn(
          'whitespace-pre-wrap leading-7 text-foreground',
          isPlayer ? 'font-medium' : '',
        )}>
          {entry.text}
        </div>
      </div>
    </div>
  );
}

export function PlayPanel() {
  const { t } = useTranslation('terminal');
  const { t: td } = useTranslation('debug');
  const {
    selectedRecord,
    selectedRun,
    selectedInputHistory,
    runCommandLoading,
    runCommandError,
  } = useRunDebug();
  const { advanceRun, cancelRun, createRun, retryRun } = useStudioCommands();
  const [draft, setDraft] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [inputOverridesByRun, setInputOverridesByRun] = useState<Record<string, Record<number, InputDisplayOverride>>>({});
  const [pendingSubmission, setPendingSubmission] = useState<PendingSubmission | null>(null);
  const [busyFrame, setBusyFrame] = useState(0);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const autoSubmittedChoiceRef = useRef<string | null>(null);

  const waitingFor = selectedRun?.waiting_for ?? null;
  const choiceOptions = useMemo(
    () => (waitingFor?.kind === 'choice' ? waitingFor.options ?? [] : []),
    [waitingFor],
  );
  const selectedInputOverrides = useMemo(
    () => (selectedRun ? inputOverridesByRun[selectedRun.run_id] ?? {} : {}),
    [inputOverridesByRun, selectedRun],
  );
  const activePendingSubmission = selectedRun && pendingSubmission?.runId === selectedRun.run_id
    ? pendingSubmission
    : null;
  const isGenerating = Boolean(activePendingSubmission);
  const transcript = useMemo(
    () => buildTranscript(
      selectedRecord?.playTranscript ?? [],
      selectedInputHistory,
      selectedInputOverrides,
      activePendingSubmission,
    ),
    [activePendingSubmission, selectedInputHistory, selectedInputOverrides, selectedRecord?.playTranscript],
  );
  const lastTranscriptId = transcript[transcript.length - 1]?.id;
  const generationStatus = useMemo(() => {
    const indicator = generationFrames[busyFrame % generationFrames.length] ?? generationFrames[0]!;
    const isAutoAdvance = activePendingSubmission?.hidden ?? false;
    return {
      hint: t(isAutoAdvance ? 'autoGeneratingHint' : 'generatingHint', { indicator }),
      body: t(isAutoAdvance ? 'autoGeneratingDescription' : 'generatingDescription', { indicator }),
    };
  }, [activePendingSubmission?.hidden, busyFrame, t]);

  useEffect(() => {
    requestAnimationFrame(() => {
      transcriptRef.current?.scrollTo({
        top: transcriptRef.current.scrollHeight,
        behavior: 'smooth',
      });
    });
  }, [lastTranscriptId, selectedRun?.status, waitingFor?.step_id]);

  useEffect(() => {
    setDraft('');
    setInputError(null);
  }, [selectedRun?.run_id, selectedRun?.status, waitingFor?.step_id, waitingFor?.kind]);

  useEffect(() => {
    if (!isGenerating) {
      setBusyFrame(0);
      return;
    }

    const timer = window.setInterval(() => {
      setBusyFrame((current) => (current + 1) % generationFrames.length);
    }, 120);

    return () => window.clearInterval(timer);
  }, [isGenerating]);

  useEffect(() => {
    if (!selectedRun || !pendingSubmission) {
      return;
    }

    if (pendingSubmission.runId !== selectedRun.run_id) {
      setPendingSubmission(null);
    }
  }, [pendingSubmission, selectedRun]);

  useEffect(() => {
    if (!activePendingSubmission) {
      return;
    }

    if (selectedInputHistory.length > activePendingSubmission.expectedHistoryIndex) {
      setPendingSubmission(null);
    }
  }, [activePendingSubmission, selectedInputHistory.length]);

  const handleStartRun = async (forceNew = true) => {
    setInputError(null);
    await createRun(forceNew);
  };

  const handleSubmit = useCallback(async (value = draft) => {
    if (!selectedRun || !waitingFor || activePendingSubmission) {
      return;
    }

    if (waitingFor.kind === 'choice' && !(waitingFor.options?.length)) {
      setInputError(t('noChoiceOptions'));
      return;
    }

    const resolvedInput = resolveSubmittedInput(value, waitingFor);
    if (!resolvedInput) {
      setInputError(
        waitingFor.kind === 'choice'
          ? t('invalidChoice', { count: waitingFor.options?.length ?? 0 })
          : t('emptyInput'),
      );
      return;
    }

    setInputError(null);
    setDraft('');

    const nextHistoryIndex = selectedInputHistory.length;
    const optimisticSubmission: PendingSubmission = {
      id: `pending:${selectedRun.run_id}:${nextHistoryIndex}:${Date.now()}`,
      runId: selectedRun.run_id,
      expectedHistoryIndex: nextHistoryIndex,
      text: resolvedInput.displayText,
      hidden: resolvedInput.hidden,
      timestamp: Date.now(),
    };
    setPendingSubmission(optimisticSubmission);

    try {
      await advanceRun(selectedRun.run_id, resolvedInput.value, 'continue');
      setInputOverridesByRun((current) => ({
        ...current,
        [selectedRun.run_id]: {
          ...(current[selectedRun.run_id] ?? {}),
          [nextHistoryIndex]: {
            text: resolvedInput.displayText,
            hidden: resolvedInput.hidden,
          },
        },
      }));
    } catch (error) {
      setPendingSubmission((current) => (
        current?.id === optimisticSubmission.id ? null : current
      ));
      setInputError((error as Error).message);
    }
  }, [
    activePendingSubmission,
    advanceRun,
    draft,
    selectedInputHistory.length,
    selectedRun,
    t,
    waitingFor,
  ]);

  useEffect(() => {
    if (!selectedRun || !waitingFor || runCommandLoading || activePendingSubmission) {
      return;
    }
    if (waitingFor.kind !== 'choice' || choiceOptions.length !== 1) {
      return;
    }

    const onlyOption = choiceOptions[0];
    if (!onlyOption) {
      return;
    }

    const autoSubmitKey = `${selectedRun.run_id}:${waitingFor.step_id}:${onlyOption.value}`;
    if (autoSubmittedChoiceRef.current === autoSubmitKey) {
      return;
    }

    autoSubmittedChoiceRef.current = autoSubmitKey;
    void handleSubmit(onlyOption.value);
  }, [activePendingSubmission, choiceOptions, handleSubmit, runCommandLoading, selectedRun, waitingFor]);

  const handleRetry = async () => {
    if (!selectedRun) {
      return;
    }
    setInputError(null);
    setPendingSubmission(null);
    try {
      await retryRun(selectedRun.run_id);
    } catch {
      // Store-level error state already surfaces the retry failure.
    }
  };

  const activeStatusLabel = selectedRun ? td(`runStatusLabel.${selectedRun.status}`) : t('notStarted');

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Gamepad2 className="size-4 shrink-0" />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">{t('title')}</h1>
            <div className="truncate text-xs text-muted-foreground">{t('subtitle')}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="hidden text-xs text-muted-foreground md:block">
            {selectedRun ? t('runLabel', { runId: selectedRun.run_id.slice(0, 8), status: activeStatusLabel }) : activeStatusLabel}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            disabled={runCommandLoading}
            onClick={() => void handleStartRun(true)}
          >
            <RotateCcw className="size-3" />
            {selectedRun ? t('restartRun') : t('startRun')}
          </Button>
          {selectedRun && selectedRun.status !== 'ended' ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
              disabled={runCommandLoading}
              onClick={() => void cancelRun(selectedRun.run_id)}
            >
              <Square className="size-3" />
              {t('cancelRun')}
            </Button>
          ) : null}
        </div>
      </div>

      {!selectedRun ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <EmptyState
            icon={Gamepad2}
            message={t('noRun')}
            description={t('noRunDescription')}
            action={(
              <Button size="sm" onClick={() => void handleStartRun(true)}>
                {t('startRun')}
              </Button>
            )}
          />
        </div>
      ) : (
        <>
          <div ref={transcriptRef} className="flex-1 overflow-auto bg-muted/10 px-4 py-3">
            {transcript.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                {t('noTranscript')}
              </div>
            ) : (
              <div className="space-y-4">
                {transcript.map((entry) => (
                  <TranscriptBubble key={entry.id} entry={entry} />
                ))}
              </div>
            )}
          </div>

          <div className="border-t px-4 py-3">
            {runCommandError ? (
              <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {runCommandError}
              </div>
            ) : null}
            {inputError ? (
              <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {inputError}
              </div>
            ) : null}

            {selectedRun.status === 'paused' ? (
              <div className="space-y-3">
                <div className="rounded-md border bg-card px-3 py-2 text-xs text-muted-foreground">
                  {t('pausedDescription')}
                </div>
                <Button
                  size="sm"
                  className="h-8 gap-1 font-mono"
                  disabled={runCommandLoading}
                  onClick={() => void advanceRun(selectedRun.run_id)}
                >
                  {runCommandLoading ? <Loader2 className="size-3 animate-spin" /> : <ChevronRight className="size-3" />}
                  {t('continueRun')}
                </Button>
              </div>
            ) : isGenerating ? (
              <div className="rounded-md border bg-card px-3 py-3">
                <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t('generatingLabel')}
                </div>
                <div className="flex items-center gap-2 font-mono text-sm">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  <span>{generationStatus.hint}</span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {generationStatus.body}
                </div>
              </div>
            ) : waitingFor ? (
              <div className="space-y-3">
                <div className="rounded-md border bg-card px-3 py-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {waitingFor.kind === 'choice' ? t('awaitingChoice') : t('awaitingPrompt')}
                  </div>
                  <div className="font-mono text-xs leading-5">
                    {waitingFor.prompt_text || t('noPromptText')}
                  </div>
                </div>

                {waitingFor.kind === 'choice' && choiceOptions.length > 1 ? (
                  <div className="grid gap-2 md:grid-cols-2">
                    {choiceOptions.map((option, index) => (
                      <Button
                        key={`${option.value}:${index}`}
                        variant="outline"
                        className="h-auto justify-start whitespace-normal py-2 text-left font-mono text-xs"
                        disabled={runCommandLoading}
                        onClick={() => void handleSubmit(option.value)}
                      >
                        <span className="mr-2 text-muted-foreground">{index + 1}.</span>
                        <span>{option.label}</span>
                      </Button>
                    ))}
                  </div>
                ) : null}

                <div className="flex gap-2">
                  <Input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void handleSubmit();
                      }
                    }}
                    placeholder={waitingFor.kind === 'choice' ? t('choiceInputPlaceholder') : t('promptInputPlaceholder')}
                    className="font-mono text-sm"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    name="play-input"
                    disabled={runCommandLoading}
                  />
                  <Button
                    size="sm"
                    className="h-9 gap-1 font-mono"
                    disabled={runCommandLoading || !draft.trim()}
                    onClick={() => void handleSubmit()}
                  >
                    {runCommandLoading ? <Loader2 className="size-3 animate-spin" /> : <ChevronRight className="size-3" />}
                    {t('submit')}
                  </Button>
                </div>
              </div>
            ) : selectedRun.status === 'error' ? (
              <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-3 text-xs text-destructive">
                <div>{t('errorDescription')}</div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1 font-mono"
                    disabled={runCommandLoading}
                    onClick={() => void handleRetry()}
                  >
                    {runCommandLoading ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
                    {t('retryStep')}
                  </Button>
                </div>
                <div className="text-[11px] text-destructive/80">
                  {t('retryStepDescription')}
                </div>
              </div>
            ) : (
              <div className="rounded-md border bg-card px-3 py-2 text-xs text-muted-foreground">
                {selectedRun.status === 'ended' ? t('endedDescription') : t('runningDescription')}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
