import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { FlowDefinition, SessionDefinition } from '@kal-ai/core';
import { EngineHttpError, formatEngineError, statusForError } from './errors';
import { getGitLog, getGitStatus } from './git-service';
import { loadProjectPackages } from './package-loader';
import { RunManager } from './run-manager';
import type {
  AdvanceRunRequest,
  CreateRunRequest,
  DiagnosticsPayload,
  EngineErrorResponse,
  EngineEvent,
  EngineEventName,
  EngineResponse,
  ExecuteFlowRequest,
  RunStreamEvent,
  StartedEngineServer,
} from './types';
import { EngineRuntime } from './runtime';
import { collectLintPayload } from './commands/lint';
import { collectSmokePayload } from './commands/smoke';
import { collectSchemaNodesPayload } from './commands/schema';
import { buildReferenceIndex, buildSearchIndex, searchProject } from './reference-graph';

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Studio-Capabilities');
}

function sendJson<T>(res: ServerResponse, status: number, payload: EngineResponse<T> | EngineErrorResponse): void {
  setCorsHeaders(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload, null, 2));
}

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB

async function readJsonBody<T>(
  req: IncomingMessage,
  options: { required?: boolean } = {},
): Promise<T> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.length;
    if (totalBytes > MAX_BODY_BYTES) {
      throw new EngineHttpError(
        `Request body exceeds maximum size of ${MAX_BODY_BYTES} bytes`,
        413,
        'REQUEST_BODY_TOO_LARGE'
      );
    }
    chunks.push(buf);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) {
    if (options.required === false) {
      return {} as T;
    }
    throw new EngineHttpError('Request body is required', 400, 'REQUEST_BODY_REQUIRED');
  }

  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.includes('application/json')) {
    throw new EngineHttpError(
      'Content-Type must be application/json',
      415,
      'UNSUPPORTED_CONTENT_TYPE',
      { contentType }
    );
  }

  return JSON.parse(raw) as T;
}

function success<T>(res: ServerResponse, data: T, status = 200): void {
  sendJson(res, status, { success: true, data });
}

/**
 * Parse the X-Studio-Capabilities header into a set of granted capability IDs.
 * Returns an empty set when the header is absent (e.g. direct CLI / curl usage),
 * which means "no capability context" — callers decide whether to enforce.
 */
function parseCapabilities(req: IncomingMessage): Set<string> {
  const raw = req.headers['x-studio-capabilities'];
  if (!raw || typeof raw !== 'string') return new Set();
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

/**
 * Require a specific capability when the request originates from Studio
 * (i.e. the X-Studio-Capabilities header is present). Requests without
 * the header (CLI, curl) are allowed through — the gate only applies to
 * Studio sessions that have an explicit capability context.
 */
function requireCapability(req: IncomingMessage, capability: string): void {
  const caps = parseCapabilities(req);
  if (caps.size === 0) return; // no capability context → allow (non-Studio caller)
  if (!caps.has(capability)) {
    throw new EngineHttpError(
      `Missing required capability: ${capability}`,
      403,
      'CAPABILITY_DENIED',
      { required: capability, granted: [...caps] },
    );
  }
}

function failure(res: ServerResponse, error: unknown): void {
  sendJson(res, statusForError(error), {
    success: false,
    error: formatEngineError(error),
  });
}

function setSseHeaders(res: ServerResponse): void {
  setCorsHeaders(res);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
}

function writeSseEvent(res: ServerResponse, event: RunStreamEvent | EngineEvent): void {
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

type EngineEventListener = (event: EngineEvent) => void;

class EngineEventBus {
  private listeners = new Set<EngineEventListener>();

  subscribe(listener: EngineEventListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  emit(event: Omit<EngineEvent, 'timestamp'>): void {
    const full: EngineEvent = { ...event, timestamp: Date.now() };
    for (const listener of this.listeners) {
      listener(full);
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function buildH5PreviewHtml(runtime: EngineRuntime, runs: RunManager): Promise<string> {
  const project = runtime.getProject();
  const runSummaries = await runs.listRuns();
  const activeRun = runSummaries.find((run) => run.active) ?? runSummaries[0] ?? null;
  const activeRunState = activeRun ? await runs.getRunState({ runId: activeRun.run_id }) : null;
  const statePreview = activeRunState?.state_summary.preview ?? {};
  const statePreviewHtml =
    Object.keys(statePreview).length === 0
      ? '<div class="empty">No previewable state yet.</div>'
      : Object.entries(statePreview)
          .map(
            ([key, value]) =>
              `<div class="kv"><span>${escapeHtml(key)}</span><code>${escapeHtml(JSON.stringify(value))}</code></div>`,
          )
          .join('');
  const flowCards = runtime
    .listFlows()
    .map(
      (flow) =>
        `<div class="card"><div class="label">${escapeHtml(flow.id)}</div><div class="muted">${
          flow.meta.description ? escapeHtml(flow.meta.description) : 'Flow resource'
        }</div></div>`,
    )
    .join('');

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>KAL H5 Preview</title>
    <style>
      :root { color-scheme: light; --bg:#f4f0e8; --ink:#1e1a17; --muted:#6f665f; --card:#fffaf3; --line:#d9cfc2; --accent:#b85c38; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: "IBM Plex Sans", "Noto Sans SC", sans-serif; background:
        radial-gradient(circle at top left, #fff6df, transparent 30%),
        linear-gradient(180deg, #f7f2e8 0%, var(--bg) 100%); color: var(--ink); }
      .shell { min-height: 100vh; padding: 24px; display: grid; gap: 18px; }
      .hero, .panel { background: rgba(255,250,243,0.9); border: 1px solid var(--line); border-radius: 20px; padding: 18px; backdrop-filter: blur(8px); }
      .hero h1 { margin: 0; font-size: 28px; }
      .hero p { margin: 8px 0 0; color: var(--muted); }
      .grid { display: grid; gap: 18px; grid-template-columns: 1.1fr 0.9fr; }
      .stack { display: grid; gap: 12px; }
      .label { font-weight: 700; }
      .muted { color: var(--muted); font-size: 13px; }
      .badge { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line); background: #fff; border-radius: 999px; padding: 6px 10px; font-size: 12px; margin-right: 8px; }
      .cards { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
      .card { border: 1px solid var(--line); border-radius: 16px; padding: 12px; background: #fff; }
      .kv { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px dashed var(--line); font-size: 13px; }
      .kv:last-child { border-bottom: none; }
      code, pre { font-family: "IBM Plex Mono", monospace; font-size: 12px; }
      .empty { color: var(--muted); font-size: 13px; }
      pre { margin: 0; padding: 12px; border-radius: 14px; background: #221d18; color: #f8f1e4; overflow: auto; }
      @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } body { font-size: 14px; } }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <h1>${escapeHtml(project.config.name)} Preview</h1>
        <p>这是面向 Studio Phase 3 的 browser preview snapshot，用于把 project / session / active run 收敛到同一预览 surface。</p>
        <div style="margin-top:12px">
          <span class="badge">flows ${runtime.listFlows().length}</span>
          <span class="badge">session ${runtime.hasSession() ? 'ready' : 'missing'}</span>
          <span class="badge">active run ${activeRun ? escapeHtml(activeRun.run_id) : 'none'}</span>
        </div>
      </section>
      <div class="grid">
        <section class="panel stack">
          <div>
            <div class="label">Project Flows</div>
            <div class="muted">Engine canonical snapshot</div>
          </div>
          <div class="cards">${flowCards || '<div class="empty">No flows.</div>'}</div>
        </section>
        <section class="panel stack">
          <div>
            <div class="label">Active Run Summary</div>
            <div class="muted">${activeRun ? escapeHtml(activeRun.status) : 'No managed run'}</div>
          </div>
          ${
            activeRun
              ? `
                <div class="card">
                  <div class="kv"><span>run_id</span><code>${escapeHtml(activeRun.run_id)}</code></div>
                  <div class="kv"><span>waiting_for</span><code>${escapeHtml(activeRun.waiting_for?.step_id ?? 'none')}</code></div>
                  <div class="kv"><span>changed keys</span><code>${activeRunState?.state_summary.changed.length ?? 0}</code></div>
                  <div class="kv"><span>events</span><code>${activeRunState?.recent_events.length ?? 0}</code></div>
                </div>
                <div class="card">
                  <div class="label">State Preview</div>
                  <div style="margin-top:8px">${statePreviewHtml}</div>
                </div>
                <div class="card">
                  <div class="label">Recent Events</div>
                  <pre>${escapeHtml(JSON.stringify(activeRunState?.recent_events ?? [], null, 2))}</pre>
                </div>
              `
              : '<div class="empty">Create a managed run in Studio to see runtime preview here.</div>'
          }
        </section>
      </div>
    </main>
  </body>
</html>`;
}

export interface EngineRequestContext {
  runs?: RunManager;
  eventBus?: EngineEventBus;
}

export async function handleEngineRequest(
  runtime: EngineRuntime,
  req: IncomingMessage,
  res: ServerResponse,
  context: EngineRequestContext = {},
): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
  const method = req.method ?? 'GET';
  const pathname = url.pathname;
  const runs = context.runs ?? RunManager.fromRuntime(runtime);
  const eventBus = context.eventBus;
  const runMatch = pathname.match(/^\/api\/runs\/([^/]+)(?:\/(state|advance|cancel|stream))?$/);

  if (method === 'OPTIONS') {
    setCorsHeaders(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    if (method === 'GET' && pathname === '/api/project') {
      success(res, runtime.getProjectInfo());
      return;
    }

    if (method === 'POST' && pathname === '/api/project/reload') {
      await runtime.reload();
      eventBus?.emit({ type: 'project.reloaded', message: 'Project reloaded' });
      success(res, { reloadedAt: new Date().toISOString() });
      return;
    }

    if (method === 'GET' && pathname === '/api/config') {
      success(res, { config: runtime.getProject().config });
      return;
    }

    if (method === 'PUT' && pathname === '/api/config') {
      requireCapability(req, 'project.write');
      const patch = await readJsonBody<Record<string, any>>(req);
      await runtime.saveConfig(patch);
      eventBus?.emit({ type: 'resource.changed', message: 'Config saved' });
      success(res, { savedAt: new Date().toISOString() });
      return;
    }

    if (method === 'GET' && pathname === '/api/state') {
      success(res, { state: runtime.getState() });
      return;
    }

    if (method === 'GET' && pathname === '/api/diagnostics') {
      const payload: DiagnosticsPayload = await collectLintPayload(runtime.getProject().projectRoot);
      success(res, payload);
      return;
    }

    if (method === 'GET' && pathname === '/api/references') {
      const project = runtime.getProject();
      const entries = buildReferenceIndex(project);
      const resourceFilter = url.searchParams.get('resource');
      const filtered = resourceFilter
        ? entries.filter((e) => e.sourceResource === resourceFilter || e.targetResource === resourceFilter)
        : entries;
      success(res, { entries: filtered });
      return;
    }

    if (method === 'GET' && pathname === '/api/search') {
      const q = url.searchParams.get('q') ?? '';
      const project = runtime.getProject();
      const index = buildSearchIndex(project);
      success(res, searchProject(index, q));
      return;
    }

    if (method === 'GET' && pathname === '/api/tools/h5-preview') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(await buildH5PreviewHtml(runtime, runs));
      return;
    }

    if (method === 'POST' && pathname === '/api/terminal/exec') {
      requireCapability(req, 'process.exec');
      const payload = await readJsonBody<{ command: string }>(req);
      const ALLOWED_COMMANDS: Record<string, () => Promise<unknown>> = {
        lint: () => collectLintPayload(runtime.getProject().projectRoot),
        smoke: () => collectSmokePayload(runtime, {}),
        schema: () => Promise.resolve(collectSchemaNodesPayload()),
        'debug-list': () => runs.listRuns(),
        'debug-state': async () => {
          const run = await runs.getRunState({ latest: true });
          return run;
        },
        config: () => Promise.resolve(runtime.getConfig()),
        eval: () => Promise.resolve({
          hint: 'Use kal eval from CLI for full evaluation. This returns the current prompt eval config.',
          nodes: collectSchemaNodesPayload().nodes.filter((n) => n.type === 'PromptBuild'),
        }),
      };
      const cmd = payload.command?.trim().toLowerCase();
      if (!cmd || !ALLOWED_COMMANDS[cmd]) {
        throw new EngineHttpError(
          `Unknown or disallowed command: "${cmd}". Allowed: ${Object.keys(ALLOWED_COMMANDS).join(', ')}`,
          400,
          'INVALID_COMMAND'
        );
      }
      const result = await ALLOWED_COMMANDS[cmd]!();
      success(res, { command: cmd, result });
      return;
    }

    if (method === 'POST' && pathname === '/api/tools/deploy') {
      requireCapability(req, 'process.exec');
      throw new EngineHttpError(
        'Deploy not configured. Set VERCEL_TOKEN environment variable to enable.',
        501,
        'DEPLOY_NOT_CONFIGURED'
      );
    }

    if (method === 'POST' && pathname === '/api/tools/smoke') {
      const payload = await readJsonBody<{ steps?: number; inputs?: string[]; dryRun?: boolean }>(req, { required: false });
      success(res, await collectSmokePayload(runtime, payload));
      return;
    }

    if (method === 'GET' && pathname === '/api/flows') {
      success(res, { flows: runtime.listFlows() });
      return;
    }

    if (method === 'GET' && pathname.startsWith('/api/flows/')) {
      const flowId = decodeURIComponent(pathname.slice('/api/flows/'.length));
      success(res, { flow: runtime.getFlow(flowId) });
      return;
    }

    if (method === 'PUT' && pathname.startsWith('/api/flows/')) {
      requireCapability(req, 'project.write');
      const flowId = decodeURIComponent(pathname.slice('/api/flows/'.length));
      const flow = await readJsonBody<FlowDefinition>(req);
      await runtime.saveFlow(flowId, flow);
      eventBus?.emit({ type: 'resource.changed', flowId, message: `Flow saved: ${flowId}` });
      success(res, {
        flowId,
        savedAt: new Date().toISOString(),
      });
      return;
    }

    if (method === 'DELETE' && pathname.startsWith('/api/flows/')) {
      requireCapability(req, 'project.write');
      const flowId = decodeURIComponent(pathname.slice('/api/flows/'.length));
      await runtime.deleteFlow(flowId);
      eventBus?.emit({ type: 'resource.changed', flowId, message: `Flow deleted: ${flowId}` });
      success(res, {
        flowId,
        deletedAt: new Date().toISOString(),
      });
      return;
    }

    if (method === 'POST' && pathname === '/api/executions') {
      requireCapability(req, 'engine.execute');
      const payload = await readJsonBody<ExecuteFlowRequest>(req);
      if (!payload.flowId) {
        throw new EngineHttpError('flowId is required', 400, 'FLOW_ID_REQUIRED');
      }
      success(res, await runtime.executeFlow(payload.flowId, payload.input ?? {}));
      return;
    }

    if (method === 'GET' && pathname === '/api/nodes') {
      success(res, { nodes: runtime.getNodeManifests() });
      return;
    }

    if (method === 'POST' && pathname === '/api/runs') {
      requireCapability(req, 'engine.execute');
      const payload = await readJsonBody<CreateRunRequest>(req, { required: false });
      const created = await runs.createRun({
        forceNew: payload.forceNew,
        cleanup: payload.cleanup,
        mode: payload.mode,
      });
      success(res, { run: created.run }, 201);
      return;
    }

    if (method === 'GET' && pathname === '/api/runs') {
      success(res, { runs: await runs.listRuns() });
      return;
    }

    if (runMatch) {
      const runId = decodeURIComponent(runMatch[1]!);
      const action = runMatch[2];

      if (method === 'GET' && !action) {
        success(res, { run: await runs.getRun({ runId }) });
        return;
      }

      if (method === 'GET' && action === 'state') {
        success(res, { run: await runs.getRunState({ runId }) });
        return;
      }

      if (method === 'POST' && action === 'advance') {
        const payload = await readJsonBody<AdvanceRunRequest>(req, { required: false });
        const advanced = await runs.advanceRun({
          runId,
          input: payload.input,
          cleanup: payload.cleanup,
          mode: payload.mode,
        });
        success(res, { run: advanced.run });
        return;
      }

      if (method === 'POST' && action === 'cancel') {
        const cancelled = await runs.cancelRun({ runId });
        success(res, { cancelled: true, run_id: cancelled.run_id });
        return;
      }

      if (method === 'GET' && action === 'stream') {
        const currentRun = await runs.getRun({ runId });
        setSseHeaders(res);
        res.flushHeaders?.();
        writeSseEvent(res, {
          type: 'run.updated',
          run: currentRun,
        });

        const unsubscribe = runs.subscribe((event) => {
          if (event.run.run_id !== runId) {
            return;
          }
          writeSseEvent(res, event);
        });
        const heartbeat = setInterval(() => {
          res.write(': keepalive\n\n');
        }, 15000);

        req.on('close', () => {
          clearInterval(heartbeat);
          unsubscribe();
        });
        return;
      }
    }

    if (method === 'GET' && pathname === '/api/session') {
      success(res, { session: runtime.getSession() ?? null });
      return;
    }

    if (method === 'PUT' && pathname === '/api/session') {
      requireCapability(req, 'project.write');
      const session = await readJsonBody<SessionDefinition>(req);
      await runtime.saveSession(session);
      eventBus?.emit({ type: 'resource.changed', sessionId: 'default', message: 'Session saved' });
      success(res, { savedAt: new Date().toISOString() });
      return;
    }

    if (method === 'DELETE' && pathname === '/api/session') {
      requireCapability(req, 'project.write');
      await runtime.deleteSession();
      eventBus?.emit({ type: 'resource.changed', sessionId: 'default', message: 'Session deleted' });
      success(res, { deletedAt: new Date().toISOString() });
      return;
    }

    if (method === 'GET' && pathname === '/api/events') {
      if (!eventBus) {
        throw new EngineHttpError('Event bus not available', 503, 'EVENT_BUS_UNAVAILABLE');
      }
      setSseHeaders(res);
      res.flushHeaders?.();
      const unsubscribe = eventBus.subscribe((event) => {
        writeSseEvent(res, event);
      });
      const heartbeat = setInterval(() => {
        res.write(': keepalive\n\n');
      }, 15000);
      req.on('close', () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
      return;
    }

    if (method === 'GET' && pathname === '/api/git/status') {
      const status = await getGitStatus(runtime.getProjectRoot());
      success(res, status);
      return;
    }

    if (method === 'GET' && pathname === '/api/git/log') {
      const limit = Number(url.searchParams.get('limit') ?? '20');
      const log = await getGitLog(runtime.getProjectRoot(), limit);
      success(res, log);
      return;
    }

    // ── Package API ──

    if (method === 'GET' && pathname === '/api/packages') {
      const packages = await loadProjectPackages(runtime.getProjectRoot());
      success(res, packages);
      return;
    }

    // ── Registry API (Proxy) ──
    // Note: Registry client implementation is available but requires configuration.
    // To enable: set REGISTRY_URL and optionally REGISTRY_TOKEN in environment.

    if (pathname.startsWith('/api/registry/')) {
      throw new EngineHttpError(
        'Registry API not configured. Set REGISTRY_URL environment variable to enable.',
        501,
        'REGISTRY_NOT_CONFIGURED'
      );
    }

    throw new EngineHttpError(`Route not found: ${method} ${pathname}`, 404, 'ROUTE_NOT_FOUND');
  } catch (error) {
    failure(res, error);
  }
}

export async function startEngineServer(params: {
  runtime: EngineRuntime;
  host?: string;
  port?: number;
  runStateDir?: string;
}): Promise<StartedEngineServer> {
  const host = params.host ?? '127.0.0.1';
  const port = params.port ?? 3000;
  const runs = RunManager.fromRuntime(params.runtime, params.runStateDir);
  const eventBus = new EngineEventBus();

  // Forward run events to unified event stream
  runs.subscribe((runEvent) => {
    eventBus.emit({
      type: runEvent.type as EngineEventName,
      runId: runEvent.run.run_id,
      message: `Run ${runEvent.type.replace('run.', '')}`,
    });
  });

  const server = createServer((req, res) => {
    void handleEngineRequest(params.runtime, req, res, { runs, eventBus });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  return {
    host: address.address,
    port: address.port,
    url: `http://${address.address}:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}
