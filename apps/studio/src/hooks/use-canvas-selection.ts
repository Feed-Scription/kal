/**
 * 画布选中节点的纯 UI 状态
 *
 * 独立于 kernel store，仅用于视图层联动（如 Prompt Preview 高亮、Inspector 卡片）。
 * Flow/SessionEditor 通过 ReactFlow onSelectionChange 写入，其他组件只读消费。
 */

import { create } from 'zustand';

interface CanvasSelectionState {
  /** 当前选中的节点 ID（Flow 或 Session 画布） */
  selectedNodeId: string | null;
  /** 选中节点所属的上下文：flow 画布还是 session 画布 */
  selectionContext: 'flow' | 'session' | null;
  setSelection: (nodeId: string | null, context: 'flow' | 'session' | null) => void;
}

export const useCanvasSelection = create<CanvasSelectionState>((set) => ({
  selectedNodeId: null,
  selectionContext: null,
  setSelection: (nodeId, context) => set({ selectedNodeId: nodeId, selectionContext: context }),
}));
