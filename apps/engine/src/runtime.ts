import { BUILTIN_NODES, FlowLoader, createKalCore, runSession, validateSessionDefinition } from '@kal-ai/core';
import type {
  FlowDefinition,
  FlowExecutionResult,
  KalConfig,
  NodeManifest,
  SessionDefinition,
  SessionEvent,
  StateValue,
} from '@kal-ai/core';
import { readFile, writeFile, unlink, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { EngineHttpError } from './errors';
import { loadEngineProject } from './project-loader';
import type { EngineProject, FlowListItem, ProjectInfo } from './types';

export interface EngineRuntimeOptions {
  /** When true, unset env vars in config are replaced with placeholders instead of throwing */
  lenient?: boolean;
}

export class EngineRuntime {
  private projectRoot: string;
  private options: EngineRuntimeOptions;
  private project: EngineProject | null = null;
  private core: ReturnType<typeof createKalCore> | null = null;
  private watcher: FSWatcher | null = null;
  private selfWriteSet = new Set<string>();
  private cleanupTimers = new Map<string, NodeJS.Timeout>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  public onExternalFlowChange?: (flowId: string) => void;

  private constructor(projectRoot: string, options: EngineRuntimeOptions = {}) {
    this.projectRoot = projectRoot;
    this.options = options;
  }

  static async create(projectRoot: string, options?: EngineRuntimeOptions): Promise<EngineRuntime> {
    const runtime = new EngineRuntime(projectRoot, options);
    await runtime.reload();
    return runtime;
  }

  async reload(): Promise<void> {
    // loadEngineProject automatically bridges .kal/config.env → process.env
    this.project = await loadEngineProject(this.projectRoot, { lenient: this.options.lenient });

    this.core = createKalCore({
      config: this.project.config,
      initialState: this.project.initialState,
      customNodeProjectRoot: this.project.projectRoot,
    });
    await this.core.ready;
  }

  private getCore(): ReturnType<typeof createKalCore> {
    if (!this.core) {
      throw new EngineHttpError('Engine runtime is not loaded', 500, 'RUNTIME_NOT_READY');
    }
    return this.core;
  }

  getKalCore(): ReturnType<typeof createKalCore> {
    return this.getCore();
  }

  getProjectRoot(): string {
    return this.projectRoot;
  }

  /**
   * Guard: ensure config has no unresolved placeholders before executing.
   * In lenient mode, env vars like ${OPENAI_API_KEY} are replaced with
   * "<unset:OPENAI_API_KEY>" placeholders — this check catches them at
   * execution time with a clear error message.
   */
  private assertConfigReady(): void {
    const config = this.getProject().config;
    const placeholders: string[] = [];
    const check = (value: unknown, path: string) => {
      if (typeof value === 'string' && value.includes('<unset:')) {
        const match = value.match(/<unset:([^>]+)>/);
        if (match) placeholders.push(match[1]!);
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [key, child] of Object.entries(value)) {
          check(child, `${path}.${key}`);
        }
      }
    };
    check(config, 'config');
    if (placeholders.length > 0) {
      const unique = [...new Set(placeholders)];
      throw new EngineHttpError(
        `Cannot execute: missing environment variables: ${unique.join(', ')}. Set them or run "kal config set-key" to configure.`,
        400,
        'CONFIG_ENV_NOT_SET',
        { missingVars: unique },
      );
    }
  }

  registerHooks(hooks: Partial<import('@kal-ai/core').EngineHooks>): void {
    this.getCore().hooks.registerAll(hooks);
  }

  getProject(): EngineProject {
    if (!this.project || !this.core) {
      throw new EngineHttpError('Engine runtime is not loaded', 500, 'RUNTIME_NOT_READY');
    }
    return this.project;
  }

  getProjectInfo(): ProjectInfo {
    const project = this.getProject();
    const core = this.getCore();
    const customNodeTypes = new Set(BUILTIN_NODES.map((node) => node.type));
    const customNodes = core.registry
      .getAll()
      .filter((node) => !customNodeTypes.has(node.type))
      .map((node) => node.type)
      .sort();

    return {
      name: project.config.name,
      version: project.config.version,
      flows: Object.keys(project.flowsById).sort(),
      customNodes,
      hasSession: this.hasSession(),
      state: {
        keys: Object.keys(core.state.getAll()).sort(),
      },
    };
  }

  listFlows(): FlowListItem[] {
    return Object.keys(this.getProject().flowsById)
      .sort()
      .map((id) => ({
        id,
        meta: this.getProject().flowsById[id]!.meta,
      }));
  }

  getFlow(flowId: string): FlowDefinition {
    const flow = this.getProject().flowsById[flowId];
    if (!flow) {
      throw new EngineHttpError(`Flow not found: ${flowId}`, 404, 'FLOW_NOT_FOUND', { flowId });
    }
    return flow;
  }

  private markSelfWrite(filePath: string): void {
    this.selfWriteSet.add(filePath);
    const existing = this.cleanupTimers.get(filePath);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.selfWriteSet.delete(filePath);
      this.cleanupTimers.delete(filePath);
    }, 2000);
    this.cleanupTimers.set(filePath, timer);
  }

  private isSelfWrite(filePath: string): boolean {
    return this.selfWriteSet.has(filePath);
  }

  async saveFlow(flowId: string, flow: FlowDefinition): Promise<void> {
    const project = this.getProject();
    const nextTexts = {
      ...project.flowTextsById,
      [flowId]: JSON.stringify(flow, null, 2),
    };

    const resolver = (id: string): string => {
      const raw = nextTexts[id];
      if (!raw) {
        throw new EngineHttpError(`Unknown flow: ${id}`, 404, 'FLOW_NOT_FOUND', { flowId: id });
      }
      return raw;
    };

    // Validate all flows before any mutation
    const builtinManifest = new Map(BUILTIN_NODES.map((n) => [n.type, { inputs: n.inputs, outputs: n.outputs }]));
    const loader = new FlowLoader((nodeType) => builtinManifest.get(nodeType));
    const nextFlows: Record<string, FlowDefinition> = {};
    for (const id of Object.keys(nextTexts).sort()) {
      nextFlows[id] = loader.load(id, resolver);
    }

    // Write to disk before updating in-memory state
    const targetFile = project.flowFileMap[flowId] ?? `${project.projectRoot}/flow/${flowId}.json`;
    this.markSelfWrite(targetFile);
    await writeFile(targetFile, nextTexts[flowId]!, 'utf8');

    // Atomically swap in-memory state only after all validation and I/O succeeded
    this.project = {
      ...project,
      flowTextsById: nextTexts,
      flowFileMap: { ...project.flowFileMap, [flowId]: targetFile },
      flowsById: nextFlows,
    };
  }

  async deleteFlow(flowId: string): Promise<void> {
    const project = this.getProject();
    if (!project.flowsById[flowId]) {
      throw new EngineHttpError(`Flow not found: ${flowId}`, 404, 'FLOW_NOT_FOUND', { flowId });
    }

    const nextTexts = { ...project.flowTextsById };
    const nextFileMap = { ...project.flowFileMap };
    delete nextTexts[flowId];
    delete nextFileMap[flowId];

    const resolver = (id: string): string => {
      const raw = nextTexts[id];
      if (!raw) {
        throw new EngineHttpError(`Unknown flow: ${id}`, 404, 'FLOW_NOT_FOUND', { flowId: id });
      }
      return raw;
    };

    const builtinManifest = new Map(BUILTIN_NODES.map((n) => [n.type, { inputs: n.inputs, outputs: n.outputs }]));
    const loader = new FlowLoader((nodeType) => builtinManifest.get(nodeType));
    const nextFlows: Record<string, FlowDefinition> = {};
    for (const id of Object.keys(nextTexts).sort()) {
      nextFlows[id] = loader.load(id, resolver);
    }

    const targetFile = project.flowFileMap[flowId];
    if (targetFile) {
      try {
        await unlink(targetFile);
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          throw err;
        }
      }
    }

    this.project = {
      ...project,
      flowTextsById: nextTexts,
      flowFileMap: nextFileMap,
      flowsById: nextFlows,
    };
  }

  async executeFlow(flowId: string, inputData: Record<string, any> = {}): Promise<FlowExecutionResult> {
    this.assertConfigReady();
    const project = this.getProject();
    const core = this.getCore();
    const flow = this.getFlow(flowId);
    return core.executeFlow(flow, flowId, inputData, (id) => {
      const raw = project.flowTextsById[id];
      if (!raw) {
        throw new EngineHttpError(`Unknown flow: ${id}`, 404, 'FLOW_NOT_FOUND', { flowId: id });
      }
      return raw;
    });
  }

  getNodeManifests(): NodeManifest[] {
    return this.getCore().registry.exportManifests();
  }

  async listCustomNodeFiles(): Promise<string[]> {
    const nodeDir = this.getProject().customNodeDir;
    try {
      const files = await readdir(nodeDir);
      return files.filter((f) => f.endsWith('.ts')).sort();
    } catch {
      return [];
    }
  }

  async getCustomNodeSource(nodeType: string): Promise<{ source: string; fileName: string }> {
    const nodeDir = this.getProject().customNodeDir;
    const fileName = `${nodeType}.ts`;
    const filePath = join(nodeDir, fileName);
    try {
      const source = await readFile(filePath, 'utf8');
      return { source, fileName };
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        throw new EngineHttpError(`Custom node source not found: ${nodeType}`, 404, 'NODE_SOURCE_NOT_FOUND', { nodeType });
      }
      throw err;
    }
  }

  async saveCustomNodeSource(nodeType: string, source: string): Promise<void> {
    const nodeDir = this.getProject().customNodeDir;
    const filePath = join(nodeDir, `${nodeType}.ts`);
    await writeFile(filePath, source, 'utf8');
    await this.reload();
  }

  getState(): Record<string, StateValue> {
    return this.getCore().state.getAll();
  }

  restoreState(snapshot: Record<string, StateValue>): void {
    this.getCore().state.restore(snapshot);
  }

  setState(key: string, value: any): void {
    const core = this.getCore();
    const existing = core.state.get(key);
    if (!existing.exists || !existing.value) {
      throw new EngineHttpError(`State key not found: ${key}`, 400, 'STATE_KEY_NOT_FOUND', { key });
    }
    const result = core.state.modify(key, value);
    if (!result.success) {
      throw result.error;
    }
  }

  getConfig(): KalConfig {
    return this.getProject().config;
  }

  async saveConfig(patch: Partial<KalConfig>): Promise<void> {
    const project = this.getProject();
    const configPath = join(project.projectRoot, 'kal_config.json');

    // Read the raw file to preserve env var references like ${OPENAI_API_KEY}
    let rawConfig: Record<string, any>;
    try {
      rawConfig = JSON.parse(await readFile(configPath, 'utf8'));
    } catch {
      rawConfig = {};
    }

    // Safety: always strip sensitive fields (apiKey / baseUrl) from the patch
    // so that env-var references in the raw config file are never overwritten.
    if (patch.llm) {
      const { apiKey: _apiKey, baseUrl: _baseUrl, ...safeLlmPatch } = patch.llm;
      patch = { ...patch, llm: safeLlmPatch as KalConfig['llm'] };
    }

    // Deep merge patch into raw config (preserving env var references in untouched fields)
    const merged = deepMerge(rawConfig, patch);
    await writeFile(configPath, JSON.stringify(merged, null, 2), 'utf8');

    // Reload to re-resolve env vars and update in-memory state
    await this.reload();
  }

  hasSession(): boolean {
    return this.getProject().session != null;
  }

  getSession(): SessionDefinition | undefined {
    return this.getProject().session;
  }

  async saveSession(session: SessionDefinition): Promise<void> {
    const project = this.getProject();
    const flowIds = Object.keys(project.flowsById);
    const errors = validateSessionDefinition(session, flowIds);
    if (errors.length > 0) {
      throw new EngineHttpError('Invalid session definition', 400, 'INVALID_SESSION', { errors });
    }
    const sessionPath = join(project.projectRoot, 'session.json');
    await writeFile(sessionPath, JSON.stringify(session, null, 2), 'utf8');
    this.project = { ...project, session };
  }

  async deleteSession(): Promise<void> {
    const project = this.getProject();
    const sessionPath = join(project.projectRoot, 'session.json');
    try {
      await unlink(sessionPath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
    this.project = { ...project, session: undefined };
  }

  createSession(): AsyncGenerator<SessionEvent, void, string | undefined> {
    const session = this.getProject().session;
    if (!session) {
      throw new EngineHttpError('Project has no session.json', 400, 'NO_SESSION');
    }
    return runSession(session, {
      executeFlow: (flowId, inputData) => this.executeFlow(flowId, inputData ?? {}),
      getState: () => this.getState(),
      setState: (key, value) => this.setState(key, value),
    });
  }

  private async reloadSingleFlow(flowId: string, filePath: string): Promise<boolean> {
    try {
      const diskContent = await readFile(filePath, 'utf8');
      const project = this.getProject();

      // Content comparison: skip if identical
      if (project.flowTextsById[flowId] === diskContent) {
        return false;
      }

      // Validate the new flow
      const builtinManifest = new Map(BUILTIN_NODES.map((n) => [n.type, { inputs: n.inputs, outputs: n.outputs }]));
      const loader = new FlowLoader((nodeType) => builtinManifest.get(nodeType));
      const nextTexts = { ...project.flowTextsById, [flowId]: diskContent };
      const resolver = (id: string): string => {
        const raw = nextTexts[id];
        if (!raw) throw new Error(`Unknown flow: ${id}`);
        return raw;
      };

      const nextFlows: Record<string, FlowDefinition> = {};
      for (const id of Object.keys(nextTexts).sort()) {
        nextFlows[id] = loader.load(id, resolver);
      }

      // Update in-memory state
      this.project = {
        ...project,
        flowTextsById: nextTexts,
        flowsById: nextFlows,
      };

      return true;
    } catch (error) {
      console.error(`Failed to reload flow ${flowId}:`, error);
      return false;
    }
  }

  startWatching(): void {
    if (this.watcher) return;

    const flowDir = join(this.projectRoot, 'flow');
    this.watcher = watch(flowDir, { recursive: false }, (_eventType, filename) => {
      if (!filename || !filename.endsWith('.json')) return;

      const filePath = join(flowDir, filename);
      if (this.isSelfWrite(filePath)) return;

      const flowId = filename.replace(/\.json$/, '');

      // Debounce: wait 500ms after last change
      const existing = this.debounceTimers.get(flowId);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(() => {
        this.debounceTimers.delete(flowId);
        this.reloadSingleFlow(flowId, filePath).then((changed) => {
          if (changed && this.onExternalFlowChange) {
            this.onExternalFlowChange(flowId);
          }
        });
      }, 500);

      this.debounceTimers.set(flowId, timer);
    });
  }

  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    for (const timer of this.cleanupTimers.values()) {
      clearTimeout(timer);
    }
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.cleanupTimers.clear();
    this.debounceTimers.clear();
    this.selfWriteSet.clear();
  }
}

function deepMerge(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = target[key];
    if (
      srcVal && typeof srcVal === 'object' && !Array.isArray(srcVal) &&
      tgtVal && typeof tgtVal === 'object' && !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(tgtVal, srcVal);
    } else {
      result[key] = srcVal;
    }
  }
  return result;
}
