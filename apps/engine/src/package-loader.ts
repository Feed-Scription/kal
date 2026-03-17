import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export type PackageKind =
  | 'node-pack'
  | 'studio-extension'
  | 'template-pack'
  | 'starter-pack'
  | 'theme-pack';

export type PackageManifest = {
  id: string;
  kind: PackageKind;
  version: string;
  name: string;
  description?: string;
  author?: string;
  license?: string;
  repository?: string;
  capabilities?: string[];
  host?: 'browser' | 'workspace' | 'service';
  activationEvents?: string[];
  contributes?: Record<string, unknown>;
  dependencies?: Record<string, string>;
  main?: string;
  runtime?: string;
  studio?: string;
};

export type LoadedPackage = {
  manifest: PackageManifest;
  installPath: string;
  installedAt: number;
};

/**
 * 从项目 packages/ 目录加载本地包
 */
export async function loadProjectPackages(projectRoot: string): Promise<LoadedPackage[]> {
  const packagesDir = join(projectRoot, 'packages');
  const packages: LoadedPackage[] = [];

  try {
    const entries = await readdir(packagesDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const packagePath = join(packagesDir, entry.name);
      const manifestPath = join(packagePath, 'manifest.json');

      try {
        const manifestContent = await readFile(manifestPath, 'utf-8');
        const manifest = JSON.parse(manifestContent) as PackageManifest;

        // 基础验证
        if (!manifest.id || !manifest.kind || !manifest.version || !manifest.name) {
          console.warn(`[package-loader] Invalid manifest in ${entry.name}, skipping`);
          continue;
        }

        packages.push({
          manifest,
          installPath: packagePath,
          installedAt: Date.now(),
        });
      } catch (error) {
        console.warn(`[package-loader] Failed to load package ${entry.name}:`, error);
        continue;
      }
    }
  } catch (error) {
    // packages/ 目录不存在或无法读取，返回空数组
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[package-loader] Failed to read packages directory:', error);
    }
  }

  return packages;
}

/**
 * 验证包 manifest 格式
 */
export function validatePackageManifest(manifest: unknown): manifest is PackageManifest {
  if (typeof manifest !== 'object' || manifest === null) {
    return false;
  }

  const m = manifest as Record<string, unknown>;

  return (
    typeof m.id === 'string' &&
    typeof m.kind === 'string' &&
    typeof m.version === 'string' &&
    typeof m.name === 'string'
  );
}
