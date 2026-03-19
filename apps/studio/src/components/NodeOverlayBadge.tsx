import { Loader2, CheckCircle2, AlertCircle, Pin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { NodeOverlayState, PauseContext } from '@/hooks/use-node-overlay';

function PauseContextTooltip({ ctx }: { ctx: PauseContext }) {
  const { t } = useTranslation('debug');
  const changedEntries = Object.entries(ctx.changedValues);
  const events = ctx.recentEvents.slice(-3);

  if (changedEntries.length === 0 && events.length === 0) return null;

  return (
    <div className="max-w-64 space-y-2 text-left">
      {changedEntries.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider opacity-70">
            {t('changedKeys')}
          </div>
          {changedEntries.slice(0, 4).map(([key, val]) => (
            <div key={key} className="flex items-baseline justify-between gap-2 text-[11px]">
              <span className="font-mono">{key}</span>
              <span className="truncate opacity-70">
                {JSON.stringify(val.new).slice(0, 30)}
              </span>
            </div>
          ))}
        </div>
      )}
      {events.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider opacity-70">
            {t('recentEvents')}
          </div>
          {events.map((ev, i) => (
            <div key={i} className="text-[11px] opacity-80">
              {ev.type}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 节点 overlay badge — 断点红点（左上角）+ 诊断/执行 badge（右上角）+ pin（左下角）
 * 被 ManifestNode 和所有 session-node 共用。
 *
 * When a run is paused at this node (overlay.pauseContext), hovering the
 * breakpoint dot shows recent events and changed state values.
 */
export function NodeOverlayBadge({ overlay }: { overlay?: NodeOverlayState | null }) {
  if (!overlay) return null;

  const showPauseTooltip = overlay.hasBreakpoint && overlay.pauseContext;

  return (
    <>
      {/* Breakpoint dot — with optional pause context tooltip */}
      {overlay.hasBreakpoint && (
        showPauseTooltip ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="absolute -top-1.5 -left-1.5 z-10 size-3.5 cursor-help rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
              </TooltipTrigger>
              <TooltipContent side="top" className="bg-gray-900 text-gray-100 dark:bg-gray-100 dark:text-gray-900">
                <PauseContextTooltip ctx={overlay.pauseContext!} />
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <div className="absolute -top-1.5 -left-1.5 z-10 size-3.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
        )
      )}
      {/* Phase 5: pin indicator */}
      {overlay.isPinned && (
        <div className="absolute -bottom-1.5 -left-1.5 z-10 flex size-4 items-center justify-center rounded-full bg-violet-500 text-white ring-2 ring-white dark:ring-gray-900">
          <Pin className="size-2.5" />
        </div>
      )}
      {/* Execution status icon (Phase 1) */}
      {overlay.executionStatus === 'running' && (
        <div className="absolute -top-2 -right-2 z-10 flex size-5 items-center justify-center rounded-full bg-blue-500 text-white">
          <Loader2 className="size-3 animate-spin" />
        </div>
      )}
      {overlay.executionStatus === 'success' && (
        <div className="absolute -top-2 -right-2 z-10 flex size-5 items-center justify-center rounded-full bg-green-500 text-white">
          <CheckCircle2 className="size-3" />
        </div>
      )}
      {overlay.executionStatus === 'error' && (
        <div className="absolute -top-2 -right-2 z-10 flex size-5 items-center justify-center rounded-full bg-red-500 text-white">
          <AlertCircle className="size-3" />
        </div>
      )}
      {/* Diagnostic badge (only when no execution status) */}
      {!overlay.executionStatus && overlay.diagnosticSeverity && overlay.diagnosticCount > 0 && (
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
