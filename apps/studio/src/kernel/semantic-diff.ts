import type { FlowDefinition, ProjectData, RestorableSnapshot } from '@/types/project';

export type SemanticCompareSummary = {
  addedFlows: string[];
  removedFlows: string[];
  changedFlows: Array<{
    flowName: string;
    beforeNodes: number;
    afterNodes: number;
    beforeEdges: number;
    afterEdges: number;
    addedNodes?: string[];
    removedNodes?: string[];
    changedNodes?: Array<{ nodeId: string; changes: string[] }>;
    addedEdges?: number;
    removedEdges?: number;
  }>;
  sessionChanged: boolean;
  beforeSessionSteps: number;
  afterSessionSteps: number;
  sessionDiff?: {
    addedSteps: string[];
    removedSteps: string[];
    changedSteps: Array<{ stepId: string; changes: string[] }>;
  };
  configChanged?: boolean;
  stateChanged?: boolean;
};

function sameFlow(left: FlowDefinition | undefined, right: FlowDefinition | undefined) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function edgeKey(edge: { source: string; sourceHandle: string; target: string; targetHandle: string }): string {
  return `${edge.source}:${edge.sourceHandle}->${edge.target}:${edge.targetHandle}`;
}

function diffFlowDetail(before: FlowDefinition, after: FlowDefinition) {
  const beforeNodeIds = new Set(before.data.nodes.map((n) => n.id));
  const afterNodeIds = new Set(after.data.nodes.map((n) => n.id));

  const addedNodes = [...afterNodeIds].filter((id) => !beforeNodeIds.has(id));
  const removedNodes = [...beforeNodeIds].filter((id) => !afterNodeIds.has(id));

  const changedNodes: Array<{ nodeId: string; changes: string[] }> = [];
  const beforeNodeMap = new Map(before.data.nodes.map((n) => [n.id, n]));
  const afterNodeMap = new Map(after.data.nodes.map((n) => [n.id, n]));
  for (const nodeId of beforeNodeIds) {
    if (!afterNodeIds.has(nodeId)) continue;
    const bNode = beforeNodeMap.get(nodeId)!;
    const aNode = afterNodeMap.get(nodeId)!;
    const changes: string[] = [];
    if (bNode.type !== aNode.type) changes.push(`type: ${bNode.type} → ${aNode.type}`);
    if (bNode.label !== aNode.label) changes.push(`label: ${bNode.label ?? '(none)'} → ${aNode.label ?? '(none)'}`);
    if (JSON.stringify(bNode.config ?? {}) !== JSON.stringify(aNode.config ?? {})) changes.push('config changed');
    if (changes.length > 0) changedNodes.push({ nodeId, changes });
  }

  const beforeEdgeKeys = new Set(before.data.edges.map(edgeKey));
  const afterEdgeKeys = new Set(after.data.edges.map(edgeKey));
  const addedEdges = [...afterEdgeKeys].filter((k) => !beforeEdgeKeys.has(k)).length;
  const removedEdges = [...beforeEdgeKeys].filter((k) => !afterEdgeKeys.has(k)).length;

  return { addedNodes, removedNodes, changedNodes, addedEdges, removedEdges };
}

function diffSession(before: RestorableSnapshot['session'], after: ProjectData['session']) {
  if (!before && !after) return undefined;
  const beforeStepIds = new Set((before?.steps ?? []).map((s) => s.id));
  const afterStepIds = new Set((after?.steps ?? []).map((s) => s.id));

  const addedSteps = [...afterStepIds].filter((id) => !beforeStepIds.has(id));
  const removedSteps = [...beforeStepIds].filter((id) => !afterStepIds.has(id));

  const beforeStepMap = new Map((before?.steps ?? []).map((s) => [s.id, s]));
  const afterStepMap = new Map((after?.steps ?? []).map((s) => [s.id, s]));
  const changedSteps: Array<{ stepId: string; changes: string[] }> = [];
  for (const stepId of beforeStepIds) {
    if (!afterStepIds.has(stepId)) continue;
    const bStep = beforeStepMap.get(stepId)!;
    const aStep = afterStepMap.get(stepId)!;
    if (JSON.stringify(bStep) !== JSON.stringify(aStep)) {
      const changes: string[] = [];
      if (bStep.type !== aStep.type) changes.push(`type: ${bStep.type} → ${aStep.type}`);
      if ('flowRef' in bStep && 'flowRef' in aStep && bStep.flowRef !== aStep.flowRef) {
        changes.push(`flowRef: ${bStep.flowRef} → ${aStep.flowRef}`);
      }
      if ('next' in bStep && 'next' in aStep && bStep.next !== aStep.next) {
        changes.push(`next: ${bStep.next} → ${aStep.next}`);
      }
      if (changes.length === 0) changes.push('content changed');
      changedSteps.push({ stepId, changes });
    }
  }

  return { addedSteps, removedSteps, changedSteps };
}

export function compareSnapshot(snapshot: RestorableSnapshot, project: ProjectData): SemanticCompareSummary {
  const beforeFlowNames = Object.keys(snapshot.flows);
  const afterFlowNames = Object.keys(project.flows);
  const addedFlows = afterFlowNames.filter((flowName) => !snapshot.flows[flowName]);
  const removedFlows = beforeFlowNames.filter((flowName) => !project.flows[flowName]);
  const changedFlows = beforeFlowNames
    .filter((flowName) => project.flows[flowName] && !sameFlow(snapshot.flows[flowName], project.flows[flowName]))
    .map((flowName) => {
      const before = snapshot.flows[flowName]!;
      const after = project.flows[flowName]!;
      const detail = diffFlowDetail(before, after);
      return {
        flowName,
        beforeNodes: before.data.nodes.length,
        afterNodes: after.data.nodes.length,
        beforeEdges: before.data.edges.length,
        afterEdges: after.data.edges.length,
        ...detail,
      };
    });
  const sessionChanged = JSON.stringify(snapshot.session ?? null) !== JSON.stringify(project.session ?? null);
  const sessionDiff = sessionChanged ? diffSession(snapshot.session, project.session) : undefined;

  const configChanged = snapshot.config
    ? JSON.stringify(snapshot.config) !== JSON.stringify(project.config)
    : false;
  const stateChanged = snapshot.state
    ? JSON.stringify(snapshot.state) !== JSON.stringify(project.state)
    : false;

  return {
    addedFlows,
    removedFlows,
    changedFlows,
    sessionChanged,
    beforeSessionSteps: snapshot.session?.steps.length ?? 0,
    afterSessionSteps: project.session?.steps.length ?? 0,
    sessionDiff,
    configChanged,
    stateChanged,
  };
}
