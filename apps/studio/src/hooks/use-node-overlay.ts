/**
 * 节点 Overlay 状态派生 hook
 *
 * 将 runDebug + diagnostics + flowExecutionTrace + pinnedNodeData 数据索引化为节点可直接消费的 Map。
 * 纯视图派生逻辑，不改 store，不改 kernel hooks。
 */

import { useMemo } from 'react';
import { useRunDebug, useDiagnostics } from '@/kernel/hooks';
import type { DiagnosticPayload, RunEvent } from '@/types/project';

export type FlowNodeExecutionStatus = 'running' | 'success' | 'error' | 'skipped' | null;

/** Context shown on hover when a run is paused at this node */
export type PauseContext = {
  recentEvents: RunEvent[];
  changedValues: Record<string, { old: any; new: any }>;
};

export type NodeOverlayState = {
  execution: 'current' | 'waiting' | 'visited' | null;
  /** Flow execution status from streaming trace (Phase 1) */
  executionStatus: FlowNodeExecutionStatus;
  hasBreakpoint: boolean;
  /** Phase 5: node output is pinned (frozen) */
  isPinned: boolean;
  diagnosticSeverity: 'error' | 'warning' | null;
  diagnosticCount: number;
  /** Pause context for tooltip when run is paused at this node */
  pauseContext: PauseContext | null;
};

function severityOf(diagnostic: DiagnosticPayload): 'error' | 'warning' {
  if (diagnostic.code === 'UNUSED_FLOW') return 'warning';
  if (diagnostic.code === 'LINT_FAILED') return 'error';
  return diagnostic.phase === 'cli' ? 'warning' : 'error';
}

/**
 * Session 画布节点 overlay — node.id 即 step.id
 */
export function useSessionNodeOverlay(): Map<string, NodeOverlayState> {
  const {
    selectedStepId,
    selectedWaitingStepId,
    selectedRun,
    breakpoints,
    selectedTimeline,
  } = useRunDebug();
  const { diagnostics: report } = useDiagnostics();

  return useMemo(() => {
    const map = new Map<string, NodeOverlayState>();

    // 从 timeline 收集所有经过的 stepId（visited）
    const visitedStepIds = new Set<string>();
    for (const entry of selectedTimeline) {
      if (entry.cursorStepId) {
        visitedStepIds.add(entry.cursorStepId);
      }
    }

    // 断点索引
    const breakpointSet = new Set(breakpoints.map((bp) => bp.step_id));

    // 诊断按 stepId 聚合
    const diagByStep = new Map<string, { severity: 'error' | 'warning'; count: number }>();
    for (const d of report?.diagnostics ?? []) {
      if (!d.stepId) continue;
      const sev = severityOf(d);
      const existing = diagByStep.get(d.stepId);
      if (!existing) {
        diagByStep.set(d.stepId, { severity: sev, count: 1 });
      } else {
        existing.count += 1;
        if (sev === 'error') existing.severity = 'error';
      }
    }

    // 合并所有涉及的 nodeId
    const allIds = new Set([
      ...visitedStepIds,
      ...breakpointSet,
      ...diagByStep.keys(),
      ...(selectedStepId ? [selectedStepId] : []),
      ...(selectedWaitingStepId ? [selectedWaitingStepId] : []),
    ]);

    for (const nodeId of allIds) {
      let execution: NodeOverlayState['execution'] = null;
      if (nodeId === selectedWaitingStepId) {
        execution = 'waiting';
      } else if (nodeId === selectedStepId) {
        execution = 'current';
      } else if (visitedStepIds.has(nodeId)) {
        execution = 'visited';
      }

      // Build pause context for the waiting/current node
      let pauseContext: PauseContext | null = null;
      if (execution === 'waiting' || execution === 'current') {
        pauseContext = {
          recentEvents: selectedRun?.recent_events ?? [],
          changedValues: selectedRun?.state_summary.changed_values ?? {},
        };
      }

      const diag = diagByStep.get(nodeId);

      map.set(nodeId, {
        execution,
        executionStatus: null,
        hasBreakpoint: breakpointSet.has(nodeId),
        isPinned: false,
        diagnosticSeverity: diag?.severity ?? null,
        diagnosticCount: diag?.count ?? 0,
        pauseContext,
      });
    }

    return map;
  }, [selectedStepId, selectedWaitingStepId, selectedRun, breakpoints, selectedTimeline, report]);
}

/**
 * Flow 画布节点 overlay — 按 flowId + nodeId 匹配诊断 + execution trace + pinned data
 */
export function useFlowNodeOverlay(flowId: string | null): Map<string, NodeOverlayState> {
  const { diagnostics: report } = useDiagnostics();
  const { flowExecutionTrace, pinnedNodeData } = useRunDebug();

  return useMemo(() => {
    const map = new Map<string, NodeOverlayState>();
    if (!flowId) return map;

    // Merge execution trace data (from streaming flow execution)
    const trace = flowExecutionTrace?.flowId === flowId ? flowExecutionTrace : null;
    if (trace) {
      for (const [nodeId, result] of Object.entries(trace.nodeResults)) {
        map.set(nodeId, {
          execution: null,
          executionStatus: result.status,
          hasBreakpoint: false,
          isPinned: nodeId in pinnedNodeData,
          diagnosticSeverity: null,
          diagnosticCount: 0,
          pauseContext: null,
        });
      }
    }

    // Merge pinned nodes that aren't already in the map
    for (const nodeId of Object.keys(pinnedNodeData)) {
      if (!map.has(nodeId)) {
        map.set(nodeId, {
          execution: null,
          executionStatus: null,
          hasBreakpoint: false,
          isPinned: true,
          diagnosticSeverity: null,
          diagnosticCount: 0,
          pauseContext: null,
        });
      }
    }

    // Merge diagnostics
    for (const d of report?.diagnostics ?? []) {
      if (d.flowId !== flowId || !d.nodeId) continue;
      const sev = severityOf(d);
      const existing = map.get(d.nodeId);
      if (!existing) {
        map.set(d.nodeId, {
          execution: null,
          executionStatus: null,
          hasBreakpoint: false,
          isPinned: d.nodeId in pinnedNodeData,
          diagnosticSeverity: sev,
          diagnosticCount: 1,
          pauseContext: null,
        });
      } else {
        existing.diagnosticCount += 1;
        if (sev === 'error') existing.diagnosticSeverity = 'error';
        else if (!existing.diagnosticSeverity) existing.diagnosticSeverity = sev;
      }
    }

    return map;
  }, [flowId, report, flowExecutionTrace, pinnedNodeData]);
}

/** 根据 overlay state 生成 CSS class 字符串 */
export function overlayClassName(overlay?: NodeOverlayState | null): string {
  if (!overlay) return '';
  const classes: string[] = [];

  // Flow execution status takes priority during active execution
  if (overlay.executionStatus === 'running') classes.push('node-overlay-current');
  else if (overlay.executionStatus === 'success') classes.push('node-overlay-visited');
  else if (overlay.executionStatus === 'error') classes.push('node-overlay-error');
  // Session execution state
  else if (overlay.execution === 'current') classes.push('node-overlay-current');
  else if (overlay.execution === 'waiting') classes.push('node-overlay-waiting');
  else if (overlay.execution === 'visited') classes.push('node-overlay-visited');

  // Diagnostics (only if no execution status is active)
  if (!overlay.executionStatus && !overlay.execution) {
    if (overlay.diagnosticSeverity === 'error') classes.push('node-overlay-error');
    else if (overlay.diagnosticSeverity === 'warning') classes.push('node-overlay-warning');
  }

  return classes.join(' ');
}
