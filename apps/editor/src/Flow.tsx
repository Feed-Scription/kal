import { useState, useCallback } from 'react';
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


const initialNodes: Node[] = [
  {
    id: "0",
    position: { x: 200, y: 200 },
    data: {},
    type: "baseNodeFull",
  },
  { id: '1', data: { label: 'Node 1' }, position: { x: 5, y: 5 } },
  { id: '2', data: { label: 'Node 2' }, position: { x: 5, y: 100 } },
];

const initialEdges: Edge[] = [{ id: 'e1-2', source: '1', target: '2' }];

const fitViewOptions: FitViewOptions = {
  padding: "100px",
};

const defaultEdgeOptions: DefaultEdgeOptions = {
  animated: true,
};

const onNodeDrag: OnNodeDrag = (_, node) => {
  console.log('drag event', node.data);
};

export default function Flow() {
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    open: false,
    x: 0,
    y: 0,
  });

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
      setNodes((nds) => [
        ...nds,
        {
          id: `${nodeType}-${Date.now()}`,
          position,
          data: {},
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

  return (
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
        <PaneContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu((m) => ({ ...m, open: false }))}
          onAddNode={addNodeAtPosition}
        />
    </ReactFlow>
  );
}



// export default function App() {
//   return (
//     <div className="h-full w-full">
//       <ReactFlow
//         defaultNodes={defaultNodes}
//         nodeTypes={nodeTypes}
//         fitView
//         fitViewOptions={fitViewOptions}
//       >
//         <Background />
//       </ReactFlow>
//     </div>
//   );
// }
