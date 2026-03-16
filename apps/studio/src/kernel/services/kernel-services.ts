/**
 * Kernel Services — 非 React 消费路径
 *
 * 为不在 React 组件树中的代码（如 run-service、middleware）提供
 * 对 Kernel 内部状态的受控访问。所有对 studioStore 的非 React 引用
 * 应集中在此文件中。
 *
 * @internal 仅限 kernel/ 内部使用
 */

import { useStudioStore } from '@/store/studioStore';
import type { StudioKernelEventName, StudioExtensionId } from '@/kernel/types';

type KernelEventInput = {
  type: StudioKernelEventName;
  message: string;
  resourceId?: string;
  extensionId?: StudioExtensionId;
  runId?: string;
  jobId?: string;
  data?: Record<string, unknown>;
};

/**
 * 获取 Kernel 事件记录器（非 React 上下文使用）。
 */
export function getKernelEventRecorder(): (event: KernelEventInput) => void {
  return useStudioStore.getState().recordKernelEvent;
}
