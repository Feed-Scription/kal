import type { NodeOverlayState } from '@/hooks/use-node-overlay';

/**
 * 节点 overlay badge — 断点红点（左上角）+ 诊断 badge（右上角）
 * 被 ManifestNode 和所有 session-node 共用。
 */
export function NodeOverlayBadge({ overlay }: { overlay?: NodeOverlayState | null }) {
  if (!overlay) return null;

  return (
    <>
      {overlay.hasBreakpoint && (
        <div className="absolute -top-1.5 -left-1.5 z-10 size-3.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
      )}
      {overlay.diagnosticSeverity && overlay.diagnosticCount > 0 && (
        <div
          className={`absolute -top-2 -right-2 z-10 flex min-w-5 items-center justify-center rounded-full px-1 py-0.5 text-[10px] font-bold leading-none text-white ${
            overlay.diagnosticSeverity === 'error' ? 'bg-red-500' : 'bg-amber-500'
          }`}
        >
          {overlay.diagnosticCount}
        </div>
      )}
    </>
  );
}
