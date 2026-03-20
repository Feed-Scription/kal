/**
 * DebugStreamSidebar — real-time debug message stream.
 *
 * Replaces DebuggerView as the primary debug UI (architecture constraint #3).
 * Consumes store state exclusively (constraint #2). All commands go through
 * useStudioCommands (constraint #4).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bug, Filter, Play, RefreshCw, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/EmptyState';
import { DebugStateContextCard } from '@/components/DebugStateContextCard';
import { TraceEntryCard } from '@/components/TraceEntryCard';
import { StepControlToolbar } from '@/components/StepControlToolbar';
import { useRunDebug, useStudioCommands, useFlowResource, useStudioResources, useWorkbench } from '@/kernel/hooks';
import { useCanvasSelection } from '@/hooks/use-canvas-selection';
import { getRunStatusConfig } from '@/utils/run-status';
import { cn } from '@/lib/utils';
import type { RunView, TraceTimelineEntry, FlowExecutionTrace, HandleDefinition } from '@/types/project';

type FilterKey = 'all' | 'breakpoint' | 'state' | 'input';

const FILTER_KEYS: FilterKey[] = ['all', 'breakpoint', 'state', 'input'];

function matchesFilter(entry: TraceTimelineEntry, filter: FilterKey): boolean {
  if (filter === 'all') return true;
  if (filter === 'breakpoint') return entry.eventType === 'run.breakpoint';
  if (filter === 'state') return entry.changedKeys.length > 0;
  if (filter === 'input') return entry.eventType === 'run.input';
  return true;
}

/** Map filter key → i18n key under debug.stream */
const FILTER_I18N: Record<FilterKey, string> = {
  all: 'stream.filterAll',
  breakpoint: 'stream.filterBreakpoints',
  state: 'stream.filterState',
  input: 'stream.filterInput',
};

// ── Flow Execution Panel ──────────────────────────────────────────────

type FlowExecutionPanelProps = {
  flowId: string;
  inputs: HandleDefinition[];
  trace: FlowExecutionTrace | null;
  loading: boolean;
  onExecute: (flowId: string, input: Record<string, unknown>) => void;
};

function FlowExecutionPanel({ flowId, inputs, trace, loading, onExecute }: FlowExecutionPanelProps) {
  const { t } = useTranslation('flow');
  const [inputValues, setInputValues] = useState<Record<string, string>>({});

  // Reset input values when flowId changes
  useEffect(() => {
    const defaults: Record<string, string> = {};
    for (const input of inputs) {
      if (input.defaultValue != null) {
        defaults[input.name] = String(input.defaultValue);
      }
    }
    setInputValues(defaults);
  }, [flowId]);

  const isRunning = trace?.flowId === flowId && trace.active;
  const nodeResults = trace?.flowId === flowId ? trace.nodeResults : {};
  const executionOrder = trace?.flowId === flowId ? trace.executionOrder : [];
  const completedCount = Object.values(nodeResults).filter(
    (r) => r.status === 'success' || r.status === 'error',
  ).length;
  const runningNode = Object.values(nodeResults).find((r) => r.status === 'running');
  const traceStatus = trace?.flowId === flowId ? trace.status : null;
  const missingRequiredInputs = inputs.filter((input) => {
    if (!input.required || input.defaultValue !== undefined) {
      return false;
    }
    return (inputValues[input.name] ?? '').trim() === '';
  });

  const handleRun = () => {
    const parsed: Record<string, unknown> = {};
    for (const input of inputs) {
      const raw = inputValues[input.name];
      if (raw !== undefined && raw !== '') {
        try {
          parsed[input.name] = JSON.parse(raw);
        } catch {
          parsed[input.name] = raw;
        }
      }
    }
    onExecute(flowId, parsed);
  };

  return (
    <div className="space-y-3 border-b px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{t('runFlowTitle', { flowId })}</span>
      </div>

      {/* Input fields */}
      {inputs.length > 0 && (
        <div className="space-y-2">
          {inputs.map((input) => (
            <div key={input.name} className="space-y-1">
              <Label htmlFor={`flow-input-${input.name}`} className="text-xs">
                {input.name}
                {input.type && (
                  <span className="ml-1 text-[10px] text-muted-foreground">({input.type})</span>
                )}
              </Label>
              <Input
                id={`flow-input-${input.name}`}
                className="h-7 text-xs"
                value={inputValues[input.name] ?? ''}
                onChange={(e) =>
                  setInputValues((prev) => ({ ...prev, [input.name]: e.target.value }))
                }
                placeholder={input.defaultValue != null ? String(input.defaultValue) : undefined}
                disabled={isRunning}
              />
            </div>
          ))}
        </div>
      )}

      {/* Run button */}
      <Button
        size="sm"
        className="h-7 w-full gap-1 text-xs"
        disabled={isRunning || loading || missingRequiredInputs.length > 0}
        onClick={handleRun}
      >
        {isRunning ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Play className="size-3" />
        )}
        {isRunning ? t('executing') : t('run')}
      </Button>

      {missingRequiredInputs.length > 0 && (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-700">
          {t('missingRequiredInputs', { count: missingRequiredInputs.length })}
        </div>
      )}

      {/* Streaming progress */}
      {isRunning && executionOrder.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{completedCount} / {executionOrder.length}</span>
            {runningNode && (
              <span className="flex items-center gap-1">
                <Loader2 className="size-2.5 animate-spin" />
                {runningNode.nodeId}
              </span>
            )}
          </div>
          <div className="flex gap-0.5">
            {executionOrder.map((nodeId) => {
              const nr = nodeResults[nodeId];
              let bg = 'bg-muted';
              if (nr?.status === 'success') bg = 'bg-green-500';
              else if (nr?.status === 'error') bg = 'bg-red-500';
              else if (nr?.status === 'running') bg = 'bg-blue-500 animate-pulse';
              return (
                <div
                  key={nodeId}
                  className={`h-1 flex-1 rounded-full ${bg} transition-colors`}
                  title={`${nodeId}: ${nr?.status ?? 'pending'}`}
                />
              );
            })}
          </div>
        </div>
      )}

      {isRunning && executionOrder.length === 0 && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          {t('executing')}
        </div>
      )}

      {/* Completed status */}
      {traceStatus === 'success' && (
        <div className="flex items-center gap-1.5 text-xs text-green-600">
          <CheckCircle2 className="size-3" />
          {t('executionSuccess')}
        </div>
      )}

      {traceStatus === 'error' && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="size-3" />
            {t('executionFailed')}
          </div>
          {Object.values(nodeResults)
            .filter((r) => r.status === 'error' && r.error)
            .map((r) => (
              <div key={r.nodeId} className="rounded border border-destructive/30 bg-destructive/5 px-2 py-1 text-[10px] text-destructive">
                {r.nodeId}: {r.error}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

type SessionInteractionPanelProps = {
  run: RunView | null;
  loading: boolean;
  onContinue: (input?: string) => void;
  onStep: (input?: string) => void;
};

function SessionInteractionPanel({
  run,
  loading,
  onContinue,
  onStep,
}: SessionInteractionPanelProps) {
  const { t } = useTranslation('session');
  const [draftInput, setDraftInput] = useState('');

  useEffect(() => {
    if (!run?.waiting_for) {
      setDraftInput('');
      return;
    }

    if (run.waiting_for.kind === 'choice') {
      setDraftInput(run.waiting_for.options?.[0]?.value ?? '');
      return;
    }

    setDraftInput('');
  }, [run?.run_id, run?.waiting_for?.kind, run?.waiting_for?.step_id, run?.waiting_for?.options]);

  if (!run) {
    return null;
  }

  if (run.status === 'waiting_input' && run.waiting_for) {
    return (
      <div className="space-y-3 rounded-lg border bg-muted/20 px-3 py-3">
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">
            {run.waiting_for.kind === 'choice' ? t('runtime.chooseAction') : t('runtime.waitingInput')}
          </div>
          {run.waiting_for.prompt_text ? (
            <div className="text-sm">{run.waiting_for.prompt_text}</div>
          ) : null}
        </div>

        {run.waiting_for.kind === 'choice' ? (
          <div className="flex flex-wrap gap-2">
            {(run.waiting_for.options ?? []).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setDraftInput(option.value)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs transition-colors',
                  draftInput === option.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'hover:bg-muted',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            <Label className="text-xs">{t('runtime.textInput')}</Label>
            <Textarea
              value={draftInput}
              onChange={(event) => setDraftInput(event.target.value)}
              placeholder={t('runtime.inputPlaceholder')}
              className="min-h-[88px] text-sm"
              disabled={loading}
            />
          </div>
        )}

        <div className="flex gap-2">
          <Button
            size="sm"
            className="h-8 gap-1 text-xs"
            disabled={loading || (run.waiting_for.kind === 'choice' && !draftInput)}
            onClick={() => onContinue(draftInput)}
          >
            <Play className="size-3" />
            {t('runtime.continue')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            disabled={loading || (run.waiting_for.kind === 'choice' && !draftInput)}
            onClick={() => onStep(draftInput)}
          >
            {t('runtime.stepSubmit')}
          </Button>
        </div>
      </div>
    );
  }

  if (run.status === 'paused') {
    return (
      <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        {t('runtime.runPaused')}
      </div>
    );
  }

  if (run.status === 'ended') {
    return (
      <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        {t('runtime.runStopped')}
      </div>
    );
  }

  return null;
}

// ── Main Sidebar ──────────────────────────────────────────────────────

export function DebugStreamSidebar({ compact }: { compact?: boolean } = {}) {
  const { t } = useTranslation('debug');
  const {
    runs,
    selectedRun,
    selectedRunId,
    selectedTimeline,
    breakpoints,
    flowExecutionTrace,
    runCommandLoading: loading,
    runCommandError: error,
  } = useRunDebug();
  const { session } = useStudioResources();
  const { activeViewId } = useWorkbench();
  const { createRun, refreshRuns, selectRun, executeFlow, advanceRun, stepRun } = useStudioCommands();
  const { flowId: activeFlowId, flow: activeFlow } = useFlowResource();
  const setHighlightedNode = useCanvasSelection((s) => s.setHighlightedNode);
  const requestFitView = useCanvasSelection((s) => s.requestFitView);

  const [filter, setFilter] = useState<FilterKey>('all');
  const scrollRef = useRef<HTMLDivElement>(null);

  const flowInputs = activeFlow?.meta?.inputs ?? [];

  // Auto-scroll to latest entry
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [selectedTimeline.length]);

  // Initial load
  useEffect(() => {
    void refreshRuns().then((items) => {
      const activeRun = items.find((r) => r.active) ?? items[0] ?? null;
      if (activeRun) void selectRun(activeRun.run_id).catch(() => {});
    }).catch(() => {});
  }, [refreshRuns, selectRun]);

  // Hover → highlight node on canvas
  const handleEntryHover = useCallback((stepId: string | null | undefined) => {
    setHighlightedNode(stepId ?? null);
  }, [setHighlightedNode]);

  const handleEntryLeave = useCallback(() => {
    setHighlightedNode(null);
  }, [setHighlightedNode]);

  // Click → fitView to the node
  const handleEntryClick = useCallback((stepId: string | null | undefined) => {
    if (!stepId) return;
    requestFitView(stepId);
  }, [requestFitView]);

  const handleFlowExecute = useCallback((flowId: string, input: Record<string, unknown>) => {
    void executeFlow(flowId, input);
  }, [executeFlow]);

  const handleContinueWithInput = useCallback((input?: string) => {
    if (!selectedRunId) {
      return;
    }
    void advanceRun(selectedRunId, input);
  }, [advanceRun, selectedRunId]);

  const handleStepWithInput = useCallback((input?: string) => {
    if (!selectedRunId) {
      return;
    }
    void stepRun(selectedRunId, input);
  }, [selectedRunId, stepRun]);

  const filteredTimeline = selectedTimeline.filter((entry) => matchesFilter(entry, filter));
  const statusConfig = selectedRun ? getRunStatusConfig(selectedRun.status) : null;
  const StatusIcon = statusConfig?.icon;
  const showRunCreationActions =
    !selectedRun || selectedRun.status === 'ended' || selectedRun.status === 'error';

  return (
    <div className="flex h-full flex-col">
      {/* Header — hidden in compact mode (embedded in inspector tab) */}
      {!compact && (
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Bug className="size-4" />
            {t('title')}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={loading}
              onClick={() => void refreshRuns()}
            >
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            </Button>
          </div>
        </div>
      )}

      {/* Flow execution panel — shown when a flow is active */}
      {activeViewId === 'kal.flow' && activeFlowId && (
        <FlowExecutionPanel
          flowId={activeFlowId}
          inputs={flowInputs}
          trace={flowExecutionTrace}
          loading={loading}
          onExecute={handleFlowExecute}
        />
      )}

      {/* Run selector + actions */}
      <div className="space-y-2 border-b px-4 py-3">
        {showRunCreationActions ? (
          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="h-7 gap-1 text-xs"
              disabled={loading || !session}
              onClick={() => void createRun(true)}
            >
              <Play className="size-3" />
              {t('newRun')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              disabled={loading || !session}
              onClick={() => void createRun(true, 'step')}
            >
              {t('step')}
            </Button>
          </div>
        ) : null}

        {/* Active run status */}
        {selectedRun && StatusIcon && (
          <div className="flex items-center gap-2 text-xs">
            <div className={cn("rounded-full p-0.5", statusConfig!.bg)}>
              <StatusIcon className={cn("size-3", statusConfig!.color)} />
            </div>
            <span className="truncate font-medium">{selectedRun.run_id}</span>
            <span className={statusConfig!.color}>{t(`runStatusLabel.${selectedRun.status}`)}</span>
          </div>
        )}

        <SessionInteractionPanel
          run={selectedRun}
          loading={loading}
          onContinue={handleContinueWithInput}
          onStep={handleStepWithInput}
        />

        <StepControlToolbar />
        <DebugStateContextCard />

        {error && (
          <div className="rounded border border-destructive/50 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
            {error}
          </div>
        )}
      </div>

      {/* Run list (collapsed) */}
      {runs.length > 1 && (
        <div className="border-b px-4 py-2">
          <div className="flex flex-wrap gap-1">
            {runs.slice(0, 6).map((record) => {
              const cfg = getRunStatusConfig(record.run.status);
              return (
                <button
                  key={record.runId}
                  type="button"
                  onClick={() => void selectRun(record.runId)}
                  className={cn(
                    "rounded px-2 py-0.5 text-[10px] font-medium transition-colors",
                    selectedRunId === record.runId
                      ? "bg-primary text-primary-foreground"
                      : cn("hover:bg-muted", cfg.color),
                  )}
                >
                  {record.run.run_id.slice(-6)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-1 border-b px-4 py-2">
        <Filter className="size-3 text-muted-foreground" />
        {FILTER_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "rounded px-2 py-0.5 text-[10px] font-medium transition-colors",
              filter === key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {t(FILTER_I18N[key])}
          </button>
        ))}
      </div>

      {/* Timeline stream */}
      <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-3">
        {!selectedRun ? (
          <EmptyState message={t('noRuns')} compact />
        ) : filteredTimeline.length === 0 ? (
          <EmptyState message={t('trace.noEntries')} compact />
        ) : (
          <div className="space-y-2">
            {filteredTimeline.map((entry) => (
              <TraceEntryCard
                key={entry.id}
                entry={entry}
                onMouseEnter={() => handleEntryHover(entry.cursorStepId)}
                onMouseLeave={handleEntryLeave}
                onClick={() => handleEntryClick(entry.cursorStepId)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer: breakpoint count */}
      <div className="border-t px-4 py-2 text-[10px] text-muted-foreground">
        {t('stream.footerBreakpoints', { count: breakpoints.length })} · {t('stream.footerEvents', { count: selectedTimeline.length })}
      </div>
    </div>
  );
}
