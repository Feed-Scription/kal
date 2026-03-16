import { useEffect, useRef, useState } from 'react';
import { Loader2, Play, RotateCcw, Send, Square, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { RunEvent, RunStateView, RunView } from '@/types/project';
import { useRunService, useStudioCommands } from '@/kernel/hooks';

type SessionRunDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function mergeEvents(existing: RunEvent[], incoming: RunEvent[]): RunEvent[] {
  const seen = new Set(existing.map((event) => JSON.stringify(event)));
  const merged = [...existing];

  for (const event of incoming) {
    const key = JSON.stringify(event);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(event);
  }

  return merged;
}

function statusLabel(run: RunView | null): string {
  if (!run) {
    return '未开始';
  }
  switch (run.status) {
    case 'waiting_input':
      return '等待输入';
    case 'paused':
      return '已暂停';
    case 'ended':
      return '已结束';
    case 'error':
      return '运行错误';
    default:
      return run.status;
  }
}

function statusClass(run: RunView | null): string {
  if (!run) {
    return 'border-border bg-muted text-muted-foreground';
  }
  switch (run.status) {
    case 'waiting_input':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'paused':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'ended':
      return 'border-sky-200 bg-sky-50 text-sky-700';
    case 'error':
      return 'border-red-200 bg-red-50 text-red-700';
    default:
      return 'border-border bg-muted text-muted-foreground';
  }
}

export function SessionRunDialog({ open, onOpenChange }: SessionRunDialogProps) {
  const { createRun, listRuns, getRunState, advanceRun, cancelRun, replayRun, selectRun, stepRun } = useStudioCommands();
  const runs = useRunService();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [run, setRun] = useState<RunView | null>(null);
  const [runState, setRunState] = useState<RunStateView | null>(null);
  const [history, setHistory] = useState<RunEvent[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const closeSubscription = () => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
  };

  const refreshRunState = async (runId: string) => {
    const nextState = await getRunState(runId);
    setRunState(nextState);
  };

  useEffect(() => {
    if (!open) {
      closeSubscription();
      setLoading(false);
      setSubmitting(false);
      setRun(null);
      setRunState(null);
      setHistory([]);
      setInputValue('');
      setError('');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');

    void (async () => {
      try {
        const runs = await listRuns();
        if (cancelled) {
          return;
        }

        const activeRun = runs.find((item) => item.active);
        if (!activeRun) {
          setRun(null);
          setRunState(null);
          setHistory([]);
          return;
        }

        const nextState = await getRunState(activeRun.run_id);
        if (cancelled) {
          return;
        }

        setRun(nextState);
        setRunState(nextState);
        setHistory(nextState.recent_events);
        void selectRun(nextState.run_id).catch(() => {
          // Ignore selection sync failures here.
        });
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message || '加载 Session run 失败');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, getRunState, listRuns]);

  useEffect(() => {
    if (!open || !run?.run_id) {
      closeSubscription();
      return;
    }

    closeSubscription();
    unsubscribeRef.current = runs.subscribe(run.run_id, (event) => {
      setRun(event.run);
      setHistory((existing) => mergeEvents(existing, event.run.recent_events));

      if (event.type === 'run.cancelled') {
        setRunState(null);
        return;
      }

      void refreshRunState(event.run.run_id).catch(() => {
        // Keep the last known state view if refresh fails.
      });
    });

    return () => {
      closeSubscription();
    };
  }, [open, run?.run_id, getRunState, runs]);

  const handleStart = async (mode?: 'continue' | 'step') => {
    setSubmitting(true);
    setError('');
    try {
      const created = await createRun(Boolean(run), mode);
      setRun(created);
      setHistory(created.recent_events);
      setInputValue('');
      await refreshRunState(created.run_id);
      await selectRun(created.run_id);
    } catch (err) {
      setError((err as Error).message || '启动 Session run 失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdvance = async (input?: string, mode?: 'continue' | 'step') => {
    if (!run) {
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const nextRun = mode === 'step' ? await stepRun(run.run_id, input) : await advanceRun(run.run_id, input);
      setRun(nextRun);
      setHistory((existing) => mergeEvents(existing, nextRun.recent_events));
      setInputValue('');
      await refreshRunState(nextRun.run_id);
      await selectRun(nextRun.run_id);
    } catch (err) {
      setError((err as Error).message || '推进 Session run 失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReplay = async () => {
    if (!run) {
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const replayed = await replayRun(run.run_id);
      setRun(replayed);
      setHistory(replayed.recent_events);
      setInputValue('');
      await refreshRunState(replayed.run_id);
      await selectRun(replayed.run_id);
    } catch (err) {
      setError((err as Error).message || '重放 Session run 失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!run) {
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await cancelRun(run.run_id);
      closeSubscription();
      setRun(null);
      setRunState(null);
      setHistory([]);
      setInputValue('');
      await selectRun(null);
    } catch (err) {
      setError((err as Error).message || '取消 Session run 失败');
    } finally {
      setSubmitting(false);
    }
  };

  const waitingFor = run?.waiting_for;
  const statePreview = runState?.state_summary.preview ?? run?.state_summary.preview ?? {};
  const fullState = runState?.state ?? {};
  const inputHistory = runState?.input_history ?? run?.input_history ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Session Runtime</DialogTitle>
          <DialogDescription>
            Studio 只负责展示和输入采集；Session 推进、状态恢复和交互边界都由 Engine managed run 负责。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[1.3fr_0.9fr]">
          <div className="space-y-4">
            <div className="rounded-xl border bg-card">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div>
                  <div className="text-sm font-semibold">当前 Run</div>
                  <div className="text-xs text-muted-foreground">
                    {run ? `${run.run_id} · 更新于 ${formatTimestamp(run.updated_at)}` : '尚未启动'}
                  </div>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(run)}`}>
                  {statusLabel(run)}
                </span>
              </div>

              <div className="space-y-4 px-4 py-4">
                {loading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    正在连接 Session runtime...
                  </div>
                )}

                {!loading && !run && (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    当前没有 active run。点击“启动 Run”后，Engine 会自动推进到第一个交互边界。
                  </div>
                )}

                {run && (
                  <>
                    <div className="grid gap-3 rounded-lg bg-muted/50 p-3 md:grid-cols-3">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Step</div>
                        <div className="mt-1 text-sm font-medium">
                          {run.cursor.currentStepId ?? 'end'}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Changed</div>
                        <div className="mt-1 text-sm font-medium">
                          {run.state_summary.changed.length > 0 ? run.state_summary.changed.join(', ') : 'No changes'}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Keys</div>
                        <div className="mt-1 text-sm font-medium">{run.state_summary.total_keys}</div>
                      </div>
                    </div>

                    {waitingFor && (
                      <div className="space-y-3 rounded-lg border p-4">
                        <div>
                          <div className="text-sm font-semibold">等待输入</div>
                          <div className="text-xs text-muted-foreground">
                            {waitingFor.step_id} · {waitingFor.kind === 'choice' ? '选择行动' : '文本输入'}
                          </div>
                        </div>

                        {waitingFor.prompt_text && (
                          <div className="rounded-lg bg-muted/60 p-3 text-sm leading-6">
                            {waitingFor.prompt_text}
                          </div>
                        )}

                        {waitingFor.kind === 'prompt' && (
                          <div className="flex gap-2">
                            <Input
                              value={inputValue}
                              onChange={(event) => setInputValue(event.target.value)}
                              placeholder="输入要提交给 Session 的内容"
                              disabled={submitting}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  void handleAdvance(inputValue);
                                }
                              }}
                            />
                            <Button onClick={() => void handleAdvance(inputValue)} disabled={submitting}>
                              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                            </Button>
                            <Button variant="outline" onClick={() => void handleAdvance(inputValue, 'step')} disabled={submitting}>
                              单步提交
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
                                  单步
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
                          Run 已暂停在下一个边界之前，可以继续推进。
                        </div>
                        <div className="flex gap-2">
                          <Button onClick={() => void handleAdvance()} disabled={submitting}>
                            {submitting ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Send className="mr-1.5 size-4" />}
                            继续
                          </Button>
                          <Button variant="outline" onClick={() => void handleAdvance(undefined, 'step')} disabled={submitting}>
                            单步
                          </Button>
                        </div>
                      </div>
                    )}

                    {(run.status === 'ended' || run.status === 'error') && (
                      <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                        当前 run 已停止。可以直接重新启动一个新的 run。
                      </div>
                    )}
                  </>
                )}

                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border bg-card">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div className="text-sm font-semibold">最近事件</div>
                <div className="text-xs text-muted-foreground">{history.length} 条</div>
              </div>
              <div className="max-h-[320px] space-y-3 overflow-auto px-4 py-4">
                {history.length === 0 && (
                  <div className="text-sm text-muted-foreground">尚无事件输出。</div>
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
                        <span className="font-medium">End</span>
                        <span className="ml-2 text-muted-foreground">{event.message ?? 'Session ended'}</span>
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
                <div className="text-sm font-semibold">状态预览</div>
              </div>
              <div className="space-y-3 px-4 py-4">
                {Object.keys(statePreview).length === 0 ? (
                  <div className="text-sm text-muted-foreground">暂无可展示的状态预览。</div>
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
              <div className="border-b px-4 py-3 text-sm font-semibold">完整 State</div>
              <div className="max-h-[320px] overflow-auto px-4 py-4">
                <pre className="rounded-lg bg-muted/60 p-3 text-xs">
                  {JSON.stringify(fullState, null, 2)}
                </pre>
              </div>
            </div>

            <div className="rounded-xl border bg-card">
              <div className="border-b px-4 py-3 text-sm font-semibold">输入历史</div>
              <div className="max-h-[220px] space-y-3 overflow-auto px-4 py-4">
                {inputHistory.length === 0 ? (
                  <div className="text-sm text-muted-foreground">当前 run 还没有用户输入记录。</div>
                ) : (
                  inputHistory.map((entry, index) => (
                    <div key={`${entry.step_id}:${entry.timestamp}:${index}`} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium">
                          {entry.step_id} · step {entry.step_index}
                        </div>
                        <div className="text-xs text-muted-foreground">{formatTimestamp(entry.timestamp)}</div>
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
              关闭
            </Button>
            {run && (
              <Button variant="outline" onClick={() => void handleCancel()} disabled={submitting}>
                <Square className="mr-1.5 size-4" />
                取消 Run
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            {run && (
              <Button variant="outline" onClick={() => void handleReplay()} disabled={submitting || loading}>
                <RotateCcw className="mr-1.5 size-4" />
                重放
              </Button>
            )}
            <Button onClick={() => void handleStart()} disabled={submitting || loading}>
              {run ? <RotateCcw className="mr-1.5 size-4" /> : <Play className="mr-1.5 size-4" />}
              {run ? '重新开始' : '启动 Run'}
            </Button>
            <Button variant="outline" onClick={() => void handleStart('step')} disabled={submitting || loading}>
              单步启动
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
