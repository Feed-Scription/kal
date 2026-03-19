/**
 * useEdgeExecutionState — derives edge visual state from execution data.
 *
 * Two modes:
 * - Flow: from flowExecutionTrace.nodeResults / executionOrder
 * - Session: from selectedTimeline cursorStepId sequence
 *
 * Edges connecting executed nodes get highlighted; the currently active edge
 * (leading into a running node) gets an animated pulse.
 */
import { useMemo } from 'react';
import { useRunDebug } from '@/kernel/hooks';

export type EdgeExecutionStatus = 'active' | 'executed' | null;

/**
 * Flow mode: Returns a Map<edgeKey, status> where edgeKey is "source->target".
 * - 'active': the edge leads into a currently running node
 * - 'executed': both source and target nodes have completed successfully
 */
export function useEdgeExecutionState(flowId: string | null): Map<string, EdgeExecutionStatus> {
  const { flowExecutionTrace } = useRunDebug();

  return useMemo(() => {
    const map = new Map<string, EdgeExecutionStatus>();
    const trace = flowExecutionTrace?.flowId === flowId ? flowExecutionTrace : null;
    if (!trace) return map;

    const results = trace.nodeResults;
    const order = trace.executionOrder;

    for (const [nodeId, result] of Object.entries(results)) {
      if (result.status === 'running') {
        // Find predecessor nodes that completed — their edges to this node are "active"
        for (const [otherId, otherResult] of Object.entries(results)) {
          if (otherId !== nodeId && (otherResult.status === 'success' || otherResult.status === 'error')) {
            map.set(`${otherId}->${nodeId}`, 'active');
          }
        }
      } else if (result.status === 'success') {
        // Edges between two completed nodes are "executed"
        for (const [otherId, otherResult] of Object.entries(results)) {
          if (otherId !== nodeId && otherResult.status === 'success') {
            const otherIdx = order.indexOf(otherId);
            const thisIdx = order.indexOf(nodeId);
            if (otherIdx >= 0 && thisIdx >= 0 && otherIdx < thisIdx) {
              map.set(`${otherId}->${nodeId}`, 'executed');
            }
          }
        }
      }
    }

    return map;
  }, [flowId, flowExecutionTrace]);
}

/**
 * Session mode: derives edge state from the timeline's cursorStepId sequence.
 * - Consecutive step transitions (A → B) mark edge A->B as 'executed'
 * - The edge leading into the current (latest) step is 'active' if the run
 *   is still in progress (not ended/error)
 */
export function useSessionEdgeExecutionState(): Map<string, EdgeExecutionStatus> {
  const { selectedTimeline, selectedRun } = useRunDebug();

  return useMemo(() => {
    const map = new Map<string, EdgeExecutionStatus>();
    if (selectedTimeline.length === 0) return map;

    // Extract ordered step transitions from the timeline
    const stepSequence: string[] = [];
    for (const entry of selectedTimeline) {
      if (entry.cursorStepId && stepSequence[stepSequence.length - 1] !== entry.cursorStepId) {
        stepSequence.push(entry.cursorStepId);
      }
    }

    if (stepSequence.length < 2) return map;

    // Mark consecutive transitions as executed
    for (let i = 0; i < stepSequence.length - 1; i++) {
      map.set(`${stepSequence[i]}->${stepSequence[i + 1]}`, 'executed');
    }

    // If the run is still active, the last transition edge is 'active' instead
    const isActive = selectedRun && selectedRun.status !== 'ended' && selectedRun.status !== 'error';
    if (isActive && stepSequence.length >= 2) {
      const lastKey = `${stepSequence[stepSequence.length - 2]}->${stepSequence[stepSequence.length - 1]}`;
      map.set(lastKey, 'active');
    }

    return map;
  }, [selectedTimeline, selectedRun]);
}
