/**
 * 节点 Overlay 状态派生 hook
 *
 * 将 runDebug + diagnostics 数据索引化为节点可直接消费的 Map。
 * 纯视图派生逻辑，不改 store，不改 kernel hooks。
 */

import { useMemo } from 'react';
import { useRunDebug, useDiagnostics } from '@/kernel/hooks';
import type { DiagnosticPayload } from '@/types/project';

export type NodeOverlayState = {
  execution: 'current' | 'waiting' | 'visited' | null;
  hasBreakpoint: boolean;
  diagnosticSeverity: 'error' | 'warning' | null;
  diagnosticCount: number;
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

      const diag = diagByStep.get(nodeId);

      map.set(nodeId, {
        execution,
        hasBreakpoint: breakpointSet.has(nodeId),
        diagnosticSeverity: diag?.severity ?? null,
        diagnosticCount: diag?.count ?? 0,
      });
    }

    return map;
  }, [selectedStepId, selectedWaitingStepId, breakpoints, selectedTimeline, report]);
}

/**
 * Flow 画布节点 overlay — 按 flowId + nodeId 匹配诊断
 */
export function useFlowNodeOverlay(flowId: string | null): Map<string, NodeOverlayState> {
  const { diagnostics: report } = useDiagnostics();

  return useMemo(() => {
    const map = new Map<string, NodeOverlayState>();
    if (!flowId) return map;

    for (const d of report?.diagnostics ?? []) {
      if (d.flowId !== flowId || !d.nodeId) continue;
      const sev = severityOf(d);
      const existing = map.get(d.nodeId);
      if (!existing) {
        map.set(d.nodeId, {
          execution: null,
          hasBreakpoint: false,
          diagnosticSeverity: sev,
          diagnosticCount: 1,
        });
      } else {
        existing.diagnosticCount += 1;
        if (sev === 'error') existing.diagnosticSeverity = 'error';
      }
    }

    return map;
  }, [flowId, report]);
}

/** 根据 overlay state 生成 CSS class 字符串 */
export function overlayClassName(overlay?: NodeOverlayState | null): string {
  if (!overlay) return '';
  const classes: string[] = [];
  if (overlay.execution === 'current') classes.push('node-overlay-current');
  else if (overlay.execution === 'waiting') classes.push('node-overlay-waiting');
  else if (overlay.execution === 'visited') classes.push('node-overlay-visited');
  if (overlay.diagnosticSeverity === 'error') classes.push('node-overlay-error');
  else if (overlay.diagnosticSeverity === 'warning') classes.push('node-overlay-warning');
  return classes.join(' ');
}
