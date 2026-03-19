/**
 * useNodeExecutionData — reads execution data for a specific node from the store.
 *
 * Returns the FlowExecutionNodeResult for the given nodeId if a matching
 * flowExecutionTrace exists, otherwise null.
 */
import { useRunDebug } from '@/kernel/hooks';
import { useWorkbench } from '@/kernel/hooks';
import type { FlowExecutionNodeResult } from '@/types/project';

export function useNodeExecutionData(nodeId: string | null): FlowExecutionNodeResult | null {
  const { flowExecutionTrace } = useRunDebug();
  const { activeFlowId } = useWorkbench();

  if (!nodeId || !flowExecutionTrace) return null;
  if (flowExecutionTrace.flowId !== activeFlowId) return null;
  return flowExecutionTrace.nodeResults[nodeId] ?? null;
}
