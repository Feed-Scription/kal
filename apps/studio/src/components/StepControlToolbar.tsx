/**
 * StepControlToolbar — floating toolbar for step/continue/stop during paused runs.
 *
 * Appears when a run is paused at a breakpoint. All commands go through
 * useStudioCommands (single control layer per architecture constraint #4).
 */
import { Play, SkipForward, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useRunDebug, useStudioCommands } from '@/kernel/hooks';

export function StepControlToolbar() {
  const { t } = useTranslation('debug');
  const { selectedRun, selectedRunId, runCommandLoading } = useRunDebug();
  const { advanceRun, stepRun, cancelRun } = useStudioCommands();

  // Only show when a run is paused (at breakpoint or between steps)
  const isPaused = selectedRun?.status === 'paused';
  if (!isPaused || !selectedRunId) return null;

  return (
    <div className="flex items-center gap-1.5 rounded-lg border bg-card px-2 py-1.5 shadow-sm">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-xs"
        disabled={runCommandLoading}
        onClick={() => void advanceRun(selectedRunId)}
      >
        <Play className="size-3" />
        {t('continue')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-xs"
        disabled={runCommandLoading}
        onClick={() => void stepRun(selectedRunId)}
      >
        <SkipForward className="size-3" />
        {t('step')}
      </Button>
      <div className="mx-0.5 h-4 w-px bg-border" />
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
        disabled={runCommandLoading}
        onClick={() => void cancelRun(selectedRunId)}
      >
        <Square className="size-3" />
        {t('cancel')}
      </Button>
    </div>
  );
}
