import { useEffect, useState } from "react";
import { Bug, Clock3, Play, RefreshCw, Rocket } from "lucide-react";
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { SessionRunDialog } from "@/components/SessionRunDialog";
import { EmptyState } from "@/components/EmptyState";
import { useRunDebug, useStudioCommands } from "@/kernel/hooks";
import { formatDateTime, formatTimeFromTimestamp } from "@/i18n/format";

export function DebuggerView() {
  const { t } = useTranslation('debug');
  const {
    breakpoints,
    hasBreakpointAtStep,
    runs,
    selectedInputHistory,
    selectedRun,
    selectedRunId,
    selectedRunState,
    selectedStepId,
    selectedTimeline,
    selectedStateDiff,
  } = useRunDebug();
  const { advanceRun, createRun, createSmokeRun, refreshRuns, replayRun, selectRun, stepRun, toggleBreakpoint } = useStudioCommands();
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState("");

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const nextRuns = await refreshRuns();
      const preferredRunId = selectedRunId ?? nextRuns.find((run) => run.active)?.run_id ?? nextRuns[0]?.run_id ?? null;
      if (preferredRunId) {
        await selectRun(preferredRunId);
      }
    } catch (err) {
      setError((err as Error).message || t('errors.loadRunsFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const startManagedRun = async (mode?: "continue" | "step") => {
    setError("");
    setLoading(true);
    try {
      const created = await createRun(false, mode);
      setDialogOpen(true);
      await selectRun(created.run_id);
      await refresh();
    } catch (err) {
      setError((err as Error).message || t('errors.createRunFailed'));
    } finally {
      setLoading(false);
    }
  };

  const startSmokeRun = async () => {
    setError("");
    setLoading(true);
    try {
      const created = await createSmokeRun();
      await selectRun(created.run_id);
      await refresh();
    } catch (err) {
      setError((err as Error).message || t('errors.smokeRunFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectedRunAction = async (action: () => Promise<void>) => {
    setError("");
    setLoading(true);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError((err as Error).message || t('errors.updateRunFailed'));
    } finally {
      setLoading(false);
    }
  };

  const canAdvanceWithoutInput =
    selectedRun !== null &&
    !selectedRun.waiting_for &&
    selectedRun.status !== "ended" &&
    selectedRun.status !== "error";
  const canReplay = Boolean(selectedRunId);
  const selectedStepHasBreakpoint = hasBreakpointAtStep(selectedStepId);

  return (
    <>
      <div className="h-full w-full overflow-auto bg-background p-6">
        <div className="mx-auto grid max-w-6xl gap-6 xl:grid-cols-[0.95fr_1.3fr]">
          <section className="space-y-4 rounded-2xl border bg-card p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Bug className="size-4" />
                <div>
                  <h1 className="text-lg font-semibold">{t('title')}</h1>
                  <p className="text-sm text-muted-foreground">{t('description')}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
                <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
                {t('refresh')}
              </Button>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => void startManagedRun()} disabled={loading}>
                <Play className="size-4" />
{t('newRun')}
              </Button>
              <Button variant="outline" onClick={() => void startManagedRun("step")} disabled={loading}>
                {t('stepNew')}
              </Button>
              <Button variant="outline" onClick={() => void startSmokeRun()} disabled={loading}>
                <Rocket className="size-4" />
                {t('smokeRun')}
              </Button>
              <Button variant="outline" onClick={() => setDialogOpen(true)}>
                {t('openRuntimePanel')}
              </Button>
            </div>

            {error ? (
              <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <div className="space-y-3">
              {runs.length === 0 ? (
                <EmptyState message={t('noActiveRuns')} />
              ) : (
                runs.map((record) => (
                  <button
                    key={record.runId}
                    type="button"
                    onClick={() => {
                      void selectRun(record.runId).catch((err) => {
                        setError((err as Error).message || t('errors.loadRunStateFailed'));
                      });
                    }}
                    className={`w-full rounded-xl border px-4 py-3 text-left ${
                      selectedRunId === record.runId ? "border-primary bg-primary/5" : "hover:bg-muted/30"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="font-medium">{record.run.run_id}</div>
                        <div className="text-xs text-muted-foreground">{record.run.status}</div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <div>{record.run.active ? "active" : "inactive"}</div>
                        <div>{formatDateTime(record.run.updated_at)}</div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border bg-card p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Clock3 className="size-4" />
                <div>
                  <h2 className="text-lg font-semibold">{t('selectRun')}</h2>
                  <p className="text-sm text-muted-foreground">{t('snapshotDescription')}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!selectedStepId || loading}
                  onClick={() => {
                    if (!selectedStepId) return;
                    toggleBreakpoint(selectedStepId);
                  }}
                >
                  {selectedStepHasBreakpoint ? t('removeBreakpoint') : t('addBreakpointAtStep')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canAdvanceWithoutInput || loading}
                  onClick={() => {
                    if (!selectedRunId) return;
                    void handleSelectedRunAction(async () => {
                      await stepRun(selectedRunId);
                      await selectRun(selectedRunId);
                    });
                  }}
                >
                  {t('step')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canAdvanceWithoutInput || loading}
                  onClick={() => {
                    if (!selectedRunId) return;
                    void handleSelectedRunAction(async () => {
                      await advanceRun(selectedRunId);
                      await selectRun(selectedRunId);
                    });
                  }}
                >
                  {t('continue')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canReplay || loading}
                  onClick={() => {
                    if (!selectedRunId) return;
                    void handleSelectedRunAction(async () => {
                      const replayed = await replayRun(selectedRunId);
                      await selectRun(replayed.run_id);
                    });
                  }}
                >
                  {t('replayFromStart')}
                </Button>
              </div>
            </div>

            {!selectedRun || !selectedRunState ? (
              <EmptyState message={t('selectRunToView')} />
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border p-4">
                    <div className="text-sm font-medium">{t('runStatus')}</div>
                    <div className="mt-2 text-2xl font-semibold">{selectedRun.status}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {t('createdAt', { time: formatDateTime(selectedRun.created_at) })}
                    </div>
                  </div>
                  <div className="rounded-xl border p-4">
                    <div className="text-sm font-medium">{t('waitingFor')}</div>
                    <div className="mt-2 text-sm">
                      {selectedRunState.waiting_for
                        ? `${selectedRunState.waiting_for.kind} @ ${selectedRunState.waiting_for.step_id}`
                        : t('none')}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      cursor: {selectedRunState.cursor.currentStepId ?? "null"} / {selectedRunState.cursor.stepIndex}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border p-4">
                  <div className="mb-3 text-sm font-medium">{t('stateDiff.title')}</div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <div className="text-xs text-muted-foreground">{t('stateKeys')}</div>
                      <div className="text-lg font-semibold">{selectedRunState.state_summary.total_keys}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">{t('changedKeys')}</div>
                      <div className="text-lg font-semibold">{selectedRunState.state_summary.changed.length}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">{t('recentEvents')}</div>
                      <div className="text-lg font-semibold">{selectedTimeline.length}</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">{t('breakpoints')}</div>
                    <div className="text-xs text-muted-foreground">{breakpoints.length} active</div>
                  </div>
                  {breakpoints.length === 0 ? (
                    <div className="text-xs text-muted-foreground">{t('noBreakpointsHint')}</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {breakpoints.map((entry) => (
                        <button
                          key={entry.step_id}
                          type="button"
                          className={`rounded-full border px-3 py-1 text-xs ${
                            selectedStepId === entry.step_id ? "border-primary bg-primary/10" : "hover:bg-muted/40"
                          }`}
                          onClick={() => toggleBreakpoint(entry.step_id)}
                        >
                          {entry.step_id} · hit {entry.hit_count}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-xl border p-4">
                    <div className="mb-3 text-sm font-medium">{t('trace.title')}</div>
                    <div className="space-y-2">
                      {selectedTimeline.slice(0, 6).map((entry) => (
                        <div
                          key={entry.id}
                          className={`rounded-lg border px-3 py-2 text-xs ${
                            entry.eventType === "run.breakpoint" ? "border-amber-400 bg-amber-50/60" : ""
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-medium">{entry.title}</div>
                            <div className="text-muted-foreground">{formatDateTime(entry.timestamp)}</div>
                          </div>
                          <div className="text-muted-foreground">
                            {entry.eventType} · {entry.cursorStepId ?? "null"}
                          </div>
                          {entry.detail ? <div className="mt-1">{entry.detail}</div> : null}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border p-4">
                    <div className="mb-3 text-sm font-medium">{t('stateDiff.title')}</div>
                    {selectedStateDiff.length === 0 ? (
                      <div className="text-xs text-muted-foreground">{t('stateDiff.noChanges')}</div>
                    ) : (
                      <div className="space-y-2">
                        {selectedStateDiff.slice(0, 6).map((entry) => (
                          <div key={entry.key} className="rounded-lg border px-3 py-2 text-xs">
                            <div className="font-medium">{entry.key}</div>
                            <div className="mt-1 grid gap-2 md:grid-cols-2">
                              <pre className="whitespace-pre-wrap break-all rounded bg-muted/40 p-2">
                                {JSON.stringify(entry.before, null, 2)}
                              </pre>
                              <pre className="whitespace-pre-wrap break-all rounded bg-muted/40 p-2">
                                {JSON.stringify(entry.after, null, 2)}
                              </pre>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border p-4">
                  <div className="mb-3 text-sm font-medium">{t('stateManager.title')}</div>
                  {selectedInputHistory.length === 0 ? (
                    <div className="text-xs text-muted-foreground">{t('noInputHistory')}</div>
                  ) : (
                    <div className="space-y-2">
                      {selectedInputHistory.map((entry, index) => (
                        <div key={`${entry.step_id}:${entry.timestamp}:${index}`} className="rounded-lg border px-3 py-2 text-xs">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-medium">
                              {entry.step_id} · step {entry.step_index}
                            </div>
                            <div className="text-muted-foreground">{formatTimeFromTimestamp(entry.timestamp)}</div>
                          </div>
                          <div className="mt-1 break-all text-muted-foreground">{entry.input}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      <SessionRunDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
