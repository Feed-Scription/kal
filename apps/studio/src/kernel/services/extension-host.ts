/**
 * Extension Host Service
 *
 * 管理第三方扩展的生命周期：激活、停用、崩溃恢复和健康检查。
 * 当扩展崩溃超过阈值时自动禁用，防止影响 Studio 稳定性。
 *
 * @internal Kernel 内部服务，组件通过 hooks 消费。
 */

import type {
  ExtensionHealthRecord,
  StudioExtensionId,
} from '@/kernel/types';

const MAX_CRASH_COUNT = 3;
const CRASH_WINDOW_MS = 5 * 60 * 1000; // 5 分钟内崩溃次数超限则禁用

const healthRecords = new Map<StudioExtensionId, ExtensionHealthRecord>();

function getOrCreateHealth(extensionId: StudioExtensionId): ExtensionHealthRecord {
  let record = healthRecords.get(extensionId);
  if (!record) {
    record = {
      extensionId,
      crashCount: 0,
      recoveryAttempts: 0,
      healthy: true,
      disabledBySystem: false,
    };
    healthRecords.set(extensionId, record);
  }
  return record;
}

export function reportExtensionCrash(extensionId: StudioExtensionId, error: string): ExtensionHealthRecord {
  const record = getOrCreateHealth(extensionId);
  const now = Date.now();

  // 如果上次崩溃超过窗口期，重置计数
  if (record.lastCrashAt && now - record.lastCrashAt > CRASH_WINDOW_MS) {
    record.crashCount = 0;
  }

  record.crashCount += 1;
  record.lastCrashAt = now;
  record.lastCrashError = error;

  if (record.crashCount >= MAX_CRASH_COUNT) {
    record.healthy = false;
    record.disabledBySystem = true;
    record.disableReason = `扩展在 ${CRASH_WINDOW_MS / 1000}s 内崩溃 ${record.crashCount} 次，已被自动禁用`;
  }

  healthRecords.set(extensionId, record);
  return { ...record };
}

export function attemptExtensionRecovery(extensionId: StudioExtensionId): ExtensionHealthRecord {
  const record = getOrCreateHealth(extensionId);

  record.recoveryAttempts += 1;
  record.healthy = true;
  record.disabledBySystem = false;
  record.disableReason = undefined;
  record.crashCount = 0;

  healthRecords.set(extensionId, record);
  return { ...record };
}

export function getExtensionHealth(extensionId: StudioExtensionId): ExtensionHealthRecord {
  return { ...getOrCreateHealth(extensionId) };
}

export function getAllExtensionHealth(): ExtensionHealthRecord[] {
  return [...healthRecords.values()].map((r) => ({ ...r }));
}

export function isExtensionHealthy(extensionId: StudioExtensionId): boolean {
  const record = healthRecords.get(extensionId);
  return record ? record.healthy && !record.disabledBySystem : true;
}

export function resetExtensionHealth(extensionId: StudioExtensionId): void {
  healthRecords.delete(extensionId);
}
