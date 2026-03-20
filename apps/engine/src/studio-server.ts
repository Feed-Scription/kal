import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { RunManager } from './run-manager';
import { TerminalSessionManager } from './terminal-session';
import { handleEngineRequest, EngineEventBus } from './server';
import type { StartedEngineServer, EngineEventName } from './types';
import { EngineRuntime } from './runtime';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
};

function getStudioDistDir(): string {
  const thisDir = fileURLToPath(new URL('.', import.meta.url));
  return join(thisDir, 'studio');
}

function isHashedAsset(filePath: string): boolean {
  // Vite produces files like assets/index-abc123.js
  return /\/assets\//.test(filePath);
}

async function serveStaticFile(
  res: ServerResponse,
  studioDir: string,
  pathname: string,
): Promise<boolean> {
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(studioDir, safePath);

  // Directory traversal guard
  if (!filePath.startsWith(studioDir)) {
    return false;
  }

  try {
    const content = await readFile(filePath);
    const ext = extname(filePath);
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.statusCode = 200;
    res.setHeader('Content-Type', mime);
    if (isHashedAsset(safePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

async function handleStudioRequest(
  runtime: EngineRuntime,
  runs: RunManager,
  terminals: TerminalSessionManager,
  eventBus: EngineEventBus,
  studioDir: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
  const method = req.method ?? 'GET';
  const pathname = url.pathname;

  // All /api/* requests and non-GET requests go to the engine
  if (pathname.startsWith('/api/') || method !== 'GET') {
    return handleEngineRequest(runtime, req, res, { runs, eventBus, terminals });
  }

  // Try serving the exact static file
  if (await serveStaticFile(res, studioDir, pathname)) {
    return;
  }

  // SPA fallback: serve index.html
  const indexPath = join(studioDir, 'index.html');
  try {
    const content = await readFile(indexPath);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(content);
  } catch {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(
      'Studio has not been built yet.\n\n' +
      'Run: pnpm --filter @kal-ai/engine build\n',
    );
  }
}

export async function startStudioServer(params: {
  runtime: EngineRuntime;
  host?: string;
  port?: number;
  runStateDir?: string;
}): Promise<StartedEngineServer> {
  const host = params.host ?? '127.0.0.1';
  const port = params.port ?? 3000;
  const studioDir = getStudioDistDir();
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
    void handleStudioRequest(params.runtime, runs, terminals, eventBus, studioDir, req, res);
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
