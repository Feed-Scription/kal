import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FlowDefinition, SessionDefinition, Fragment, StateValue } from '@kal-ai/core';
import { renderPrompt, runEval, findPromptBuildNode } from '@kal-ai/core';
import { EngineHttpError, formatEngineError, statusForError } from './errors';
import { getGitLog, getGitStatus } from './git-service';
import { loadProjectPackages } from './package-loader';
import { buildPromptPreviewEntries } from './prompt-preview';
import { RegistryClient } from './registry-client';
import { RunManager } from './run-manager';
import { TerminalSessionManager } from './terminal-session';
import { loadStudioResource, saveStudioResource } from './studio-resource-store';
import { loadTemplateBundle } from './template-bundles';
import type {
  AdvanceRunRequest,
  CreateRunRequest,
  DiagnosticsPayload,
  EngineErrorResponse,
  EngineEvent,
  EngineEventName,
  EngineResponse,
  ExecuteFlowRequest,
  RetryRunRequest,
  RunStreamEvent,
  StartedEngineServer,
} from './types';
import { EngineRuntime } from './runtime';
import { collectLintPayload } from './commands/lint';
import { collectSmokePayload } from './commands/smoke';
import { collectSchemaNodesPayload } from './commands/schema/nodes';
import { buildReferenceIndex, buildSearchIndex, searchProject } from './reference-graph';
import { buildComparison } from './commands/eval/_helpers';

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

export class EngineEventBus {
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

export interface EngineRequestContext {
  runs?: RunManager;
  eventBus?: EngineEventBus;
  terminals?: TerminalSessionManager;
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
  const terminals = context.terminals;
  const runMatch = pathname.match(/^\/api\/runs\/([^/]+)(?:\/(state|advance|retry|cancel|stream))?$/);
  const termMatch = pathname.match(/^\/api\/terminal\/sessions\/([^/]+)(?:\/(write|kill|stream))?$/);

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

    if (method === 'GET' && pathname === '/api/prompt-preview') {
      success(res, { entries: buildPromptPreviewEntries(runtime) });
      return;
    }

    if (method === 'GET' && pathname === '/api/review') {
      const review = await loadStudioResource(runtime.getProjectRoot(), 'review', {
        proposals: [],
        updatedAt: 0,
      });
      success(res, review);
      return;
    }

    if (method === 'PUT' && pathname === '/api/review') {
      const payload = await readJsonBody<{ proposals?: unknown[] }>(req);
      const review = await saveStudioResource(runtime.getProjectRoot(), 'review', {
        proposals: Array.isArray(payload.proposals) ? payload.proposals : [],
        updatedAt: Date.now(),
      });
      eventBus?.emit({
        type: 'resource.changed',
        resourceId: 'review://proposals',
        message: 'Review proposals updated',
      });
      success(res, review);
      return;
    }

    if (method === 'GET' && pathname === '/api/comments') {
      const comments = await loadStudioResource(runtime.getProjectRoot(), 'comments', {
        threads: [],
        updatedAt: 0,
      });
      success(res, comments);
      return;
    }

    if (method === 'PUT' && pathname === '/api/comments') {
      requireCapability(req, 'comment.write');
      const payload = await readJsonBody<{ threads?: unknown[] }>(req);
      const comments = await saveStudioResource(runtime.getProjectRoot(), 'comments', {
        threads: Array.isArray(payload.threads) ? payload.threads : [],
        updatedAt: Date.now(),
      });
      eventBus?.emit({
        type: 'resource.changed',
        resourceId: 'comments://threads',
        message: 'Comment threads updated',
      });
      success(res, comments);
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
      const vercelToken = process.env.VERCEL_TOKEN;
      if (!vercelToken) {
        throw new EngineHttpError(
          'Deploy not configured. Set VERCEL_TOKEN environment variable to enable.',
          501,
          'DEPLOY_NOT_CONFIGURED'
        );
      }
      const payload = await readJsonBody<{
        projectId?: string;
        teamId?: string;
        outputDir?: string;
      }>(req, { required: false });
      const projectId = payload.projectId || process.env.VERCEL_PROJECT_ID;
      const teamId = payload.teamId || process.env.VERCEL_TEAM_ID;
      if (!projectId) {
        throw new EngineHttpError(
          'Missing projectId. Set VERCEL_PROJECT_ID or pass projectId in request body.',
          400,
          'DEPLOY_MISSING_PROJECT_ID'
        );
      }
      // Trigger deploy via Vercel API
      const deployUrl = teamId
        ? `https://api.vercel.com/v13/deployments?teamId=${encodeURIComponent(teamId)}`
        : 'https://api.vercel.com/v13/deployments';
      const deployRes = await fetch(deployUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${vercelToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: runtime.getProject().config.name,
          project: projectId,
          target: 'production',
          gitSource: undefined,
        }),
      });
      if (!deployRes.ok) {
        const errBody = await deployRes.text();
        throw new EngineHttpError(
          `Vercel deploy failed (${deployRes.status}): ${errBody}`,
          502,
          'DEPLOY_FAILED',
          { status: deployRes.status },
        );
      }
      const deployData = await deployRes.json() as Record<string, unknown>;
      success(res, {
        deploymentId: deployData.id,
        url: deployData.url,
        readyState: deployData.readyState,
        createdAt: deployData.createdAt,
      });
      return;
    }

    // ── Terminal Session API ──

    if (method === 'POST' && pathname === '/api/terminal/sessions') {
      requireCapability(req, 'process.exec');
      if (!terminals) {
        throw new EngineHttpError('Terminal sessions not available', 503, 'TERMINAL_UNAVAILABLE');
      }
      const info = terminals.create();
      success(res, { session: info }, 201);
      return;
    }

    if (method === 'GET' && pathname === '/api/terminal/sessions') {
      requireCapability(req, 'process.exec');
      if (!terminals) {
        throw new EngineHttpError('Terminal sessions not available', 503, 'TERMINAL_UNAVAILABLE');
      }
      success(res, { sessions: terminals.listSessions() });
      return;
    }

    if (termMatch) {
      requireCapability(req, 'process.exec');
      if (!terminals) {
        throw new EngineHttpError('Terminal sessions not available', 503, 'TERMINAL_UNAVAILABLE');
      }
      const sessionId = decodeURIComponent(termMatch[1]!);
      const action = termMatch[2];

      if (method === 'GET' && !action) {
        success(res, { session: terminals.getInfo(sessionId) });
        return;
      }

      if (method === 'POST' && action === 'write') {
        const payload = await readJsonBody<{ data: string }>(req);
        terminals.write(sessionId, payload.data);
        success(res, { written: true });
        return;
      }

      if (method === 'POST' && action === 'kill') {
        terminals.kill(sessionId);
        success(res, { killed: true });
        return;
      }

      if (method === 'GET' && action === 'stream') {
        setSseHeaders(res);
        res.flushHeaders?.();
        const unsubscribe = terminals.subscribe(sessionId, (chunk) => {
          res.write(`event: output\n`);
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
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

    // ── Eval API ──

    if (method === 'POST' && pathname === '/api/tools/eval/run') {
      requireCapability(req, 'engine.execute');
      const payload = await readJsonBody<{
        flowId: string;
        nodeId: string;
        runs?: number;
        variant?: { fragments: Fragment[] };
        input?: Record<string, any>;
        state?: Record<string, any>;
        model?: string;
      }>(req);
      if (!payload.flowId) {
        throw new EngineHttpError('flowId is required', 400, 'FLOW_ID_REQUIRED');
      }
      if (!payload.nodeId) {
        throw new EngineHttpError('nodeId is required', 400, 'NODE_ID_REQUIRED');
      }
      const flow = runtime.getFlow(payload.flowId);
      findPromptBuildNode(flow, payload.nodeId);

      const core = runtime.getKalCore();
      const stateStore = core.state;
      const project = runtime.getProject();
      const resolver = (id: string): string => {
        const raw = project.flowTextsById[id];
        if (!raw) throw new Error(`Unknown flow: ${id}`);
        return raw;
      };

      let stateOverrides: Record<string, StateValue> | undefined;
      if (payload.state) {
        stateOverrides = {};
        for (const [key, value] of Object.entries(payload.state)) {
          if (value && typeof value === 'object' && 'type' in value && 'value' in value) {
            stateOverrides[key] = value as StateValue;
          } else if (typeof value === 'string') stateOverrides[key] = { type: 'string', value };
          else if (typeof value === 'number') stateOverrides[key] = { type: 'number', value };
          else if (typeof value === 'boolean') stateOverrides[key] = { type: 'boolean', value };
          else if (Array.isArray(value)) stateOverrides[key] = { type: 'array', value };
          else if (value !== null && typeof value === 'object') stateOverrides[key] = { type: 'object', value };
        }
      }

      const result = await runEval(core, stateStore, {
        flow,
        flowId: payload.flowId,
        nodeId: payload.nodeId,
        variantFragments: payload.variant?.fragments,
        runs: payload.runs ?? 5,
        input: payload.input,
        state: stateOverrides,
        resolver,
        variantLabel: payload.variant ? 'variant' : undefined,
        modelOverride: payload.model,
      });

      success(res, result);
      return;
    }

    if (method === 'POST' && pathname === '/api/tools/eval/compare') {
      const payload = await readJsonBody<{ a: any; b: any }>(req);
      if (!payload.a || !payload.b) {
        throw new EngineHttpError('Both "a" and "b" result objects are required', 400, 'MISSING_COMPARE_DATA');
      }
      const comparison = buildComparison(
        payload.a,
        payload.b,
        payload.a.variant ?? 'A',
        payload.b.variant ?? 'B',
      );
      success(res, comparison);
      return;
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
      const rest = pathname.slice('/api/flows/'.length);
      // GET /api/flows/:flowId/render-prompt?nodeId=xxx
      const renderMatch = rest.match(/^([^/]+)\/render-prompt$/);
      if (renderMatch) {
        const flowId = decodeURIComponent(renderMatch[1]!);
        const nodeId = url.searchParams.get('nodeId');
        if (!nodeId) {
          throw new EngineHttpError('Missing required query parameter: nodeId', 400, 'MISSING_PARAM');
        }
        const flow = runtime.getFlow(flowId);
        const node = flow.data.nodes.find((n) => n.id === nodeId);
        if (!node) {
          throw new EngineHttpError(`Node not found: ${nodeId}`, 404, 'NODE_NOT_FOUND', { flowId, nodeId });
        }
        if (node.type !== 'PromptBuild') {
          throw new EngineHttpError(
            `Node "${nodeId}" is type "${node.type}", expected PromptBuild`,
            400, 'INVALID_NODE_TYPE', { flowId, nodeId, actualType: node.type },
          );
        }
        const fragments: Fragment[] = node.config?.fragments ?? [];
        const state = runtime.getState();
        const result = renderPrompt(nodeId, fragments, state);
        success(res, result);
        return;
      }

      const flowId = decodeURIComponent(rest);
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

    if (method === 'POST' && pathname === '/api/executions/stream') {
      requireCapability(req, 'engine.execute');
      const payload = await readJsonBody<ExecuteFlowRequest>(req);
      if (!payload.flowId) {
        throw new EngineHttpError('flowId is required', 400, 'FLOW_ID_REQUIRED');
      }

      // SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      let closed = false;
      const cleanup = () => { closed = true; };
      req.on('close', cleanup);

      const sendEvent = (event: Record<string, any>) => {
        if (closed) return;
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      };

      try {
        await runtime.executeFlowStreaming(
          payload.flowId,
          payload.input ?? {},
          sendEvent,
        );
        // Send final result as flow.end (already sent by hook, but ensure completion)
        if (!closed) {
          res.end();
        }
      } catch (error) {
        if (!closed) {
          sendEvent({
            type: 'flow.error',
            executionId: '',
            flowId: payload.flowId,
            error: { message: (error as Error).message },
            timestamp: Date.now(),
          });
          res.end();
        }
      }
      return;
    }

    if (method === 'GET' && pathname === '/api/nodes') {
      success(res, { nodes: runtime.getNodeManifests() });
      return;
    }

    // ── Custom Node Source API ──

    const nodeSourceMatch = pathname.match(/^\/api\/nodes\/([^/]+)\/source$/);
    if (nodeSourceMatch) {
      const nodeType = decodeURIComponent(nodeSourceMatch[1]!);

      if (method === 'GET') {
        const result = await runtime.getCustomNodeSource(nodeType);
        success(res, result);
        return;
      }

      if (method === 'PUT') {
        requireCapability(req, 'project.write');
        const payload = await readJsonBody<{ source: string }>(req);
        if (typeof payload.source !== 'string') {
          throw new EngineHttpError('source field is required', 400, 'SOURCE_REQUIRED');
        }
        await runtime.saveCustomNodeSource(nodeType, payload.source);
        eventBus?.emit({ type: 'resource.changed', message: `Custom node source saved: ${nodeType}` });
        success(res, { savedAt: new Date().toISOString() });
        return;
      }
    }

    if (method === 'POST' && pathname === '/api/runs') {
      requireCapability(req, 'engine.execute');
      const payload = await readJsonBody<CreateRunRequest>(req, { required: false });
      if (payload.smokeInputs) {
        const result = await runs.smokeRun({
          forceNew: payload.forceNew,
          cleanup: payload.cleanup,
          smokeInputs: payload.smokeInputs,
        });
        success(res, { run: result.run }, 201);
      } else {
        const created = await runs.createRun({
          forceNew: payload.forceNew,
          cleanup: payload.cleanup,
          mode: payload.mode,
        });
        success(res, { run: created.run }, 201);
      }
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

      if (method === 'DELETE' && !action) {
        await runs.deleteRun(runId);
        success(res, { deleted: true, run_id: runId });
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

      if (method === 'POST' && action === 'retry') {
        const payload = await readJsonBody<RetryRunRequest>(req, { required: false });
        const retried = await runs.retryRun({
          runId,
          input: payload.input,
          cleanup: payload.cleanup,
          mode: payload.mode,
        });
        success(res, { run: retried.run });
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

    const templateMatch = pathname.match(/^\/api\/packages\/([^/]+)\/templates\/([^/]+)(?:\/(apply))?$/);
    if (templateMatch) {
      const packageId = decodeURIComponent(templateMatch[1]!);
      const templateId = decodeURIComponent(templateMatch[2]!);
      const action = templateMatch[3];

      if (method === 'GET' && !action) {
        success(res, await loadTemplateBundle(runtime.getProjectRoot(), packageId, templateId));
        return;
      }

      if (method === 'POST' && action === 'apply') {
        requireCapability(req, 'project.write');
        const bundle = await loadTemplateBundle(runtime.getProjectRoot(), packageId, templateId);
        for (const [flowId, flow] of Object.entries(bundle.flows)) {
          await runtime.saveFlow(flowId, flow);
        }
        if (bundle.session) {
          await runtime.saveSession(bundle.session);
        }
        const nextState = {
          ...runtime.getProject().initialState,
          ...bundle.state,
        };
        await writeFile(
          join(runtime.getProjectRoot(), 'initial_state.json'),
          JSON.stringify(nextState, null, 2),
          'utf8',
        );
        await runtime.reload();
        eventBus?.emit({
          type: 'resource.changed',
          resourceId: `template://${templateId}`,
          message: `Template applied: ${templateId}`,
        });
        success(res, bundle);
        return;
      }
    }

    if (pathname.startsWith('/api/registry/')) {
      const registryUrl = process.env.REGISTRY_URL;
      if (!registryUrl) {
        throw new EngineHttpError(
          'Registry API not configured. Set REGISTRY_URL environment variable to enable.',
          501,
          'REGISTRY_NOT_CONFIGURED'
        );
      }

      const registry = new RegistryClient({
        url: registryUrl,
        token: process.env.REGISTRY_TOKEN,
      });
      const rest = pathname.slice('/api/registry'.length);

      if (method === 'GET' && rest === '/packages') {
        const q = url.searchParams.get('q') ?? undefined;
        const page = Number(url.searchParams.get('page') ?? '1');
        const pageSize = Number(url.searchParams.get('pageSize') ?? '20');
        success(res, await registry.search(q, page, pageSize));
        return;
      }

      const packageMatch = rest.match(/^\/packages\/([^/]+)$/);
      if (method === 'GET' && packageMatch) {
        success(res, await registry.getPackage(decodeURIComponent(packageMatch[1]!)));
        return;
      }

      throw new EngineHttpError(`Registry route not found: ${method} ${pathname}`, 404, 'REGISTRY_ROUTE_NOT_FOUND');
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
  const terminals = new TerminalSessionManager(params.runtime.getProjectRoot());

  // Forward run events to unified event stream
  runs.subscribe((runEvent) => {
    eventBus.emit({
      type: runEvent.type as EngineEventName,
      runId: runEvent.run.run_id,
      message: `Run ${runEvent.type.replace('run.', '')}`,
    });
  });

  // Bridge file watcher events to SSE
  params.runtime.onExternalChange = (event) => {
    switch (event.kind) {
      case 'flow':
        eventBus.emit({
          type: 'resource.changed',
          flowId: event.flowId,
          message: `Flow externally modified: ${event.flowId}`,
          external: true,
        });
        break;
      case 'config':
      case 'initialState':
      case 'customNode':
        eventBus.emit({
          type: 'project.reloaded',
          message: `Project externally modified (${event.kind})`,
          external: true,
        });
        break;
      case 'session':
        eventBus.emit({
          type: 'resource.changed',
          sessionId: 'default',
          message: 'Session externally modified',
          external: true,
        });
        break;
    }
  };
  params.runtime.startWatching();

  const server = createServer((req, res) => {
    void handleEngineRequest(params.runtime, req, res, { runs, eventBus, terminals });
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
      await params.runtime.stopWatching();
      terminals.dispose();
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
