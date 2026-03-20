import { useMemo } from 'react';
import { Database } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCanvasSelection } from '@/hooks/use-canvas-selection';
import { useFlowResource, useRunDebug, useStudioResources, useWorkbench } from '@/kernel/hooks';
import {
  buildRelatedStateEntries,
  formatStatePreview,
  getFlowNodeStateKeys,
  getFlowTraceStateKeys,
  getSessionStepStateKeys,
} from '@/utils/debug-state-context';

export function DebugStateContextCard() {
  const { t } = useTranslation('debug');
  const { activeViewId } = useWorkbench();
  const { project, session } = useStudioResources();
  const { flow } = useFlowResource();
  const { selectedRun, selectedRunState, flowExecutionTrace } = useRunDebug();
  const selectedNodeId = useCanvasSelection((state) => state.selectedNodeId);
  const selectionContext = useCanvasSelection((state) => state.selectionContext);

  const context = useMemo(() => {
    const currentStepId = selectedRun?.waiting_for?.step_id ?? selectedRun?.cursor.currentStepId ?? null;

    if (selectionContext === 'flow' && selectedNodeId) {
      const keys = getFlowNodeStateKeys(flow, selectedNodeId);
      if (keys.length === 0) {
        return null;
      }
      return {
        subtitle: t('stateContext.flowNodeSubtitle', { id: selectedNodeId }),
        entries: buildRelatedStateEntries(
          flowExecutionTrace?.stateAfter ?? project?.state,
          keys,
          flowExecutionTrace?.changedStateKeys ?? [],
        ),
      };
    }

    if (selectionContext === 'session' && selectedNodeId) {
      const keys = getSessionStepStateKeys(session, selectedNodeId);
      if (keys.length === 0) {
        return null;
      }
      return {
        subtitle: t('stateContext.sessionStepSubtitle', { id: selectedNodeId }),
        entries: buildRelatedStateEntries(
          selectedRunState?.state ?? project?.state,
          keys,
          selectedRun?.state_summary.changed ?? [],
        ),
      };
    }

    if (activeViewId === 'kal.session' && currentStepId) {
      const keys = getSessionStepStateKeys(session, currentStepId);
      if (keys.length === 0) {
        return null;
      }
      return {
        subtitle: t('stateContext.sessionCurrentSubtitle', { id: currentStepId }),
        entries: buildRelatedStateEntries(
          selectedRunState?.state ?? project?.state,
          keys,
          selectedRun?.state_summary.changed ?? [],
        ),
      };
    }

    if (activeViewId === 'kal.flow' && flowExecutionTrace) {
      const keys = getFlowTraceStateKeys(flow, flowExecutionTrace?.executionOrder);
      if (keys.length === 0) {
        return null;
      }
      return {
        subtitle: t('stateContext.flowTraceSubtitle'),
        entries: buildRelatedStateEntries(
          flowExecutionTrace?.stateAfter ?? project?.state,
          keys,
          flowExecutionTrace?.changedStateKeys ?? [],
        ),
      };
    }

    return null;
  }, [
    activeViewId,
    flow,
    flowExecutionTrace,
    project?.state,
    selectedNodeId,
    selectedRun,
    selectedRunState?.state,
    selectionContext,
    session,
    t,
  ]);

  if (!context || context.entries.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Database className="size-4" />
        {t('stateContext.title')}
      </div>
      <p className="text-xs text-muted-foreground">{context.subtitle}</p>
      <div className="space-y-2">
        {context.entries.slice(0, 8).map((entry) => (
          <div key={entry.key} className="rounded-lg border px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-xs">{entry.key}</span>
              <div className="flex items-center gap-2">
                {entry.changed ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    {t('stateContext.changed')}
                  </span>
                ) : null}
                <span className="text-[10px] text-muted-foreground">
                  {entry.type ?? t('stateContext.unknownType')}
                </span>
              </div>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {formatStatePreview(entry.value)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
