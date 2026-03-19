import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Play, RotateCcw, Send, Square, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useRunDebug, useStudioCommands } from '@/kernel/hooks';
import { formatTime } from '@/i18n/format';
import { runStatusClass } from '@/utils/run-status';

type SessionRunDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function useStatusLabel() {
  const { t } = useTranslation('session');
  return (status: string | null | undefined): string => {
    if (!status) return t('status.notStarted');
    switch (status) {
      case 'waiting_input':
        return t('status.waitingInput');
      case 'paused':
        return t('status.paused');
      case 'ended':
        return t('status.ended');
      case 'error':
        return t('status.error');
      default:
        return status;
    }
  };
}

export function SessionRunDialog({ open, onOpenChange }: SessionRunDialogProps) {
  const { t } = useTranslation('session');
  const statusLabel = useStatusLabel();
  const {
    selectedRun: run,
    selectedRunState: runState,
    selectedInputHistory: inputHistory,
    runCommandLoading: loading,
    runCommandError: error,
  } = useRunDebug();
  const {
    createRun,
    advanceRun,
    cancelRun,
    replayRun,
    selectRun,
    stepRun,
    refreshRuns,
  } = useStudioCommands();

  const [inputValue, setInputValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  // When dialog opens, refresh runs and select the active one
  useEffect(() => {
    if (!open) {
      setInputValue('');
      setLocalError('');
      setSubmitting(false);
      return;
    }

    void (async () => {
      try {
        const runs = await refreshRuns();
        const activeRun = runs.find((item) => item.active);
        if (activeRun) {
          await selectRun(activeRun.run_id);
        }
      } catch (err) {
        setLocalError((err as Error).message || t('runtime.loadFailed'));
      }
    })();
  }, [open, refreshRuns, selectRun, t]);

  const handleStart = async (mode?: 'continue' | 'step') => {
    setSubmitting(true);
    setLocalError('');
    try {
      const created = await createRun(Boolean(run), mode);
      setInputValue('');
      await selectRun(created.run_id);
    } catch (err) {
      setLocalError((err as Error).message || t('runtime.startFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdvance = async (input?: string, mode?: 'continue' | 'step') => {
    if (!run) return;

    setSubmitting(true);
    setLocalError('');
    try {
      const nextRun = mode === 'step' ? await stepRun(run.run_id, input) : await advanceRun(run.run_id, input);
      setInputValue('');
      await selectRun(nextRun.run_id);
    } catch (err) {
      setLocalError((err as Error).message || t('runtime.advanceFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReplay = async () => {
    if (!run) return;

    setSubmitting(true);
    setLocalError('');
    try {
      const replayed = await replayRun(run.run_id);
      setInputValue('');
      await selectRun(replayed.run_id);
    } catch (err) {
      setLocalError((err as Error).message || t('runtime.replayFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!run) return;

    setSubmitting(true);
    setLocalError('');
    try {
      await cancelRun(run.run_id);
      await selectRun(null);
    } catch (err) {
      setLocalError((err as Error).message || t('runtime.cancelFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const waitingFor = run?.waiting_for;
  const statePreview = runState?.state_summary.preview ?? run?.state_summary.preview ?? {};
  const fullState = runState?.state ?? {};
  const history = run?.recent_events ?? [];
  const displayError = localError || error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t('runtime.title')}</DialogTitle>
          <DialogDescription>
            {t('runtime.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[1.3fr_0.9fr]">
          <div className="space-y-4">
            <div className="rounded-xl border bg-card">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div>
                  <div className="text-sm font-semibold">{t('runtime.currentRun')}</div>
                  <div className="text-xs text-muted-foreground">
                    {run ? t('runtime.updatedAt', { runId: run.run_id, time: formatTime(new Date(run.updated_at)) }) : t('runtime.notStarted')}
                  </div>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${runStatusClass(run?.status ?? null)}`}>
                  {statusLabel(run?.status ?? null)}
                </span>
              </div>

              <div className="space-y-4 px-4 py-4">
                {loading && !run && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    {t('runtime.connecting')}
                  </div>
                )}

                {!loading && !run && (
                  <EmptyState message={t('runtime.noActiveRun')} compact />
                )}

                {run && (
                  <>
                    <div className="grid gap-3 rounded-lg bg-muted/50 p-3 md:grid-cols-3">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">{t('runDialog.step')}</div>
                        <div className="mt-1 text-sm font-medium">
                          {run.cursor.currentStepId ?? t('runDialog.end')}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">{t('runDialog.changed')}</div>
                        <div className="mt-1 text-sm font-medium">
                          {run.state_summary.changed.length > 0 ? run.state_summary.changed.join(', ') : t('runDialog.noChanges')}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">{t('runDialog.keys')}</div>
                        <div className="mt-1 text-sm font-medium">{run.state_summary.total_keys}</div>
                      </div>
                    </div>

                    {waitingFor && (
                      <div className="space-y-3 rounded-lg border p-4">
                        <div>
                          <div className="text-sm font-semibold">{t('runtime.waitingInput')}</div>
                          <div className="text-xs text-muted-foreground">
                            {waitingFor.step_id} · {waitingFor.kind === 'choice' ? t('runtime.chooseAction') : t('runtime.textInput')}
                          </div>
                        </div>

                        {waitingFor.prompt_text && (
                          <div className="rounded-md bg-muted/60 px-3 py-2 text-sm leading-6">
                            {waitingFor.prompt_text}
                          </div>
                        )}

                        {waitingFor.kind === 'prompt' && (
                          <div className="flex gap-2">
                            <Input
                              value={inputValue}
                              onChange={(e) => setInputValue(e.target.value)}
                              placeholder={t('runtime.inputPlaceholder')}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  void handleAdvance(inputValue);
                                }
                              }}
                            />
                            <Button onClick={() => void handleAdvance(inputValue)} disabled={submitting}>
                              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                            </Button>
                            <Button variant="outline" onClick={() => void handleAdvance(inputValue, 'step')} disabled={submitting}>
                              {t('runtime.stepSubmit')}
                            </Button>
                          </div>
                        )}

                        {waitingFor.kind === 'choice' && waitingFor.options && waitingFor.options.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {waitingFor.options.map((option) => (
                              <div key={`${option.label}:${option.value}`} className="flex gap-2">
                                <Button
                                  variant="outline"
                                  onClick={() => void handleAdvance(option.value)}
                                  disabled={submitting}
                                >
                                  {option.label}
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => void handleAdvance(option.value, 'step')}
                                  disabled={submitting}
                                >
                                  {t('runtime.step')}
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {run.status === 'paused' && (
                      <div className="rounded-lg border p-4">
                        <div className="mb-3 text-sm text-muted-foreground">
                          {t('runtime.runPaused')}
                        </div>
                        <div className="flex gap-2">
                          <Button onClick={() => void handleAdvance()} disabled={submitting}>
                            {submitting ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Send className="mr-1.5 size-4" />}
                            {t('runtime.continue')}
                          </Button>
                          <Button variant="outline" onClick={() => void handleAdvance(undefined, 'step')} disabled={submitting}>
                            {t('runtime.step')}
                          </Button>
                        </div>
                      </div>
                    )}

                    {(run.status === 'ended' || run.status === 'error') && (
                      <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                        {t('runtime.runStopped')}
                      </div>
                    )}
                  </>
                )}

                {displayError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {displayError}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border bg-card">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div className="text-sm font-semibold">{t('runtime.recentEvents')}</div>
                <div className="text-xs text-muted-foreground">{t('runtime.eventCount', { count: history.length })}</div>
              </div>
              <div className="max-h-[320px] space-y-3 overflow-auto px-4 py-4">
                {history.length === 0 && (
                  <div className="text-sm text-muted-foreground">{t('runtime.noEvents')}</div>
                )}
                {history.map((event, index) => (
                  <div key={`${event.type}-${index}`} className="rounded-lg border p-3">
                    {event.type === 'output' ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium">{event.step_id}</div>
                          {event.flow_id && (
                            <div className="text-xs text-muted-foreground">{event.flow_id}</div>
                          )}
                        </div>
                        {event.normalized.narration && (
                          <div className="rounded-md bg-muted/60 px-3 py-2 text-sm leading-6">
                            {event.normalized.narration}
                          </div>
                        )}
                        <pre className="overflow-auto rounded-md bg-muted/60 p-3 text-xs">
                          {JSON.stringify(event.raw, null, 2)}
                        </pre>
                      </div>
                    ) : (
                      <div className="text-sm">
                        <span className="font-medium">{t('runDialog.end')}</span>
                        <span className="ml-2 text-muted-foreground">{event.message ?? t('runDialog.sessionEnded')}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border bg-card">
              <div className="flex items-center gap-2 border-b px-4 py-3">
                <Sparkles className="size-4 text-amber-500" />
                <div className="text-sm font-semibold">{t('runtime.statePreview')}</div>
              </div>
              <div className="space-y-3 px-4 py-4">
                {Object.keys(statePreview).length === 0 ? (
                  <div className="text-sm text-muted-foreground">{t('runtime.noStatePreview')}</div>
                ) : (
                  Object.entries(statePreview).map(([key, value]) => (
                    <div key={key} className="rounded-lg bg-muted/50 px-3 py-2">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">{key}</div>
                      <div className="mt-1 break-all text-sm font-medium">{JSON.stringify(value)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border bg-card">
              <div className="border-b px-4 py-3 text-sm font-semibold">{t('runtime.fullState')}</div>
              <div className="max-h-[320px] overflow-auto px-4 py-4">
                <pre className="rounded-lg bg-muted/60 p-3 text-xs">
                  {JSON.stringify(fullState, null, 2)}
                </pre>
              </div>
            </div>

            <div className="rounded-xl border bg-card">
              <div className="border-b px-4 py-3 text-sm font-semibold">{t('runtime.inputHistory')}</div>
              <div className="max-h-[220px] space-y-3 overflow-auto px-4 py-4">
                {inputHistory.length === 0 ? (
                  <div className="text-sm text-muted-foreground">{t('runtime.noInputHistory')}</div>
                ) : (
                  inputHistory.map((entry, index) => (
                    <div key={`${entry.step_id}:${entry.timestamp}:${index}`} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium">
                          {entry.step_id} · {t('runDialog.step')} {entry.step_index}
                        </div>
                        <div className="text-xs text-muted-foreground">{formatTime(new Date(entry.timestamp))}</div>
                      </div>
                      <div className="mt-2 break-all text-sm text-muted-foreground">{entry.input}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="justify-between">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('runtime.close')}
            </Button>
            {run && (
              <Button variant="outline" onClick={() => void handleCancel()} disabled={submitting}>
                <Square className="mr-1.5 size-4" />
                {t('runtime.cancelRun')}
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            {run && (
              <Button variant="outline" onClick={() => void handleReplay()} disabled={submitting || loading}>
                <RotateCcw className="mr-1.5 size-4" />
                {t('runtime.replay')}
              </Button>
            )}
            <Button onClick={() => void handleStart()} disabled={submitting || loading}>
              {run ? <RotateCcw className="mr-1.5 size-4" /> : <Play className="mr-1.5 size-4" />}
              {run ? t('runtime.restart') : t('runtime.startRun')}
            </Button>
            <Button variant="outline" onClick={() => void handleStart('step')} disabled={submitting || loading}>
              {t('runtime.stepStart')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
