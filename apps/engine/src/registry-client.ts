/**
 * Registry Client — 团队私有 registry 的 HTTP 客户端
 *
 * 支持从团队 registry 搜索、获取详情和下载包。
 * Registry URL 通过项目配置或环境变量指定。
 */

import type { PackageManifest } from './package-loader';

export type RegistryPackageSummary = {
  id: string;
  name: string;
  version: string;
  kind: PackageManifest['kind'];
  description?: string;
  author?: string;
  downloads?: number;
  updatedAt?: string;
};

export type RegistryPackageDetail = {
  manifest: PackageManifest;
  readme?: string;
  versions: string[];
  publishedAt?: string;
  signature?: { signer: string; status: string };
};

export type RegistrySearchResult = {
  packages: RegistryPackageSummary[];
  total: number;
  page: number;
  pageSize: number;
};

export type RegistryConfig = {
  url: string;
  token?: string;
};

export class RegistryClient {
  private config: RegistryConfig;

  constructor(config: RegistryConfig) {
    this.config = config;
  }

  private buildUrl(path: string): string {
    const base = this.config.url.replace(/\/+$/, '');
    return `${base}${path}`;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    if (this.config.token) {
      headers['Authorization'] = `Bearer ${this.config.token}`;
    }
    return headers;
  }

  async search(query?: string, page = 1, pageSize = 20): Promise<RegistrySearchResult> {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));

    const res = await fetch(this.buildUrl(`/packages?${params}`), {
      headers: this.buildHeaders(),
    });

    if (!res.ok) {
      throw new Error(`Registry search failed: ${res.status} ${res.statusText}`);
    }

    return res.json() as Promise<RegistrySearchResult>;
  }

  async getPackage(id: string): Promise<RegistryPackageDetail> {
    const res = await fetch(this.buildUrl(`/packages/${encodeURIComponent(id)}`), {
      headers: this.buildHeaders(),
    });

    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(`Package not found: ${id}`);
      }
      throw new Error(`Registry request failed: ${res.status} ${res.statusText}`);
    }

    return res.json() as Promise<RegistryPackageDetail>;
  }

  async downloadPackage(id: string, version: string): Promise<ArrayBuffer> {
    const res = await fetch(
      this.buildUrl(`/packages/${encodeURIComponent(id)}/${encodeURIComponent(version)}`),
      { headers: this.buildHeaders() },
    );

    if (!res.ok) {
      throw new Error(`Package download failed: ${res.status} ${res.statusText}`);
    }

    return res.arrayBuffer();
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(this.buildUrl('/health'), {
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
