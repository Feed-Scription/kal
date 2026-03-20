import { ConfigLoader, FlowLoader, validateSessionDefinitionDetailed, BUILTIN_NODES, ConfigManager } from '@kal-ai/core';
import type {
  FlowDefinition,
  InitialState,
  SessionDefinition,
  ConfigParseOptions,
  SessionFlowValidationMode,
} from '@kal-ai/core';
import { EngineHttpError } from './errors';
import type { EngineProject } from './types';
import { basename, join, resolve } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';

async function readJsonFile<T>(filePath: string, required: boolean): Promise<T | undefined> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (!required && code === 'ENOENT') {
      return undefined;
    }
    if (error instanceof SyntaxError) {
      throw new EngineHttpError(`Invalid JSON in ${filePath}`, 400, 'INVALID_JSON', { filePath });
    }
    throw error;
  }
}

/**
 * Bridge ConfigManager (.kal/config.env) → process.env
 *
 * kal_config.json uses ${OPENAI_API_KEY} style env var references.
 * ConfigManager stores encrypted API keys in .kal/config.env.
 * This function bridges the two so ConfigLoader can resolve them.
 */
function bridgeUserConfigToEnv(): void {
  try {
    const configManager = new ConfigManager();
    const userConfig = configManager.loadConfig();

    for (const provider of Object.keys(userConfig)) {
      const val = userConfig[provider];
      if (typeof val !== 'object' || !val) continue;
      const providerConfig = val as Record<string, unknown>;

      if (typeof providerConfig.apiKey === 'string') {
        const envKey = `${provider.toUpperCase()}_API_KEY`;
        if (!process.env[envKey]) {
          process.env[envKey] = providerConfig.apiKey;
        }
      }
      if (typeof providerConfig.baseUrl === 'string') {
        const envKey = `${provider.toUpperCase()}_BASE_URL`;
        if (!process.env[envKey]) {
          process.env[envKey] = providerConfig.baseUrl;
        }
      }
    }
  } catch {
    // ConfigManager may fail if .kal dir doesn't exist — that's fine
  }
}

export interface LoadProjectOptions {
  /** When true, unset env vars in config are replaced with placeholders (for lint mode) */
  lenient?: boolean;
  /** When false, skip bridging .kal/config.env → process.env (default: true) */
  bridgeUserConfig?: boolean;
  /** Controls how missing session step flowRef targets are handled while loading the project */
  sessionFlowValidationMode?: SessionFlowValidationMode;
}

export async function loadEngineProject(projectRoot: string, options?: LoadProjectOptions): Promise<EngineProject> {
  // Bridge .kal/config.env → process.env before parsing kal_config.json
  if (options?.bridgeUserConfig !== false) {
    bridgeUserConfigToEnv();
  }

  const resolvedRoot = resolve(projectRoot);
  const configPath = join(resolvedRoot, 'kal_config.json');
  const flowDir = join(resolvedRoot, 'flow');
  const initialStatePath = join(resolvedRoot, 'initial_state.json');
  const customNodeDir = join(resolvedRoot, 'node');

  let configRaw: string;
  try {
    configRaw = await readFile(configPath, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new EngineHttpError(`Missing project config: ${configPath}`, 400, 'PROJECT_CONFIG_NOT_FOUND', { configPath });
    }
    throw error;
  }

  const configOptions: ConfigParseOptions = { lenient: options?.lenient ?? false };
  const config = ConfigLoader.parse(configRaw, configOptions);
  const initialState = (await readJsonFile<InitialState>(initialStatePath, false)) ?? {};

  let entries;
  try {
    entries = await readdir(flowDir, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new EngineHttpError(`Missing flow directory: ${flowDir}`, 400, 'FLOW_DIR_NOT_FOUND', { flowDir });
    }
    throw error;
  }

  const flowTextsById: Record<string, string> = {};
  const flowFileMap: Record<string, string> = {};
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue;
    }
    const filePath = join(flowDir, entry.name);
    const flowId = basename(entry.name, '.json');
    flowTextsById[flowId] = await readFile(filePath, 'utf8');
    flowFileMap[flowId] = filePath;
  }

  const builtinManifest = new Map(BUILTIN_NODES.map((n) => [n.type, { inputs: n.inputs, outputs: n.outputs }]));
  const loader = new FlowLoader((nodeType) => builtinManifest.get(nodeType));
  const resolver = (flowId: string): string => {
    const raw = flowTextsById[flowId];
    if (!raw) {
      throw new EngineHttpError(`Unknown flow: ${flowId}`, 404, 'FLOW_NOT_FOUND', { flowId });
    }
    return raw;
  };

  const flowsById: Record<string, FlowDefinition> = {};
  for (const flowId of Object.keys(flowTextsById).sort()) {
    flowsById[flowId] = loader.load(flowId, resolver);
  }

  // Optional session.json
  const sessionPath = join(resolvedRoot, 'session.json');
  const sessionRaw = await readJsonFile<SessionDefinition>(sessionPath, false);
  let session: SessionDefinition | undefined;
  let sessionValidationWarnings: EngineProject['sessionValidationWarnings'] = [];
  if (sessionRaw) {
    const validationResult = validateSessionDefinitionDetailed(sessionRaw, Object.keys(flowsById), {
      flowValidationMode: options?.sessionFlowValidationMode ?? 'strict',
    });
    if (validationResult.errors.length > 0) {
      const details = validationResult.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
      throw new EngineHttpError(`Invalid session.json: ${details}`, 400, 'INVALID_SESSION', {
        validationErrors: validationResult.errors,
      });
    }
    session = sessionRaw;
    sessionValidationWarnings = validationResult.warnings;
  }

  return {
    projectRoot: resolvedRoot,
    config,
    initialState,
    flowsById,
    flowTextsById,
    flowFileMap,
    customNodeDir,
    session,
    sessionValidationWarnings,
  };
}
