import type {
  FlowDefinition,
  FlowListItem,
  ProjectInfo,
  ExecutionResult,
  NodeManifest,
  SessionDefinition,
} from '@/types/project';

const BASE_URL = import.meta.env.VITE_ENGINE_URL || 'http://localhost:3000';

type EngineSuccessResponse<T> = { success: true; data: T };
type EngineErrorResponse = { success: false; error: { code: string; message: string } };
type EngineResponse<T> = EngineSuccessResponse<T> | EngineErrorResponse;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, init);
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
};
