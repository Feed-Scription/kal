import { create } from 'zustand';
import type {
  ProjectData,
  FlowDefinition,
  ProjectState,
  KalConfig,
  RunStateView,
  RunSummary,
  RunView,
  SessionDefinition,
} from '@/types/project';
import { engineApi } from '@/api/engine-client';

type ProjectStore = {
  project: ProjectData | null;
  currentFlow: string | null;
  engineConnected: boolean;
  connecting: boolean;
  connectionError: string | null;

  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  saveFlow: (flowName: string, flow: FlowDefinition) => Promise<void>;
  setCurrentFlow: (flowName: string) => void;
  createFlow: (flowName: string) => Promise<void>;
  executeFlow: (flowId: string, input?: Record<string, any>) => Promise<any>;
  reloadProject: () => Promise<void>;
  saveSession: (session: SessionDefinition) => Promise<void>;
  deleteSession: () => Promise<void>;
  createRun: (forceNew?: boolean) => Promise<RunView>;
  listRuns: () => Promise<RunSummary[]>;
  getRun: (runId: string) => Promise<RunView>;
  getRunState: (runId: string) => Promise<RunStateView>;
  advanceRun: (runId: string, input?: string) => Promise<RunView>;
  cancelRun: (runId: string) => Promise<void>;
};

export const useProjectStore = create<ProjectStore>((set, get) => ({
  project: null,
  currentFlow: null,
  engineConnected: false,
  connecting: false,
  connectionError: null,

  connect: async () => {
    set({ connecting: true, connectionError: null });
    try {
      const projectInfo = await engineApi.getProject();
      const flowList = await engineApi.listFlows();
      const nodeManifests = await engineApi.getNodes();

      const flows: Record<string, FlowDefinition> = {};
      for (const item of flowList) {
        flows[item.id] = await engineApi.getFlow(item.id);
      }

      const config: KalConfig = {
        name: projectInfo.name,
        version: projectInfo.version,
        engine: { logLevel: 'info', maxConcurrentFlows: 1, timeout: 30000 },
        llm: {
          provider: '',
          defaultModel: '',
          retry: {
            maxRetries: 3,
            initialDelayMs: 1000,
            maxDelayMs: 30000,
            backoffMultiplier: 2,
            jitter: true,
          },
          cache: { enabled: true },
        },
      };

      const state: ProjectState = {};

      let session: SessionDefinition | null = null;
      try {
        session = await engineApi.getSession();
      } catch {
        // session API may not exist yet, ignore
      }

      const projectData: ProjectData = {
        name: projectInfo.name,
        config,
        flows,
        state,
        session,
        nodeManifests,
      };

      set({
        project: projectData,
        engineConnected: true,
        connecting: false,
        currentFlow: flowList.length > 0 ? flowList[0].id : null,
      });
    } catch (error) {
      set({
        connecting: false,
        connectionError: (error as Error).message,
        engineConnected: false,
      });
      throw error;
    }
  },

  disconnect: () => {
    set({
      project: null,
      currentFlow: null,
      engineConnected: false,
      connecting: false,
      connectionError: null,
    });
  },

  saveFlow: async (flowName: string, flow: FlowDefinition) => {
    const { project } = get();
    if (!project) return;

    await engineApi.saveFlow(flowName, flow);

    set({
      project: {
        ...project,
        flows: {
          ...project.flows,
          [flowName]: flow,
        },
      },
    });
  },

  setCurrentFlow: (flowName: string) => {
    set({ currentFlow: flowName });
  },

  createFlow: async (flowName: string) => {
    const { project } = get();
    if (!project) return;

    if (project.flows[flowName]) {
      throw new Error(`Flow "${flowName}" already exists`);
    }

    const newFlow: FlowDefinition = {
      meta: { schemaVersion: '1.0' },
      data: { nodes: [], edges: [] },
    };

    await engineApi.saveFlow(flowName, newFlow);

    set({
      project: {
        ...project,
        flows: {
          ...project.flows,
          [flowName]: newFlow,
        },
      },
      currentFlow: flowName,
    });
  },

  executeFlow: async (flowId: string, input: Record<string, any> = {}) => {
    return engineApi.executeFlow(flowId, input);
  },

  reloadProject: async () => {
    await engineApi.reloadProject();
    await get().connect();
  },

  saveSession: async (session: SessionDefinition) => {
    const { project } = get();
    if (!project) return;

    await engineApi.saveSession(session);

    set({
      project: {
        ...project,
        session,
      },
    });
  },

  deleteSession: async () => {
    const { project } = get();
    if (!project) return;

    await engineApi.deleteSession();

    set({
      project: {
        ...project,
        session: null,
      },
    });
  },

  createRun: async (forceNew = false) => {
    return engineApi.createRun(forceNew);
  },

  listRuns: async () => {
    return engineApi.listRuns();
  },

  getRun: async (runId: string) => {
    return engineApi.getRun(runId);
  },

  getRunState: async (runId: string) => {
    return engineApi.getRunState(runId);
  },

  advanceRun: async (runId: string, input?: string) => {
    return engineApi.advanceRun(runId, input);
  },

  cancelRun: async (runId: string) => {
    await engineApi.cancelRun(runId);
  },
}));
