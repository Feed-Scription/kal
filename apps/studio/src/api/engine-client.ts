import type {
  FlowDefinition,
  FlowListItem,
  KalConfig,
  ProjectInfo,
  ExecutionResult,
  FlowExecutionStreamEvent,
  NodeManifest,
  DiagnosticsPayload,
  EngineEvent,
  EngineEventName,
  ReferenceEntry,
  SearchResult,
  GitLogResult,
  GitStatusResult,
  ProjectState,
  PromptPreviewEntry,
  PromptRenderResult,
  RunStateView,
  RunStreamEvent,
  RunSummary,
  RunView,
  SessionDefinition,
  SmokeResult,
} from '@/types/project';

const BASE_URL = import.meta.env.VITE_ENGINE_URL || '';

type EngineSuccessResponse<T> = { success: true; data: T };
type EngineErrorResponse = { success: false; error: { code: string; message: string } };
type EngineResponse<T> = EngineSuccessResponse<T> | EngineErrorResponse;
export type RunAdvanceMode = 'continue' | 'step';

let connectionLostHandler: ((message: string) => void) | null = null;
let lastConnectionLostAt = 0;
const CONNECTION_LOST_THROTTLE_MS = 1000;

const ENGINE_UNREACHABLE_MESSAGE = 'Cannot connect to Engine service, please confirm Engine is running';

export function setConnectionLostHandler(handler: ((message: string) => void) | null): void {
  connectionLostHandler = handler;
}

function notifyConnectionLost(message = ENGINE_UNREACHABLE_MESSAGE): void {
  if (!connectionLostHandler) {
    return;
  }
  const now = Date.now();
  if (now - lastConnectionLostAt < CONNECTION_LOST_THROTTLE_MS) {
    return;
  }
  lastConnectionLostAt = now;
  connectionLostHandler(message);
}

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

export function getEngineAssetUrl(path: string): string {
  return buildApiUrl(path);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  let res: Response;
  try {
    res = await fetch(buildApiUrl(path), { ...init, headers });
  } catch {
    notifyConnectionLost();
    throw new Error(ENGINE_UNREACHABLE_MESSAGE);
  }
  let json: EngineResponse<T>;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Engine returned unexpected response (HTTP ${res.status})`);
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

  async renderPrompt(flowId: string, nodeId: string): Promise<PromptRenderResult> {
    return request<PromptRenderResult>(
      `/api/flows/${encodeURIComponent(flowId)}/render-prompt?nodeId=${encodeURIComponent(nodeId)}`,
    );
  },

  async listPromptPreviewEntries(): Promise<PromptPreviewEntry[]> {
    const data = await request<{ entries: PromptPreviewEntry[] }>('/api/prompt-preview');
    return data.entries;
  },

  async saveFlow(flowId: string, flow: FlowDefinition): Promise<void> {
    await request(`/api/flows/${encodeURIComponent(flowId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(flow),
    });
  },

  async deleteFlow(flowId: string): Promise<void> {
    await request(`/api/flows/${encodeURIComponent(flowId)}`, {
      method: 'DELETE',
    });
  },

  async executeFlow(flowId: string, input: Record<string, unknown> = {}): Promise<ExecutionResult> {
    return request<ExecutionResult>('/api/executions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flowId, input }),
    });
  },

  /**
   * Execute a flow with streaming node-level events via SSE.
   * Returns an abort function to cancel the execution.
   */
  executeFlowStream(
    flowId: string,
    input: Record<string, unknown>,
    onEvent: (event: FlowExecutionStreamEvent) => void,
  ): () => void {
    const controller = new AbortController();

    void (async () => {
      try {
        const res = await fetch(buildApiUrl('/api/executions/stream'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flowId, input }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          notifyConnectionLost();
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6)) as FlowExecutionStreamEvent;
                onEvent(event);
              } catch {
                // Skip malformed events
              }
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          notifyConnectionLost();
        }
      }
    })();

    return () => controller.abort();
  },

  async getNodes(): Promise<NodeManifest[]> {
    const data = await request<{ nodes: NodeManifest[] }>('/api/nodes');
    return data.nodes;
  },

  async getNodeSource(nodeType: string): Promise<{ source: string; fileName: string }> {
    return request<{ source: string; fileName: string }>(`/api/nodes/${encodeURIComponent(nodeType)}/source`);
  },

  async saveNodeSource(nodeType: string, source: string): Promise<void> {
    await request(`/api/nodes/${encodeURIComponent(nodeType)}/source`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source }),
    });
  },

  async reloadProject(): Promise<void> {
    await request('/api/project/reload', { method: 'POST' });
  },

  async getConfig(): Promise<KalConfig> {
    const data = await request<{ config: KalConfig }>('/api/config');
    return data.config;
  },

  async saveConfig(patch: Partial<KalConfig>): Promise<void> {
    await request('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  },

  async getState(): Promise<ProjectState> {
    const data = await request<{ state: ProjectState }>('/api/state');
    return data.state;
  },

  async getDiagnostics(): Promise<DiagnosticsPayload> {
    return request<DiagnosticsPayload>('/api/diagnostics');
  },

  async runSmoke(options: { steps?: number; inputs?: string[]; dryRun?: boolean } = {}): Promise<SmokeResult> {
    return request<SmokeResult>('/api/tools/smoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
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

  async createRun(forceNew = false, mode?: RunAdvanceMode): Promise<RunView> {
    const data = await request<{ run: RunView }>('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(forceNew ? { forceNew: true } : {}),
        ...(mode ? { mode } : {}),
      }),
    });
    return data.run;
  },

  async createSmokeRun(inputs: string[] = []): Promise<RunView> {
    const data = await request<{ run: RunView }>('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forceNew: true, smokeInputs: inputs }),
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

  async advanceRun(runId: string, input?: string, mode?: RunAdvanceMode): Promise<RunView> {
    const data = await request<{ run: RunView }>(`/api/runs/${encodeURIComponent(runId)}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(input === undefined ? {} : { input }),
        ...(mode ? { mode } : {}),
      }),
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
      notifyConnectionLost();
    };

    return () => {
      source.close();
    };
  },

  subscribeEvents(onEvent: (event: EngineEvent) => void): () => void {
    const source = new EventSource(buildApiUrl('/api/events'));
    const eventTypes: EngineEventName[] = [
      'project.reloaded',
      'resource.changed',
      'diagnostics.updated',
      'run.created',
      'run.updated',
      'run.ended',
      'run.cancelled',
    ];

    for (const eventType of eventTypes) {
      source.addEventListener(eventType, (event) => {
        const payload = JSON.parse((event as MessageEvent<string>).data) as EngineEvent;
        onEvent(payload);
      });
    }

    source.onerror = () => {
      notifyConnectionLost();
    };

    return () => {
      source.close();
    };
  },

  async getGitStatus(): Promise<GitStatusResult> {
    return request<GitStatusResult>('/api/git/status');
  },

  async getGitLog(limit = 20): Promise<GitLogResult> {
    return request<GitLogResult>(`/api/git/log?limit=${limit}`);
  },

  // ── Reference Graph + Search API ──

  async getReferences(resourceId?: string): Promise<ReferenceEntry[]> {
    const query = resourceId ? `?resource=${encodeURIComponent(resourceId)}` : '';
    const data = await request<{ entries: ReferenceEntry[] }>(`/api/references${query}`);
    return data.entries;
  },

  async search(query: string): Promise<SearchResult> {
    return request<SearchResult>(`/api/search?q=${encodeURIComponent(query)}`);
  },

  // ── Terminal API ──

  async execCommand(command: string): Promise<{ command: string; result: unknown }> {
    return request<{ command: string; result: unknown }>('/api/terminal/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    });
  },

  async createTerminalSession(): Promise<{ session: { id: string; pid: number | null; alive: boolean; createdAt: number; cwd: string } }> {
    return request('/api/terminal/sessions', { method: 'POST' });
  },

  async listTerminalSessions(): Promise<{ sessions: Array<{ id: string; pid: number | null; alive: boolean; createdAt: number; cwd: string }> }> {
    return request('/api/terminal/sessions');
  },

  async writeTerminalSession(sessionId: string, data: string): Promise<void> {
    await request(`/api/terminal/sessions/${encodeURIComponent(sessionId)}/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    });
  },

  async killTerminalSession(sessionId: string): Promise<void> {
    await request(`/api/terminal/sessions/${encodeURIComponent(sessionId)}/kill`, { method: 'POST' });
  },

  subscribeTerminalSession(sessionId: string, onChunk: (chunk: { stream: string; data: string }) => void): () => void {
    const source = new EventSource(buildApiUrl(`/api/terminal/sessions/${encodeURIComponent(sessionId)}/stream`));
    source.addEventListener('output', (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data);
      onChunk(payload);
    });
    source.onerror = () => {
      notifyConnectionLost();
    };
    return () => { source.close(); };
  },
};
