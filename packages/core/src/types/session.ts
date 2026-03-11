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

export interface BranchStep {
  id: string;
  type: 'Branch';
  conditions: { when: string; next: string }[];
  default: string;
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

export interface EndStep {
  id: string;
  type: 'End';
  message?: string;
}

export type SessionStep = RunFlowStep | PromptStep | BranchStep | ChoiceStep | EndStep;

export interface SessionDefinition {
  schemaVersion: string;
  name?: string;
  description?: string;
  entryStep?: string;
  steps: SessionStep[];
}
