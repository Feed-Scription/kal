import type { FlowDefinition, SessionDefinition, StateValue } from '@kal-ai/core';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EngineHttpError } from './errors';
import { loadProjectPackages } from './package-loader';

export type TemplateBundle = {
  packageId: string;
  templateId: string;
  templatePath: string;
  flows: Record<string, FlowDefinition>;
  session: SessionDefinition | null;
  state: Record<string, StateValue>;
  summary: {
    flowIds: string[];
    hasSession: boolean;
    stateKeys: string[];
  };
};

function normalizeFlowId(filename: string): string {
  return filename.replace(/\.json$/i, '');
}

export async function loadTemplateBundle(projectRoot: string, packageId: string, templateId: string): Promise<TemplateBundle> {
  const packages = await loadProjectPackages(projectRoot);
  const pkg = packages.find((entry) => entry.manifest.id === packageId);
  if (!pkg) {
    throw new EngineHttpError(`Package not found: ${packageId}`, 404, 'PACKAGE_NOT_FOUND', { packageId });
  }

  const template = pkg.manifest.contributes?.templates &&
    Array.isArray(pkg.manifest.contributes.templates)
      ? (pkg.manifest.contributes.templates as Array<{ id?: string }>).find((entry) => entry.id === templateId)
      : null;
  if (!template) {
    throw new EngineHttpError(
      `Template not found: ${templateId}`,
      404,
      'TEMPLATE_NOT_FOUND',
      { packageId, templateId },
    );
  }

  const templatePath = join(pkg.installPath, 'templates', templateId);
  const flowDirCandidates = [join(templatePath, 'flows'), join(templatePath, 'flow')];
  let flowDir: string | null = null;
  for (const candidate of flowDirCandidates) {
    try {
      const entries = await readdir(candidate, { withFileTypes: true });
      if (entries.some((entry) => entry.isFile() && entry.name.endsWith('.json'))) {
        flowDir = candidate;
        break;
      }
    } catch {
      // Ignore missing directory candidate.
    }
  }

  const flows: Record<string, FlowDefinition> = {};
  if (flowDir) {
    const entries = await readdir(flowDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) {
        continue;
      }
      const flowId = normalizeFlowId(entry.name);
      flows[flowId] = JSON.parse(await readFile(join(flowDir, entry.name), 'utf8')) as FlowDefinition;
    }
  }

  let session: SessionDefinition | null = null;
  try {
    session = JSON.parse(await readFile(join(templatePath, 'session.json'), 'utf8')) as SessionDefinition;
  } catch {
    session = null;
  }

  let state: Record<string, StateValue> = {};
  try {
    state = JSON.parse(await readFile(join(templatePath, 'initial_state.json'), 'utf8')) as Record<string, StateValue>;
  } catch {
    state = {};
  }

  return {
    packageId,
    templateId,
    templatePath,
    flows,
    session,
    state,
    summary: {
      flowIds: Object.keys(flows).sort(),
      hasSession: Boolean(session),
      stateKeys: Object.keys(state).sort(),
    },
  };
}
