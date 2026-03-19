/**
 * Unified run status configuration.
 *
 * Single source of truth for run status → visual mapping.
 * Replaces SessionRunDialog's `statusClass()` and DebuggerSummaryView's `STATUS_CONFIG`.
 */
import { Circle, Pause, Play, AlertTriangle, type LucideIcon } from 'lucide-react';
import type { RunSummary } from '@/types/project';

export type RunStatusKey = RunSummary['status']; // 'paused' | 'waiting_input' | 'ended' | 'error'

export const RUN_STATUS_CONFIG: Record<RunStatusKey, {
  icon: LucideIcon;
  color: string;
  bg: string;
  borderClass: string;
}> = {
  paused: { icon: Pause, color: 'text-amber-600', bg: 'bg-amber-50', borderClass: 'border-amber-200 bg-amber-50 text-amber-700' },
  waiting_input: { icon: Play, color: 'text-emerald-600', bg: 'bg-emerald-50', borderClass: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  ended: { icon: Circle, color: 'text-sky-600', bg: 'bg-sky-50', borderClass: 'border-sky-200 bg-sky-50 text-sky-700' },
  error: { icon: AlertTriangle, color: 'text-destructive', bg: 'bg-red-50', borderClass: 'border-red-200 bg-red-50 text-red-700' },
};

const FALLBACK_CONFIG = { icon: Circle, color: 'text-muted-foreground', bg: 'bg-muted', borderClass: 'border-border bg-muted text-muted-foreground' };

export function getRunStatusConfig(status: RunStatusKey | null | undefined) {
  if (!status) return FALLBACK_CONFIG;
  return RUN_STATUS_CONFIG[status] ?? FALLBACK_CONFIG;
}

/**
 * Returns the border/bg/text class string for a run status badge.
 * Drop-in replacement for SessionRunDialog's `statusClass()`.
 */
export function runStatusClass(status: RunStatusKey | null | undefined): string {
  return getRunStatusConfig(status).borderClass;
}
