/**
 * Session Flow type definitions — state machine layer on top of DAG flows
 */

export interface RunFlowStep {
  id: string;
  type: 'RunFlow';
  flowRef: string;
  next: string;
}

export interface PromptStep {
  id: string;
  type: 'Prompt';
  flowRef?: string;
  inputChannel?: string;
  stateKey?: string;
  promptText?: string;
  next: string;
}

export interface BranchCondition {
  when: string;
  next: string;
  setState?: Record<string, any>;
}

export interface BranchStep {
  id: string;
  type: 'Branch';
  conditions: BranchCondition[];
  default: string;
  defaultSetState?: Record<string, any>;
}

export interface ChoiceStep {
  id: string;
  type: 'Choice';
  promptText: string;
  options: Array<{ label: string; value: string }>;
  flowRef?: string;
  inputChannel?: string;
  stateKey?: string;
  next: string;
}

export interface DynamicChoiceOption {
  label: string;
  value: string;
  when?: string;
}

export interface DynamicChoiceStep {
  id: string;
  type: 'DynamicChoice';
  promptText: string;
  options: DynamicChoiceOption[];
  flowRef?: string;
  inputChannel?: string;
  stateKey?: string;
  next: string;
}

export interface EndStep {
  id: string;
  type: 'End';
  message?: string;
}

export type SessionStep = RunFlowStep | PromptStep | BranchStep | ChoiceStep | DynamicChoiceStep | EndStep;

export interface SessionDefinition {
  schemaVersion: string;
  name?: string;
  description?: string;
  entryStep?: string;
  steps: SessionStep[];
}
