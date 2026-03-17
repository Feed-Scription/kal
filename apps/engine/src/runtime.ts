import { BUILTIN_NODES, FlowLoader, createKalCore, runSession, validateSessionDefinition } from '@kal-ai/core';
import type {
  FlowDefinition,
  FlowExecutionResult,
  NodeManifest,
  SessionDefinition,
  SessionEvent,
  StateValue,
} from '@kal-ai/core';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { EngineHttpError } from './errors';
import { loadEngineProject } from './project-loader';
import type { EngineProject, FlowListItem, ProjectInfo } from './types';

export class EngineRuntime {
  private projectRoot: string;
  private project: EngineProject | null = null;
  private core: ReturnType<typeof createKalCore> | null = null;

  private constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  static async create(projectRoot: string): Promise<EngineRuntime> {
    const runtime = new EngineRuntime(projectRoot);
    await runtime.reload();
    return runtime;
  }

  async reload(): Promise<void> {
    // loadEngineProject automatically bridges .kal/config.env → process.env
    this.project = await loadEngineProject(this.projectRoot);

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
}
