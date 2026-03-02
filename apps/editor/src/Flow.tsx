import { useState, useCallback, useEffect } from 'react';
import {
  Background,
  ReactFlow,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type FitViewOptions,
  type OnConnect,
  type OnNodesChange,
  type OnEdgesChange,
  type OnNodeDrag,
  type DefaultEdgeOptions,
  Controls,
  MiniMap,
} from '@xyflow/react';

import { BaseNodeFullDemo } from "./nodes/node-example";
import {
  AddStateNode,
  RemoveStateNode,
  ReadStateNode,
  ModifyStateNode,
  PromptBuildNode,
  MessageNode,
  GenerateTextNode,
  GenerateImageNode,
  SignalInNode,
  SignalOutNode,
  TimerNode,
  RegexNode,
  JSONParseNode,
  PostProcessNode,
  SubFlowNode,
} from "./nodes";
import { PaneContextMenu, type ContextMenuState } from "./PaneContextMenu";
import { FlowToolbar } from "./components/FlowToolbar";
import { useProjectStore } from "@/store/projectStore";
import { NODE_DEFAULTS } from "./nodes/defaults";
import type { FlowDefinition } from "@/types/project";


const nodeTypes = {
  baseNodeFull: BaseNodeFullDemo,
  // State nodes
  AddState: AddStateNode,
  RemoveState: RemoveStateNode,
  ReadState: ReadStateNode,
  ModifyState: ModifyStateNode,
  // LLM nodes
  PromptBuild: PromptBuildNode,
  Message: MessageNode,
  GenerateText: GenerateTextNode,
  GenerateImage: GenerateImageNode,
  // Signal nodes
  SignalIn: SignalInNode,
  SignalOut: SignalOutNode,
  Timer: TimerNode,
  // Transform nodes
  Regex: RegexNode,
  JSONParse: JSONParseNode,
  PostProcess: PostProcessNode,
  SubFlow: SubFlowNode,
};

const fitViewOptions: FitViewOptions = {
  padding: 100,
};

const defaultEdgeOptions: DefaultEdgeOptions = {
  animated: true,
};

const onNodeDrag: OnNodeDrag = (_, node) => {
  console.log('drag event', node.data);
};

export default function Flow() {
  const project = useProjectStore((state) => state.project);
  const currentFlow = useProjectStore((state) => state.currentFlow);
  const saveFlow = useProjectStore((state) => state.saveFlow);

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    open: false,
    x: 0,
    y: 0,
  });

  // Load flow data when project or currentFlow changes
  useEffect(() => {
    if (project && currentFlow && project.flows[currentFlow]) {
      const flowDef = project.flows[currentFlow];

      // Convert flow definition to ReactFlow nodes
      const reactFlowNodes: Node[] = flowDef.nodes.map((node) => {
        const defaults = NODE_DEFAULTS[node.type];
        return {
          id: node.id,
          type: node.type,
          position: node.position,
          data: {
            label: node.label || defaults?.label || node.type,
            config: { ...defaults?.config, ...node.config },
            inputs: node.inputs?.length ? node.inputs : defaults?.inputs || [],
            outputs: node.outputs?.length ? node.outputs : defaults?.outputs || [],
          },
        };
      });

      // Convert flow definition to ReactFlow edges
      const reactFlowEdges: Edge[] = flowDef.edges.map((edge, idx) => ({
        id: `e-${edge.source}-${edge.target}-${idx}`,
        source: edge.source,
        sourceHandle: edge.sourceHandle,
        target: edge.target,
        targetHandle: edge.targetHandle,
      }));

      setNodes(reactFlowNodes);
      setEdges(reactFlowEdges);
    }
  }, [project, currentFlow]);

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      setContextMenu({
        open: true,
        x: event.clientX,
        y: event.clientY,
      });
    },
    [],
  );

  const addNodeAtPosition = useCallback(
    (position: { x: number; y: number }, nodeType: string) => {
      const defaults = NODE_DEFAULTS[nodeType];
      setNodes((nds) => [
        ...nds,
        {
          id: `${nodeType}-${Date.now()}`,
          position,
          data: {
            label: defaults?.label || nodeType,
            config: defaults?.config ? { ...defaults.config } : {},
            inputs: defaults?.inputs || [],
            outputs: defaults?.outputs || [],
          },
          type: nodeType,
        },
      ]);
    },
    [],
  );

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [setNodes],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges],
  );

  const onConnect: OnConnect = useCallback(
    (connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges],
  );

  // Auto-save flow when nodes or edges change
  useEffect(() => {
    if (!project || !currentFlow || nodes.length === 0) return;

    // Dispatch saving event
    window.dispatchEvent(new Event('flow:saving'));

    const timeoutId = setTimeout(async () => {
      const flowDef: FlowDefinition = {
        schemaVersion: "1.0",
        nodes: nodes.map((node) => ({
          id: node.id,
          type: node.type || 'default',
          label: String(node.data.label || node.type || 'Node'),
          position: node.position,
          inputs: Array.isArray(node.data.inputs) ? node.data.inputs : [],
          outputs: Array.isArray(node.data.outputs) ? node.data.outputs : [],
          config: node.data.config || {},
        })),
        edges: edges.map((edge) => ({
          source: edge.source,
          sourceHandle: edge.sourceHandle || '',
          target: edge.target,
          targetHandle: edge.targetHandle || '',
        })),
      };

      try {
        await saveFlow(currentFlow, flowDef);
        window.dispatchEvent(new Event('flow:saved'));
      } catch (error) {
        console.error('Auto-save failed:', error);
        window.dispatchEvent(new Event('flow:error'));
      }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [nodes, edges, project, currentFlow, saveFlow]);

  const handleExportFlow = useCallback(() => {
    if (!project || !currentFlow) return;

    const flowDef = project.flows[currentFlow];
    const dataStr = JSON.stringify(flowDef, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentFlow}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [project, currentFlow]);

  const handleRunFlow = useCallback(() => {
    alert('Flow 执行功能待实现（需要 Engine API 支持）');
  }, []);

  const handleManualSave = useCallback(async () => {
    if (!project || !currentFlow || nodes.length === 0) return;

    window.dispatchEvent(new Event('flow:saving'));

    const flowDef: FlowDefinition = {
      schemaVersion: "1.0",
      nodes: nodes.map((node) => ({
        id: node.id,
        type: node.type || 'default',
        label: String(node.data.label || node.type || 'Node'),
        position: node.position,
        inputs: Array.isArray(node.data.inputs) ? node.data.inputs : [],
        outputs: Array.isArray(node.data.outputs) ? node.data.outputs : [],
        config: node.data.config || {},
      })),
      edges: edges.map((edge) => ({
        source: edge.source,
        sourceHandle: edge.sourceHandle || '',
        target: edge.target,
        targetHandle: edge.targetHandle || '',
      })),
    };

    try {
      await saveFlow(currentFlow, flowDef);
      window.dispatchEvent(new Event('flow:saved'));
    } catch (error) {
      console.error('Manual save failed:', error);
      window.dispatchEvent(new Event('flow:error'));
      alert('保存失败: ' + (error as Error).message);
    }
  }, [nodes, edges, project, currentFlow, saveFlow]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleManualSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleManualSave]);

  return (
    <div className="relative h-full w-full">
      <FlowToolbar
        onSave={handleManualSave}
        onExport={handleExportFlow}
        onRun={handleRunFlow}
      />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDrag={onNodeDrag}
        onPaneContextMenu={onPaneContextMenu}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={fitViewOptions}
        defaultEdgeOptions={defaultEdgeOptions}>
          <Background />
          <Controls />
          <MiniMap
            nodeColor={(node) => {
              if (node.type === 'SignalIn') return '#22c55e';
              if (node.type === 'SignalOut') return '#3b82f6';
              return '#94a3b8';
            }}
            maskColor="rgba(0, 0, 0, 0.1)"
          />
          <PaneContextMenu
            menu={contextMenu}
            onClose={() => setContextMenu((m) => ({ ...m, open: false }))}
            onAddNode={addNodeAtPosition}
          />
      </ReactFlow>
    </div>
  );
}
