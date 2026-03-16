import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { FlowDefinition, SessionDefinition } from '@kal-ai/core';
import { EngineHttpError, formatEngineError, statusForError } from './errors';
import { RunManager } from './run-manager';
import type {
  AdvanceRunRequest,
  CreateRunRequest,
  DiagnosticsPayload,
  EngineErrorResponse,
  EngineResponse,
  ExecuteFlowRequest,
  RunStreamEvent,
  StartedEngineServer,
} from './types';
import { EngineRuntime } from './runtime';
import { collectLintPayload } from './commands/lint';

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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

function writeSseEvent(res: ServerResponse, event: RunStreamEvent): void {
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export interface EngineRequestContext {
  runs?: RunManager;
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
      success(res, { reloadedAt: new Date().toISOString() });
      return;
    }

    if (method === 'GET' && pathname === '/api/config') {
      success(res, { config: runtime.getProject().config });
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
      const flowId = decodeURIComponent(pathname.slice('/api/flows/'.length));
      const flow = await readJsonBody<FlowDefinition>(req);
      await runtime.saveFlow(flowId, flow);
      success(res, {
        flowId,
        savedAt: new Date().toISOString(),
      });
      return;
    }

    if (method === 'DELETE' && pathname.startsWith('/api/flows/')) {
      const flowId = decodeURIComponent(pathname.slice('/api/flows/'.length));
      await runtime.deleteFlow(flowId);
      success(res, {
        flowId,
        deletedAt: new Date().toISOString(),
      });
      return;
    }

    if (method === 'POST' && pathname === '/api/executions') {
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
      const session = await readJsonBody<SessionDefinition>(req);
      await runtime.saveSession(session);
      success(res, { savedAt: new Date().toISOString() });
      return;
    }

    if (method === 'DELETE' && pathname === '/api/session') {
      await runtime.deleteSession();
      success(res, { deletedAt: new Date().toISOString() });
      return;
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
  const server = createServer((req, res) => {
    void handleEngineRequest(params.runtime, req, res, { runs });
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
