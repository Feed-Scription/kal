import type {
  FlowDefinition,
  FlowListItem,
  ProjectInfo,
  ExecutionResult,
  NodeManifest,
  RunStateView,
  RunStreamEvent,
  RunSummary,
  RunView,
  SessionDefinition,
} from '@/types/project';

const BASE_URL = import.meta.env.VITE_ENGINE_URL || '';

type EngineSuccessResponse<T> = { success: true; data: T };
type EngineErrorResponse = { success: false; error: { code: string; message: string } };
type EngineResponse<T> = EngineSuccessResponse<T> | EngineErrorResponse;

function buildApiUrl(path: string): string {
  if (!BASE_URL) {
    return path;
  }

  try {
    return new URL(path, BASE_URL).toString();
  } catch {
    return `${BASE_URL}${path}`;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(buildApiUrl(path), init);
  } catch {
    throw new Error('无法连接到 Engine 服务，请确认 Engine 已启动');
  }
  let json: EngineResponse<T>;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Engine 返回了非预期的响应 (HTTP ${res.status})`);
  }
  if (!json.success) {
    throw new Error(`[${json.error.code}] ${json.error.message}`);
  }
  return json.data;
}

export const engineApi = {
  async getProject(): Promise<ProjectInfo> {
    return request<ProjectInfo>('/api/project');
  },

  async listFlows(): Promise<FlowListItem[]> {
    const data = await request<{ flows: FlowListItem[] }>('/api/flows');
    return data.flows;
  },

  async getFlow(flowId: string): Promise<FlowDefinition> {
    const data = await request<{ flow: FlowDefinition }>(`/api/flows/${encodeURIComponent(flowId)}`);
    return data.flow;
  },

  async saveFlow(flowId: string, flow: FlowDefinition): Promise<void> {
    await request(`/api/flows/${encodeURIComponent(flowId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(flow),
    });
  },

  async executeFlow(flowId: string, input: Record<string, any> = {}): Promise<ExecutionResult> {
    return request<ExecutionResult>('/api/executions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flowId, input }),
    });
  },

  async getNodes(): Promise<NodeManifest[]> {
    const data = await request<{ nodes: NodeManifest[] }>('/api/nodes');
    return data.nodes;
  },

  async reloadProject(): Promise<void> {
    await request('/api/project/reload', { method: 'POST' });
  },

  async getSession(): Promise<SessionDefinition | null> {
    const data = await request<{ session: SessionDefinition | null }>('/api/session');
    return data.session;
  },

  async saveSession(session: SessionDefinition): Promise<void> {
    await request('/api/session', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
    });
  },

  async deleteSession(): Promise<void> {
    await request('/api/session', { method: 'DELETE' });
  },

  async createRun(forceNew = false): Promise<RunView> {
    const data = await request<{ run: RunView }>('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(forceNew ? { forceNew: true } : {}),
    });
    return data.run;
  },

  async listRuns(): Promise<RunSummary[]> {
    const data = await request<{ runs: RunSummary[] }>('/api/runs');
    return data.runs;
  },

  async getRun(runId: string): Promise<RunView> {
    const data = await request<{ run: RunView }>(`/api/runs/${encodeURIComponent(runId)}`);
    return data.run;
  },

  async getRunState(runId: string): Promise<RunStateView> {
    const data = await request<{ run: RunStateView }>(`/api/runs/${encodeURIComponent(runId)}/state`);
    return data.run;
  },

  async advanceRun(runId: string, input?: string): Promise<RunView> {
    const data = await request<{ run: RunView }>(`/api/runs/${encodeURIComponent(runId)}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input === undefined ? {} : { input }),
    });
    return data.run;
  },

  async cancelRun(runId: string): Promise<void> {
    await request(`/api/runs/${encodeURIComponent(runId)}/cancel`, {
      method: 'POST',
    });
  },

  subscribeRun(runId: string, onEvent: (event: RunStreamEvent) => void): () => void {
    const source = new EventSource(buildApiUrl(`/api/runs/${encodeURIComponent(runId)}/stream`));
    const eventTypes: RunStreamEvent['type'][] = [
      'run.created',
      'run.updated',
      'run.ended',
      'run.cancelled',
      'run.invalidated',
    ];

    for (const eventType of eventTypes) {
      source.addEventListener(eventType, (event) => {
        const payload = JSON.parse((event as MessageEvent<string>).data) as RunStreamEvent;
        onEvent(payload);
      });
    }

    source.onerror = () => {
      // EventSource will retry automatically. Keep the connection unless explicitly closed.
    };

    return () => {
      source.close();
    };
  },
};
