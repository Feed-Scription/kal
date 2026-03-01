/**
 * Built-in nodes
 */

import type { CustomNode } from '../../types/node';

export { SignalIn, SignalOut, Timer } from './signal-nodes';
export { AddState, RemoveState, ReadState, ModifyState } from './state-nodes';
export { PromptBuild, Message, GenerateText, GenerateImage } from './llm-nodes';
export { Regex, JSONParse, PostProcess, SubFlow } from './transform-nodes';

import { SignalIn, SignalOut, Timer } from './signal-nodes';
import { AddState, RemoveState, ReadState, ModifyState } from './state-nodes';
import { PromptBuild, Message, GenerateText, GenerateImage } from './llm-nodes';
import { Regex, JSONParse, PostProcess, SubFlow } from './transform-nodes';

export const BUILTIN_NODES: CustomNode[] = [
  SignalIn,
  SignalOut,
  Timer,
  AddState,
  RemoveState,
  ReadState,
  ModifyState,
  PromptBuild,
  Message,
  GenerateText,
  GenerateImage,
  Regex,
  JSONParse,
  PostProcess,
  SubFlow,
];
