/**
 * NodeExecutionInspector — displays execution data (inputs/outputs/error/duration)
 * for the currently selected node.
 *
 * Shown inside WorkbenchInspector when a flow node is selected and execution
 * data exists in flowExecutionTrace.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, CheckCircle2, AlertCircle, Loader2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FlowExecutionNodeResult } from '@/types/project';

type NodeExecutionInspectorProps = {
  data: FlowExecutionNodeResult;
};

const STATUS_ICON = {
  success: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
  error: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
  running: { icon: Loader2, color: 'text-blue-600', bg: 'bg-blue-50' },
  skipped: { icon: Clock, color: 'text-muted-foreground', bg: 'bg-muted' },
} as const;

function JsonTree({ data, label }: { data: unknown; label: string }) {
  const [open, setOpen] = useState(false);

  if (data === undefined || data === null) return null;

  const json = JSON.stringify(data, null, 2);
  const isLarge = json.length > 120;

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        {label}
      </button>
      {open && (
        <pre className="max-h-[200px] overflow-auto rounded-md border bg-muted/40 p-2 text-[11px] leading-relaxed">
          {isLarge ? json : json}
        </pre>
      )}
    </div>
  );
}

export function NodeExecutionInspector({ data }: NodeExecutionInspectorProps) {
  const { t } = useTranslation('workbench');
  const cfg = STATUS_ICON[data.status];
  const Icon = cfg.icon;

  return (
    <section className="space-y-2">
      {/* Status badge */}
      <div className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm', cfg.bg)}>
        <Icon className={cn('size-4', cfg.color, data.status === 'running' && 'animate-spin')} />
        <span className={cn('font-medium', cfg.color)}>
          {t(`execution.status.${data.status}`)}
        </span>
        {data.durationMs != null && (
          <span className="ml-auto text-xs text-muted-foreground">
            {data.durationMs}ms
          </span>
        )}
      </div>

      {/* Error message */}
      {data.error && (
        <div className="rounded-md border border-red-200 bg-red-50/60 px-3 py-2 text-xs text-red-700">
          {data.error}
        </div>
      )}

      {/* Inputs / Outputs */}
      <JsonTree data={data.inputs} label={t('execution.inputs')} />
      <JsonTree data={data.outputs} label={t('execution.outputs')} />
    </section>
  );
}
