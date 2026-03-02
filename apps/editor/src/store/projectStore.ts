import { create } from 'zustand';
import type { ProjectData, FlowDefinition, ProjectState, KalConfig } from '@/types/project';

type ProjectStore = {
  project: ProjectData | null;
  currentFlow: string | null;
  directoryHandle: FileSystemDirectoryHandle | null;

  // Actions
  loadProject: (dirHandle: FileSystemDirectoryHandle) => Promise<void>;
  saveFlow: (flowName: string, flow: FlowDefinition) => Promise<void>;
  saveState: (state: ProjectState) => Promise<void>;
  saveConfig: (config: KalConfig) => Promise<void>;
  setCurrentFlow: (flowName: string) => void;
  closeProject: () => void;
  createFlow: (flowName: string) => Promise<void>;
  renameFlow: (oldName: string, newName: string) => Promise<void>;
  deleteFlow: (flowName: string) => Promise<void>;
};

export const useProjectStore = create<ProjectStore>((set, get) => ({
  project: null,
  currentFlow: null,
  directoryHandle: null,

  loadProject: async (dirHandle: FileSystemDirectoryHandle) => {
    try {
      // Load config
      const configFile = await dirHandle.getFileHandle('kal_config.json');
      const configData = await configFile.getFile();
      const config: KalConfig = JSON.parse(await configData.text());

      // Load flows
      const flowDir = await dirHandle.getDirectoryHandle('flow');
      const flows: Record<string, FlowDefinition> = {};

      for await (const entry of flowDir.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.json')) {
          const fileHandle = entry as FileSystemFileHandle;
          const file = await fileHandle.getFile();
          const flowName = entry.name.replace('.json', '');
          flows[flowName] = JSON.parse(await file.text());
        }
      }

      // Load state (optional)
      let state: ProjectState = {};
      try {
        const stateFile = await dirHandle.getFileHandle('initial_state.json');
        const stateData = await stateFile.getFile();
        state = JSON.parse(await stateData.text());
      } catch (err) {
        // State file is optional
      }

      const projectData: ProjectData = {
        path: dirHandle.name,
        config,
        flows,
        state,
      };

      set({
        project: projectData,
        directoryHandle: dirHandle,
        currentFlow: Object.keys(flows)[0] || null,
      });
    } catch (error) {
      console.error('Failed to load project:', error);
      throw error;
    }
  },

  saveFlow: async (flowName: string, flow: FlowDefinition) => {
    const { project, directoryHandle } = get();
    if (!project || !directoryHandle) return;

    try {
      const flowDir = await directoryHandle.getDirectoryHandle('flow');
      const flowFile = await flowDir.getFileHandle(`${flowName}.json`, { create: true });
      const writable = await flowFile.createWritable();
      await writable.write(JSON.stringify(flow, null, 2));
      await writable.close();

      set({
        project: {
          ...project,
          flows: {
            ...project.flows,
            [flowName]: flow,
          },
        },
      });
    } catch (error) {
      console.error('Failed to save flow:', error);
      throw error;
    }
  },

  saveState: async (state: ProjectState) => {
    const { project, directoryHandle } = get();
    if (!project || !directoryHandle) return;

    try {
      const stateFile = await directoryHandle.getFileHandle('initial_state.json', { create: true });
      const writable = await stateFile.createWritable();
      await writable.write(JSON.stringify(state, null, 2));
      await writable.close();

      set({
        project: {
          ...project,
          state,
        },
      });
    } catch (error) {
      console.error('Failed to save state:', error);
      throw error;
    }
  },

  saveConfig: async (config: KalConfig) => {
    const { project, directoryHandle } = get();
    if (!project || !directoryHandle) return;

    try {
      const configFile = await directoryHandle.getFileHandle('kal_config.json', { create: true });
      const writable = await configFile.createWritable();
      await writable.write(JSON.stringify(config, null, 2));
      await writable.close();

      set({
        project: {
          ...project,
          config,
        },
      });
    } catch (error) {
      console.error('Failed to save config:', error);
      throw error;
    }
  },

  setCurrentFlow: (flowName: string) => {
    set({ currentFlow: flowName });
  },

  closeProject: () => {
    set({ project: null, currentFlow: null, directoryHandle: null });
  },

  createFlow: async (flowName: string) => {
    const { project, directoryHandle } = get();
    if (!project || !directoryHandle) return;

    // Check if flow already exists
    if (project.flows[flowName]) {
      throw new Error(`Flow "${flowName}" already exists`);
    }

    const newFlow: FlowDefinition = {
      schemaVersion: '1.0.0',
      nodes: [],
      edges: [],
    };

    try {
      const flowDir = await directoryHandle.getDirectoryHandle('flow');
      const flowFile = await flowDir.getFileHandle(`${flowName}.json`, { create: true });
      const writable = await flowFile.createWritable();
      await writable.write(JSON.stringify(newFlow, null, 2));
      await writable.close();

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
    } catch (error) {
      console.error('Failed to create flow:', error);
      throw error;
    }
  },

  renameFlow: async (oldName: string, newName: string) => {
    const { project, directoryHandle, currentFlow } = get();
    if (!project || !directoryHandle) return;

    if (!project.flows[oldName]) {
      throw new Error(`Flow "${oldName}" does not exist`);
    }

    if (project.flows[newName]) {
      throw new Error(`Flow "${newName}" already exists`);
    }

    try {
      const flowDir = await directoryHandle.getDirectoryHandle('flow');
      const flow = project.flows[oldName];

      // Create new file
      const newFlowFile = await flowDir.getFileHandle(`${newName}.json`, { create: true });
      const writable = await newFlowFile.createWritable();
      await writable.write(JSON.stringify(flow, null, 2));
      await writable.close();

      // Delete old file
      await flowDir.removeEntry(`${oldName}.json`);

      const { [oldName]: removed, ...remainingFlows } = project.flows;

      set({
        project: {
          ...project,
          flows: {
            ...remainingFlows,
            [newName]: flow,
          },
        },
        currentFlow: currentFlow === oldName ? newName : currentFlow,
      });
    } catch (error) {
      console.error('Failed to rename flow:', error);
      throw error;
    }
  },

  deleteFlow: async (flowName: string) => {
    const { project, directoryHandle, currentFlow } = get();
    if (!project || !directoryHandle) return;

    if (!project.flows[flowName]) {
      throw new Error(`Flow "${flowName}" does not exist`);
    }

    if (Object.keys(project.flows).length === 1) {
      throw new Error('Cannot delete the last flow');
    }

    try {
      const flowDir = await directoryHandle.getDirectoryHandle('flow');
      await flowDir.removeEntry(`${flowName}.json`);

      const { [flowName]: removed, ...remainingFlows } = project.flows;
      const newCurrentFlow = currentFlow === flowName
        ? Object.keys(remainingFlows)[0]
        : currentFlow;

      set({
        project: {
          ...project,
          flows: remainingFlows,
        },
        currentFlow: newCurrentFlow,
      });
    } catch (error) {
      console.error('Failed to delete flow:', error);
      throw error;
    }
  },
}));
