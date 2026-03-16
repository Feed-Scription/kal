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
  }>;
  sessionChanged: boolean;
  beforeSessionSteps: number;
  afterSessionSteps: number;
};

function sameFlow(left: FlowDefinition | undefined, right: FlowDefinition | undefined) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export function compareSnapshot(snapshot: RestorableSnapshot, project: ProjectData): SemanticCompareSummary {
  const beforeFlowNames = Object.keys(snapshot.flows);
  const afterFlowNames = Object.keys(project.flows);
  const addedFlows = afterFlowNames.filter((flowName) => !snapshot.flows[flowName]);
  const removedFlows = beforeFlowNames.filter((flowName) => !project.flows[flowName]);
  const changedFlows = beforeFlowNames
    .filter((flowName) => project.flows[flowName] && !sameFlow(snapshot.flows[flowName], project.flows[flowName]))
    .map((flowName) => ({
      flowName,
      beforeNodes: snapshot.flows[flowName]?.data.nodes.length ?? 0,
      afterNodes: project.flows[flowName]?.data.nodes.length ?? 0,
      beforeEdges: snapshot.flows[flowName]?.data.edges.length ?? 0,
      afterEdges: project.flows[flowName]?.data.edges.length ?? 0,
    }));
  const sessionChanged = JSON.stringify(snapshot.session ?? null) !== JSON.stringify(project.session ?? null);

  return {
    addedFlows,
    removedFlows,
    changedFlows,
    sessionChanged,
    beforeSessionSteps: snapshot.session?.steps.length ?? 0,
    afterSessionSteps: project.session?.steps.length ?? 0,
  };
}
