import type { SessionAdvanceError, StateValue } from '@kal-ai/core';
import { relative } from 'node:path';
import type { EngineProject } from '../types';
import type { DebugEvidence, DebugLocation, DiagnosticPayload } from './types';

export function buildDebugDiagnostic(params: {
  project: EngineProject;
  error: SessionAdvanceError;
  verbose?: boolean;
  input?: string;
  stateSnapshot?: Record<string, StateValue>;
}): DiagnosticPayload {
  const { project, error, verbose = false, input, stateSnapshot } = params;
  const suggestions = buildSuggestions(project, error);
  const phase = inferPhase(error);
  const baseLocation: DebugLocation = {
    phase,
    step_id: error.stepId,
    flow_id: error.flowId,
    node_id: error.nodeId,
    node_type: error.nodeType,
  };
  const diagnostic: DiagnosticPayload = {
    code: error.code,
    message: error.message,
    severity: 'error',
    phase,
    stepId: error.stepId,
    flowId: error.flowId,
    nodeId: error.nodeId,
    nodeType: error.nodeType,
    errorType: error.errorType,
    suggestions,
    location: baseLocation,
    root_cause: {
      code: error.code,
      message: error.message,
      error_type: error.errorType,
    },
    remediation: {
      suggestions,
    },
  };

  const location = resolveLocation(project, error);
  if (location) {
    diagnostic.file = location.file;
    diagnostic.jsonPath = location.jsonPath;
    diagnostic.location = {
      ...baseLocation,
      file: location.file,
      json_path: location.jsonPath,
    };
  }

  const details = extractDetails(error.details);
  const context: DiagnosticPayload['context'] = {};
  const evidence: DebugEvidence = {};
  if (input !== undefined) {
    context.input = input;
    evidence.input = input;
  }
  if (details.flowInputs) {
    context.flowInputs = details.flowInputs;
    evidence.flow_inputs = details.flowInputs;
  }
  if (details.nodeInputs) {
    context.nodeInputs = details.nodeInputs;
    evidence.node_inputs = details.nodeInputs;
  }
  if (verbose && stateSnapshot) {
    context.stateSnapshot = stateSnapshot;
    evidence.state_snapshot = stateSnapshot;
  }
  if (verbose && typeof details.llmRequest === 'string') {
    context.llmRequest = details.llmRequest;
    evidence.llm_request = details.llmRequest;
  }
  if (verbose && typeof details.llmResponse === 'string') {
    context.llmResponse = details.llmResponse;
    evidence.llm_response = details.llmResponse;
  }
  if (Object.keys(context).length > 0) {
    diagnostic.context = context;
  }
  if (Object.keys(evidence).length > 0) {
    diagnostic.evidence = evidence;
  }
  if (verbose && error.details !== undefined) {
    diagnostic.details = error.details;
  }

  return diagnostic;
}

export function buildCliDiagnostic(params: {
  code: string;
  message: string;
  suggestions: string[];
  details?: unknown;
  file?: string;
  jsonPath?: string;
  flowId?: string;
  nodeId?: string;
  stepId?: string;
  phase?: DiagnosticPayload['phase'];
  severity?: DiagnosticPayload['severity'];
}): DiagnosticPayload {
  const phase = params.phase ?? 'cli';
  const severity = params.severity ?? 'error';
  const location: DebugLocation | undefined = params.file || params.jsonPath || params.flowId || params.nodeId || params.stepId
    ? {
        phase,
        file: params.file,
        json_path: params.jsonPath,
        flow_id: params.flowId,
        node_id: params.nodeId,
        step_id: params.stepId,
      }
    : undefined;
  return {
    code: params.code,
    message: params.message,
    severity,
    phase,
    flowId: params.flowId,
    nodeId: params.nodeId,
    stepId: params.stepId,
    suggestions: params.suggestions,
    details: params.details,
    file: params.file,
    jsonPath: params.jsonPath,
    location,
    root_cause: {
      code: params.code,
      message: params.message,
    },
    remediation: {
      suggestions: params.suggestions,
    },
  };
}

function inferPhase(error: SessionAdvanceError): DiagnosticPayload['phase'] {
  if (error.nodeId || error.nodeType) {
    return 'node';
  }
  if (error.flowId) {
    return 'flow';
  }
  return 'session';
}

function resolveLocation(project: EngineProject, error: SessionAdvanceError): { file: string; jsonPath: string } | undefined {
  if (error.flowId) {
    const filePath = project.flowFileMap[error.flowId];
    if (filePath) {
      return {
        file: relative(project.projectRoot, filePath),
        jsonPath: error.nodeId ? `data.nodes[id=${error.nodeId}]` : 'meta',
      };
    }
  }

  if (error.stepId) {
    return {
      file: 'session.json',
      jsonPath: `steps[id=${error.stepId}]`,
    };
  }

  return undefined;
}

function buildSuggestions(project: EngineProject, error: SessionAdvanceError): string[] {
  switch (error.code) {
    case 'FLOW_NOT_FOUND':
      return [
        `检查 session.json 中 step "${error.stepId}" 的 flowRef 是否存在`,
        `当前可用 flows: ${Object.keys(project.flowsById).sort().join(', ')}`,
      ];
    case 'STATE_KEY_NOT_FOUND':
      return [
        '检查 initial_state.json 是否定义了对应 state key',
        `当前 state keys: ${Object.keys(project.initialState).sort().join(', ')}`,
      ];
    case 'NODE_TIMEOUT':
      return [
        '检查 API 密钥与网络连接',
        '如有需要，增加节点 config.timeout',
      ];
    case 'CONDITION_EVAL_ERROR':
      return [
        `检查 Branch step "${error.stepId}" 的条件表达式`,
        '必要时运行 `kal debug <project> --state` 查看当前状态',
      ];
    case 'FLOW_EXECUTION_FAILED':
      return [
        '检查报错节点的输入、配置和依赖节点输出',
        '必要时使用 `--verbose` 查看更多诊断上下文',
      ];
    default:
      return ['修复当前问题后重新运行调试命令'];
  }
}

function extractDetails(details: unknown): {
  flowInputs?: Record<string, any>;
  nodeInputs?: Record<string, any>;
  llmRequest?: string;
  llmResponse?: string;
} {
  if (!details || typeof details !== 'object') {
    return {};
  }

  const record = details as Record<string, any>;
  return {
    flowInputs: isRecord(record.flowInputs) ? record.flowInputs : undefined,
    nodeInputs: isRecord(record.nodeInputs) ? record.nodeInputs : undefined,
    llmRequest: typeof record.llmRequest === 'string' ? record.llmRequest : undefined,
    llmResponse: typeof record.llmResponse === 'string' ? record.llmResponse : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
