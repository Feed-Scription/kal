import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { EngineRuntimeOptions } from '../runtime';
import { EngineHttpError, formatEngineError, statusForError } from '../errors';
import { getCliContext, setExitCode } from '../cli-context';
import type { CliEnvelope, CliErrorDetail, EngineCliIO } from '../types';

export const projectPathArg = {
  type: 'positional' as const,
  description: 'Path to the KAL project root',
  required: false,
};

export const formatArg = {
  type: 'string' as const,
  description: 'Output format',
  default: 'json',
};

export function resolveProjectPath(projectPath: string | undefined, cwd: string): string {
  return resolve(cwd, projectPath ?? '.');
}

function hintForErrorCode(code: string): string | undefined {
  switch (code) {
    case 'NO_SESSION':
      return "Use 'kal session set' to create session.json first";
    case 'FLOW_NOT_FOUND':
      return "Use 'kal flow list' to inspect available flows";
    case 'FLOW_ALREADY_EXISTS':
      return "Use 'kal flow update' to replace an existing flow";
    case 'STEP_NOT_FOUND':
      return "Use 'kal session step list' to inspect available steps";
    case 'NODE_NOT_FOUND':
      return "Use 'kal flow node list' to inspect available nodes";
    case 'FRAGMENT_NOT_FOUND':
      return "Use 'kal flow node fragment list' to inspect available fragments";
    case 'INVALID_JSON':
      return "Provide valid JSON or use '--file <path>'";
    default:
      return undefined;
  }
}

function classifyError(error: unknown): CliErrorDetail {
  const formatted = formatEngineError(error);
  const status = statusForError(error);
  const errorClass: CliErrorDetail['error_class'] =
    status === 404 ? 'not_found'
    : status >= 500 ? 'internal'
    : formatted.code.includes('CONFIG') ? 'config'
    : formatted.code.includes('IO') ? 'io'
    : 'validation';

  return {
    error_class: errorClass,
    error_code: formatted.code,
    message: formatted.message,
    retryable: status >= 500,
    hint: hintForErrorCode(formatted.code),
  };
}

export function createEnvelope<T>(
  command: string,
  data: T | null,
  options: {
    status?: 'ok' | 'error';
    errors?: CliErrorDetail[];
    warnings?: string[];
  } = {},
): CliEnvelope<T> {
  return {
    schema_version: '1.0.0',
    command,
    status: options.status ?? 'ok',
    data,
    errors: options.errors ?? [],
    warnings: options.warnings ?? [],
  };
}

export function createErrorEnvelope(command: string, error: unknown): CliEnvelope<null> {
  return createEnvelope(command, null, {
    status: 'error',
    errors: [classifyError(error)],
  });
}

export function writeJson(io: EngineCliIO, data: unknown): void {
  io.stdout(`${JSON.stringify(data, null, 2)}\n`);
}

export async function ensureRuntime(
  projectPath: string | undefined,
  options?: EngineRuntimeOptions,
): Promise<{
  projectRoot: string;
  runtime: Awaited<ReturnType<ReturnType<typeof getCliContext>['createRuntime']>>;
}> {
  const dependencies = getCliContext();
  const projectRoot = resolveProjectPath(projectPath, dependencies.cwd);
  const runtime = await dependencies.createRuntime(projectRoot, options);
  return { projectRoot, runtime };
}

export async function readJsonInput(params: {
  file?: string;
  json?: string;
  stdin?: boolean;
  cwd?: string;
}): Promise<unknown> {
  const cwd = params.cwd ?? getCliContext().cwd;
  const shouldReadStdin = params.stdin === true || (!process.stdin.isTTY && !params.file && !params.json);
  if ((params.file ? 1 : 0) + (params.json ? 1 : 0) + (shouldReadStdin ? 1 : 0) !== 1) {
    throw new EngineHttpError('Exactly one of --file or --json is required', 400, 'CLI_INPUT_SOURCE_REQUIRED');
  }
  if (params.file) {
    const raw = await readFile(resolve(cwd, params.file), 'utf8');
    return JSON.parse(raw);
  }
  if (shouldReadStdin) {
    return JSON.parse(await readStdin());
  }
  return JSON.parse(params.json!);
}

export async function readStdin(): Promise<string> {
  return await new Promise<string>((resolvePromise, reject) => {
    let buffer = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      buffer += chunk;
    });
    process.stdin.on('end', () => resolvePromise(buffer));
    process.stdin.on('error', reject);
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item)) as T;
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneValue(item)])
    ) as T;
  }
  return value;
}

function parseSetValue(rawValue: string): unknown {
  if (rawValue === 'true') {
    return true;
  }
  if (rawValue === 'false') {
    return false;
  }
  if (rawValue === 'null') {
    return null;
  }
  if (/^-?\d+(\.\d+)?$/.test(rawValue)) {
    return Number(rawValue);
  }
  if (rawValue.startsWith('{') || rawValue.startsWith('[')) {
    return JSON.parse(rawValue);
  }
  return rawValue;
}

function createContainer(nextSegment: string | undefined): Record<string, unknown> | unknown[] {
  return nextSegment && /^\d+$/.test(nextSegment) ? [] : {};
}

export function parseSetArgs(sets: string[]): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  for (const entry of sets) {
    const separatorIndex = entry.indexOf('=');
    if (separatorIndex <= 0) {
      throw new EngineHttpError(`Invalid --set entry: ${entry}`, 400, 'CLI_SET_INVALID', { entry });
    }

    const path = entry.slice(0, separatorIndex);
    const rawValue = entry.slice(separatorIndex + 1);
    const segments = path.split('.').filter(Boolean);
    if (segments.length === 0) {
      throw new EngineHttpError(`Invalid --set path: ${path}`, 400, 'CLI_SET_INVALID', { entry });
    }

    let cursor: Record<string, unknown> | unknown[] = patch;
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]!;
      const isLast = index === segments.length - 1;
      const nextSegment = segments[index + 1];

      if (Array.isArray(cursor)) {
        const numericIndex = Number(segment);
        if (!Number.isInteger(numericIndex) || numericIndex < 0) {
          throw new EngineHttpError(`Expected numeric array index in --set path: ${path}`, 400, 'CLI_SET_INVALID', { entry });
        }
        if (isLast) {
          cursor[numericIndex] = parseSetValue(rawValue);
        } else {
          cursor[numericIndex] ??= createContainer(nextSegment);
          cursor = cursor[numericIndex] as Record<string, unknown> | unknown[];
        }
        continue;
      }

      if (isLast) {
        cursor[segment] = parseSetValue(rawValue);
      } else {
        cursor[segment] ??= createContainer(nextSegment);
        cursor = cursor[segment] as Record<string, unknown> | unknown[];
      }
    }
  }

  return patch;
}

export function deepMerge<T>(target: T, patch: unknown): T {
  if (Array.isArray(patch)) {
    const base = Array.isArray(target) ? target.map((item) => cloneValue(item)) : [];
    for (let index = 0; index < patch.length; index += 1) {
      if (patch[index] === undefined) {
        continue;
      }
      base[index] = deepMerge(base[index], patch[index]);
    }
    return base as T;
  }

  if (isPlainObject(patch)) {
    const base = isPlainObject(target) ? Object.fromEntries(
      Object.entries(target).map(([key, value]) => [key, cloneValue(value)])
    ) : {};

    for (const [key, value] of Object.entries(patch)) {
      const current = (base as Record<string, unknown>)[key];
      (base as Record<string, unknown>)[key] = deepMerge(current, value);
    }
    return base as T;
  }

  return cloneValue(patch) as T;
}

export function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return typeof value === 'string' ? [value] : [];
}

export async function runEnvelopeCommand<T>(
  command: string,
  handler: () => Promise<T | {
    data: T | null;
    warnings?: string[];
    exitCode?: number;
  }>,
): Promise<void> {
  const { io } = getCliContext();

  try {
    const result = await handler();
    const normalized = result && typeof result === 'object' && 'data' in result
      ? result as { data: T | null; warnings?: string[]; exitCode?: number }
      : { data: result as T, warnings: [], exitCode: 0 };
    writeJson(io, createEnvelope(command, normalized.data, { warnings: normalized.warnings }));
    setExitCode(normalized.exitCode ?? 0);
  } catch (error) {
    writeJson(io, createErrorEnvelope(command, error));
    setExitCode(1);
  }
}
