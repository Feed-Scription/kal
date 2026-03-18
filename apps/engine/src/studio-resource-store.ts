import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type StudioResourceKind = 'review' | 'comments';

function resourcePath(projectRoot: string, kind: StudioResourceKind): string {
  return join(projectRoot, '.kal', 'studio', `${kind}.json`);
}

export async function loadStudioResource<T>(projectRoot: string, kind: StudioResourceKind, fallback: T): Promise<T> {
  try {
    const raw = await readFile(resourcePath(projectRoot, kind), 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function saveStudioResource<T>(projectRoot: string, kind: StudioResourceKind, value: T): Promise<T> {
  const dir = join(projectRoot, '.kal', 'studio');
  await mkdir(dir, { recursive: true });
  await writeFile(resourcePath(projectRoot, kind), JSON.stringify(value, null, 2), 'utf8');
  return value;
}
