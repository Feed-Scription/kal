import { ConfigLoader, FlowLoader, validateSessionDefinition } from '@kal-ai/core';
import type { FlowDefinition, InitialState, SessionDefinition } from '@kal-ai/core';
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

export async function loadEngineProject(projectRoot: string): Promise<EngineProject> {
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

  const config = ConfigLoader.parse(configRaw);
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

  const loader = new FlowLoader();
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
  if (sessionRaw) {
    const validationErrors = validateSessionDefinition(sessionRaw, Object.keys(flowsById));
    if (validationErrors.length > 0) {
      const details = validationErrors.map((e) => `${e.path}: ${e.message}`).join('; ');
      throw new EngineHttpError(`Invalid session.json: ${details}`, 400, 'INVALID_SESSION', { validationErrors });
    }
    session = sessionRaw;
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
  };
}
