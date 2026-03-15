import type { FlowDefinition, InitialState, SessionDefinition } from '@kal-ai/core';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export async function createTempProject(params?: {
  flows?: Record<string, FlowDefinition>;
  initialState?: InitialState;
  customNodeSource?: string;
  session?: SessionDefinition;
}): Promise<{ projectRoot: string; cleanup(): Promise<void> }> {
  const projectRoot = await mkdtemp(join(tmpdir(), 'kal-engine-'));
  await mkdir(join(projectRoot, 'flow'), { recursive: true });

  const config = {
    name: 'test-project',
    version: '1.0.0',
    engine: {
      logLevel: 'error',
      maxConcurrentFlows: 4,
      timeout: 1000,
    },
    llm: {
      provider: 'openai',
      apiKey: 'test-key',
      defaultModel: 'test-model',
      retry: {
        maxRetries: 0,
        initialDelayMs: 0,
        maxDelayMs: 0,
        backoffMultiplier: 2,
        jitter: false,
      },
      cache: {
        enabled: false,
      },
    },
  };

  await writeFile(join(projectRoot, 'kal_config.json'), JSON.stringify(config, null, 2), 'utf8');
  await writeFile(
    join(projectRoot, 'initial_state.json'),
    JSON.stringify(params?.initialState ?? {}, null, 2),
    'utf8'
  );

  const flows = params?.flows ?? {
    main: createPassThroughFlow(),
  };
  for (const [flowId, flow] of Object.entries(flows)) {
    await writeFile(join(projectRoot, 'flow', `${flowId}.json`), JSON.stringify(flow, null, 2), 'utf8');
  }

  if (params?.customNodeSource) {
    await mkdir(join(projectRoot, 'node'), { recursive: true });
    await writeFile(join(projectRoot, 'node', 'CustomNode.ts'), params.customNodeSource, 'utf8');
  }

  if (params?.session) {
    await writeFile(join(projectRoot, 'session.json'), JSON.stringify(params.session, null, 2), 'utf8');
  }

  return {
    projectRoot,
    async cleanup() {
      await rm(projectRoot, { recursive: true, force: true });
    },
  };
}

export function createPassThroughFlow(): FlowDefinition {
  return {
    meta: {
      schemaVersion: '1.0.0',
      inputs: [{ name: 'message', type: 'string', required: true }],
      outputs: [{ name: 'reply', type: 'string' }],
    },
    data: {
      nodes: [
        {
          id: 'signal-in',
          type: 'SignalIn',
          inputs: [],
          outputs: [{ name: 'data', type: 'string' }],
          config: { channel: 'message' },
        },
        {
          id: 'signal-out',
          type: 'SignalOut',
          inputs: [{ name: 'data', type: 'string' }],
          outputs: [{ name: 'data', type: 'string' }],
          config: { channel: 'reply' },
        },
      ],
      edges: [
        {
          source: 'signal-in',
          sourceHandle: 'data',
          target: 'signal-out',
          targetHandle: 'data',
        },
      ],
    },
  };
}

export function createStateMutationFlow(): FlowDefinition {
  return {
    meta: {
      schemaVersion: '1.0.0',
    },
    data: {
      nodes: [
        {
          id: 'write-state',
          type: 'WriteState',
          inputs: [
            { name: 'key', type: 'string', defaultValue: 'visited' },
            { name: 'value', type: 'any', defaultValue: true },
          ],
          outputs: [{ name: 'applied', type: 'array' }, { name: 'success', type: 'boolean' }],
        },
      ],
      edges: [],
    },
  };
}
