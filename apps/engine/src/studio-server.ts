import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { RunManager } from './run-manager';
import { handleEngineRequest } from './server';
import type { StartedEngineServer } from './types';
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
  studioDir: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
  const method = req.method ?? 'GET';
  const pathname = url.pathname;

  // All /api/* requests and non-GET requests go to the engine
  if (pathname.startsWith('/api/') || method !== 'GET') {
    return handleEngineRequest(runtime, req, res, { runs });
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

  const server = createServer((req, res) => {
    void handleStudioRequest(params.runtime, runs, studioDir, req, res);
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
