/**
 * Built-in nodes
 */

import type { CustomNode } from '../../types/node';

export { SignalIn, SignalOut, Timer } from './signal-nodes';
export { ReadState, WriteState } from './state-nodes';
export { PromptBuild, Message, GenerateText, GenerateImage, UpdateHistory, CompactHistory } from './llm-nodes';
export { Regex, JSONParse, PostProcess, SubFlow } from './transform-nodes';
export { Constant, ComputeState } from './utility-nodes';

import { SignalIn, SignalOut, Timer } from './signal-nodes';
import { ReadState, WriteState } from './state-nodes';
import { PromptBuild, Message, GenerateText, GenerateImage, UpdateHistory, CompactHistory } from './llm-nodes';
import { Regex, JSONParse, PostProcess, SubFlow } from './transform-nodes';
import { Constant, ComputeState } from './utility-nodes';

export const BUILTIN_NODES: CustomNode[] = [
  SignalIn,
  SignalOut,
  Timer,
  ReadState,
  WriteState,
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
  Constant,
  ComputeState,
];
