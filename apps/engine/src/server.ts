import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { FlowDefinition, SessionDefinition } from '@kal-ai/core';
import { EngineHttpError, formatEngineError, statusForError } from './errors';
import type {
  EngineErrorResponse,
  EngineResponse,
  ExecuteFlowRequest,
  StartedEngineServer,
} from './types';
import { EngineRuntime } from './runtime';

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

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.includes('application/json')) {
    throw new EngineHttpError(
      'Content-Type must be application/json',
      415,
      'UNSUPPORTED_CONTENT_TYPE',
      { contentType }
    );
  }

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
    throw new EngineHttpError('Request body is required', 400, 'REQUEST_BODY_REQUIRED');
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

export async function handleEngineRequest(
  runtime: EngineRuntime,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
  const method = req.method ?? 'GET';
  const pathname = url.pathname;

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
}): Promise<StartedEngineServer> {
  const host = params.host ?? '127.0.0.1';
  const port = params.port ?? 3000;
  const server = createServer((req, res) => {
    void handleEngineRequest(params.runtime, req, res);
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
