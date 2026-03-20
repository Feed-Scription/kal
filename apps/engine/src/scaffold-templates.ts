/**
 * Shared scaffold template definitions for `kal init` and `create-kal-game`.
 *
 * When updating templates here, also sync `packages/create-kal-game/bin.mjs`
 * which inlines the same data for zero-dependency npx usage.
 */

export type TemplateId = 'minimal' | 'game';

export type ScaffoldFile = {
  path: string;
  content: string;
};

export function buildConfig(projectName: string): object {
  return {
    name: projectName,
    version: '0.1.0',
    engine: {
      logLevel: 'info',
      maxConcurrentFlows: 5,
      nodeTimeout: 30000,
      runTimeout: 0,
    },
    llm: {
      provider: 'openai',
      defaultModel: 'gpt-4o-mini',
      apiKey: '${OPENAI_API_KEY}',
      retry: {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
        jitter: true,
      },
      cache: {
        enabled: true,
      },
    },
  };
}

function minimalExampleFlow(): object {
  return {
    meta: {
      schemaVersion: '1.0',
      inputs: [{ name: 'input', type: 'string' }],
      outputs: [{ name: 'output', type: 'string' }],
    },
    data: {
      nodes: [
        {
          id: 'signal-in',
          type: 'SignalIn',
          inputs: [],
          outputs: [{ name: 'data', type: 'string' }],
          config: { channel: 'input' },
        },
        {
          id: 'signal-out',
          type: 'SignalOut',
          inputs: [{ name: 'data', type: 'string' }],
          outputs: [{ name: 'data', type: 'string' }],
          config: { channel: 'output' },
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

function gameIntroFlow(): object {
  return {
    meta: {
      schemaVersion: '1.0',
      inputs: [],
      outputs: [{ name: 'narration', type: 'string' }],
    },
    data: {
      nodes: [
        {
          id: 'prompt',
          type: 'PromptBuild',
          config: {
            defaultRole: 'system',
            fragments: [
              { id: 'intro', type: 'base', content: 'Welcome to the game! Introduce the player.' },
            ],
          },
        },
        {
          id: 'message',
          type: 'Message',
          config: {},
        },
        {
          id: 'llm',
          type: 'GenerateText',
          config: {},
        },
        {
          id: 'signal-out',
          type: 'SignalOut',
          inputs: [{ name: 'data', type: 'string' }],
          outputs: [{ name: 'data', type: 'string' }],
          config: { channel: 'narration' },
        },
      ],
      edges: [
        { source: 'prompt', sourceHandle: 'text', target: 'message', targetHandle: 'system' },
        { source: 'message', sourceHandle: 'messages', target: 'llm', targetHandle: 'messages' },
        { source: 'llm', sourceHandle: 'text', target: 'signal-out', targetHandle: 'data' },
      ],
    },
  };
}

function gameSession(): object {
  return {
    schemaVersion: '1.0',
    entryStep: 'intro',
    steps: [
      { id: 'intro', type: 'RunFlow', flowRef: 'intro', next: 'end' },
      { id: 'end', type: 'End', message: 'Game over!' },
    ],
  };
}

function gameInitialState(): object {
  return {
    playerName: { type: 'string', value: '' },
    score: { type: 'number', value: 0 },
    turn: { type: 'number', value: 1 },
  };
}

function toJson(obj: object): string {
  return JSON.stringify(obj, null, 2) + '\n';
}

export function getTemplateFiles(template: TemplateId, projectName: string): ScaffoldFile[] {
  const files: ScaffoldFile[] = [
    { path: 'kal_config.json', content: toJson(buildConfig(projectName)) },
  ];

  if (template === 'game') {
    files.push(
      { path: 'initial_state.json', content: toJson(gameInitialState()) },
      { path: 'flow/intro.json', content: toJson(gameIntroFlow()) },
      { path: 'session.json', content: toJson(gameSession()) },
    );
  } else {
    files.push(
      { path: 'initial_state.json', content: toJson({}) },
      { path: 'flow/example.json', content: toJson(minimalExampleFlow()) },
    );
  }

  return files;
}
