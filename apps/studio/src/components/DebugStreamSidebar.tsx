/**
 * DebugStreamSidebar — real-time debug message stream.
 *
 * Replaces DebuggerView as the primary debug UI (architecture constraint #3).
 * Consumes store state exclusively (constraint #2). All commands go through
 * useStudioCommands (constraint #4).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bug, Filter, Play, Rocket, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { TraceEntryCard } from '@/components/TraceEntryCard';
import { StepControlToolbar } from '@/components/StepControlToolbar';
import { useRunDebug, useStudioCommands } from '@/kernel/hooks';
import { useCanvasSelection } from '@/hooks/use-canvas-selection';
import { getRunStatusConfig } from '@/utils/run-status';
import { cn } from '@/lib/utils';
import type { TraceTimelineEntry } from '@/types/project';

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

export function DebugStreamSidebar() {
  const { t } = useTranslation('debug');
  const {
    runs,
    selectedRun,
    selectedRunId,
    selectedTimeline,
    breakpoints,
    runCommandLoading: loading,
    runCommandError: error,
  } = useRunDebug();
  const { createRun, createSmokeRun, refreshRuns, selectRun } = useStudioCommands();
  const setHighlightedNode = useCanvasSelection((s) => s.setHighlightedNode);
  const requestFitView = useCanvasSelection((s) => s.requestFitView);

  const [filter, setFilter] = useState<FilterKey>('all');
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const filteredTimeline = selectedTimeline.filter((entry) => matchesFilter(entry, filter));
  const statusConfig = selectedRun ? getRunStatusConfig(selectedRun.status) : null;
  const StatusIcon = statusConfig?.icon;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
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

      {/* Run selector + actions */}
      <div className="space-y-2 border-b px-4 py-3">
        <div className="flex gap-1.5">
          <Button
            size="sm"
            className="h-7 gap-1 text-xs"
            disabled={loading}
            onClick={() => void createRun(true)}
          >
            <Play className="size-3" />
            {t('newRun')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            disabled={loading}
            onClick={() => void createSmokeRun()}
          >
            <Rocket className="size-3" />
            {t('stream.smokeRun')}
          </Button>
        </div>

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

        {/* Step control toolbar (visible when paused) */}
        <StepControlToolbar />

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
