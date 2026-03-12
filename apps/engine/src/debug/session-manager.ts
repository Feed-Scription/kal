import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import type { DebugRunSnapshot, DebugRunSummary } from './types';

interface ActiveRunsFile {
  activeByProject: Record<string, string>;
}

const CUSTOM_NODE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs']);

export class DebugSessionManager {
  readonly stateDir: string;
  private readonly activeFilePath: string;

  constructor(stateDir?: string) {
    this.stateDir = resolve(stateDir ?? join(homedir(), '.kal', 'debug-runs'));
    this.activeFilePath = join(this.stateDir, 'active.json');
  }

  async createRun(params: Omit<DebugRunSnapshot, 'runId' | 'createdAt' | 'updatedAt'>): Promise<DebugRunSnapshot> {
    const now = Date.now();
    const runId = `dbg_${now}_${randomBytes(3).toString('hex')}`;
    const snapshot: DebugRunSnapshot = {
      ...params,
      runId,
      createdAt: now,
      updatedAt: now,
    };
    await this.saveRun(snapshot);
    return snapshot;
  }

  async saveRun(snapshot: DebugRunSnapshot): Promise<void> {
    await this.ensureStateDir();
    await writeFile(this.runFilePath(snapshot.runId), JSON.stringify(snapshot, null, 2), 'utf8');
  }

  async readRun(runId: string): Promise<DebugRunSnapshot | undefined> {
    try {
      const raw = await readFile(this.runFilePath(runId), 'utf8');
      return JSON.parse(raw) as DebugRunSnapshot;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  }

  async deleteRun(runId: string): Promise<void> {
    await rm(this.runFilePath(runId), { force: true });
  }

  async listRuns(projectRoot: string): Promise<DebugRunSummary[]> {
    await this.ensureStateDir();
    const activeRunId = await this.getActiveRunId(projectRoot);
    const entries = await readdir(this.stateDir, { withFileTypes: true });
    const summaries: DebugRunSummary[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name === 'active.json') {
        continue;
      }

      const snapshot = await this.readRun(basename(entry.name, '.json'));
      if (!snapshot || snapshot.projectRoot !== projectRoot) {
        continue;
      }

      summaries.push({
        runId: snapshot.runId,
        projectRoot: snapshot.projectRoot,
        status: snapshot.status,
        waitingFor: snapshot.waitingFor,
        updatedAt: snapshot.updatedAt,
        createdAt: snapshot.createdAt,
        active: snapshot.runId === activeRunId,
      });
    }

    return summaries.sort((left, right) => right.updatedAt - left.updatedAt);
  }

  async getActiveRunId(projectRoot: string): Promise<string | undefined> {
    const active = await this.readActiveFile();
    const runId = active.activeByProject[projectRoot];
    if (!runId) {
      return undefined;
    }

    const snapshot = await this.readRun(runId);
    if (!snapshot) {
      delete active.activeByProject[projectRoot];
      await this.writeActiveFile(active);
      return undefined;
    }

    return runId;
  }

  async setActiveRun(projectRoot: string, runId: string): Promise<void> {
    const active = await this.readActiveFile();
    active.activeByProject[projectRoot] = runId;
    await this.writeActiveFile(active);
  }

  async clearActiveRun(projectRoot: string, runId?: string): Promise<void> {
    const active = await this.readActiveFile();
    if (!active.activeByProject[projectRoot]) {
      return;
    }
    if (runId && active.activeByProject[projectRoot] !== runId) {
      return;
    }
    delete active.activeByProject[projectRoot];
    await this.writeActiveFile(active);
  }

  async computeSessionHash(projectRoot: string): Promise<string> {
    const hash = createHash('sha256');
    const resolvedRoot = resolve(projectRoot);

    for (const relativePath of await this.collectHashInputs(resolvedRoot)) {
      const filePath = join(resolvedRoot, relativePath);
      const raw = await readFile(filePath, 'utf8');
      hash.update(relativePath);
      hash.update('\n');
      hash.update(raw);
      hash.update('\n');
    }

    return hash.digest('hex');
  }

  private async collectHashInputs(projectRoot: string): Promise<string[]> {
    const files: string[] = [];

    const pushIfExists = async (relativePath: string) => {
      try {
        await readFile(join(projectRoot, relativePath), 'utf8');
        files.push(relativePath);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT') {
          throw error;
        }
      }
    };

    await pushIfExists('session.json');
    await pushIfExists('initial_state.json');

    files.push(...await this.collectFiles(join(projectRoot, 'flow'), 'flow', '.json'));
    files.push(...await this.collectFiles(join(projectRoot, 'node'), 'node'));

    return files.sort();
  }

  private async collectFiles(directory: string, prefix: string, extension?: string): Promise<string[]> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    const files: string[] = [];
    for (const entry of entries) {
      const relativePath = join(prefix, entry.name);
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        files.push(...await this.collectFiles(fullPath, relativePath, extension));
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (extension && !entry.name.endsWith(extension)) {
        continue;
      }
      if (!extension) {
        const dotIndex = entry.name.lastIndexOf('.');
        const ext = dotIndex >= 0 ? entry.name.slice(dotIndex) : '';
        if (!CUSTOM_NODE_EXTENSIONS.has(ext)) {
          continue;
        }
      }
      files.push(relativePath);
    }

    return files;
  }

  private runFilePath(runId: string): string {
    return join(this.stateDir, `${runId}.json`);
  }

  private async ensureStateDir(): Promise<void> {
    await mkdir(this.stateDir, { recursive: true });
  }

  private async readActiveFile(): Promise<ActiveRunsFile> {
    await this.ensureStateDir();
    try {
      const raw = await readFile(this.activeFilePath, 'utf8');
      return JSON.parse(raw) as ActiveRunsFile;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return { activeByProject: {} };
      }
      throw error;
    }
  }

  private async writeActiveFile(active: ActiveRunsFile): Promise<void> {
    await this.ensureStateDir();
    await writeFile(this.activeFilePath, JSON.stringify(active, null, 2), 'utf8');
  }
}
