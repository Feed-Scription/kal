/**
 * Built-in nodes
 */

import type { CustomNode } from '../../types/node';

export { SignalIn, SignalOut, Timer } from './signal-nodes';
export { AddState, RemoveState, ReadState, ModifyState, ApplyState } from './state-nodes';
export { PromptBuild, Message, GenerateText, GenerateImage, UpdateHistory, CompactHistory } from './llm-nodes';
export { Regex, JSONParse, PostProcess, SubFlow } from './transform-nodes';

import { SignalIn, SignalOut, Timer } from './signal-nodes';
import { AddState, RemoveState, ReadState, ModifyState, ApplyState } from './state-nodes';
import { PromptBuild, Message, GenerateText, GenerateImage, UpdateHistory, CompactHistory } from './llm-nodes';
import { Regex, JSONParse, PostProcess, SubFlow } from './transform-nodes';

export const BUILTIN_NODES: CustomNode[] = [
  SignalIn,
  SignalOut,
  Timer,
  AddState,
  RemoveState,
  ReadState,
  ModifyState,
  ApplyState,
  PromptBuild,
  Message,
  GenerateText,
  GenerateImage,
  UpdateHistory,
  CompactHistory,
  Regex,
  JSONParse,
  PostProcess,
  SubFlow,
];
