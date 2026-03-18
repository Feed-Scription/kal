import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { useRunDebug, useWorkbench, useWorkbenchContext, useStudioCommands } from './hooks';
import type { StudioCommandContext, StudioCommandDescriptor } from './types';

export function useCommandRegistry() {
  const { activeViewId, views } = useWorkbench();
  const { selectedRunId, selectedStepId } = useRunDebug();
  const context = useWorkbenchContext();
  const { t } = useTranslation('commands');
  const { t: tr } = useTranslation('registry');

  const {
    advanceRun,
    createRun,
    reloadProject,
    createCheckpoint,
    refreshDiagnostics,
    replayRun,
    setActiveView,
    setCommandPaletteOpen,
    stepRun,
    toggleBreakpoint,
    undo,
    redo,
  } = useStudioCommands();
  const commands = useMemo<StudioCommandDescriptor[]>(() => {
    const viewCommands = views.map((view) => {
      const title = tr(view.title);
      const shortTitle = tr(view.shortTitle);
      const description = tr(view.description);

      return {
        id: `workbench.view.${view.id}`,
        title: t('openView', { title }),
        description,
        section: t('section.views'),
        keywords: [view.id, view.shortTitle, view.title, shortTitle, title, description],
        when: (ctx: StudioCommandContext) => Boolean(ctx.values['project.loaded']) && ctx.values['workbench.view'] !== view.id,
        run: () => {
          setActiveView(view.id);
        },
      };
    });

    const projectCommands: StudioCommandDescriptor[] = [
      {
        id: 'run.create',
        title: t('createDebugRun'),
        description: t('createDebugRunDesc'),
        section: 'Debug',
        keywords: ['run', 'debug', 'managed'],
        when: (ctx) => Boolean(ctx.values['project.loaded']),
        run: async () => {
          await createRun(true);
          setActiveView('kal.debugger');
        },
      },
      {
        id: 'run.step',
        title: t('stepCurrentRun'),
        description: t('stepCurrentRunDesc'),
        section: 'Debug',
        keywords: ['run', 'debug', 'step'],
        when: (ctx) =>
          Boolean(ctx.values['run.selected']) &&
          ctx.values['run.status'] !== 'ended' &&
          ctx.values['run.status'] !== 'error' &&
          !Boolean(ctx.values['run.waitingForInput']),
        run: async () => {
          if (!selectedRunId) {
            return;
          }
          await stepRun(selectedRunId);
          setActiveView('kal.debugger');
        },
      },
      {
        id: 'run.continue',
        title: t('continueCurrentRun'),
        description: t('continueCurrentRunDesc'),
        section: 'Debug',
        keywords: ['run', 'debug', 'continue'],
        when: (ctx) =>
          Boolean(ctx.values['run.selected']) &&
          ctx.values['run.status'] !== 'ended' &&
          ctx.values['run.status'] !== 'error' &&
          !Boolean(ctx.values['run.waitingForInput']),
        run: async () => {
          if (!selectedRunId) {
            return;
          }
          await advanceRun(selectedRunId);
          setActiveView('kal.debugger');
        },
      },
      {
        id: 'run.replay',
        title: t('replayCurrentRun'),
        description: t('replayCurrentRunDesc'),
        section: 'Debug',
        keywords: ['run', 'debug', 'replay'],
        when: (ctx) => Boolean(ctx.values['run.selected']),
        run: async () => {
          if (!selectedRunId) {
            return;
          }
          await replayRun(selectedRunId);
          setActiveView('kal.debugger');
        },
      },
      {
        id: 'run.breakpoint.toggle',
        title: t('toggleBreakpoint'),
        description: t('toggleBreakpointDesc'),
        section: 'Debug',
        keywords: ['run', 'debug', 'breakpoint'],
        when: (ctx) => Boolean(ctx.values['run.stepId']),
        run: () => {
          if (!selectedStepId) {
            return;
          }
          toggleBreakpoint(selectedStepId);
          setActiveView('kal.debugger');
        },
      },
      {
        id: 'project.reload',
        title: t('reloadProject'),
        description: t('reloadProjectDesc'),
        section: t('section.project'),
        keywords: ['reload', 'project', 'engine'],
        when: (ctx) => Boolean(ctx.values['project.loaded']),
        run: async () => {
          await reloadProject();
        },
      },
      {
        id: 'history.undo',
        title: t('undo'),
        description: t('undoDesc'),
        section: t('section.history'),
        keywords: ['undo', 'history'],
        shortcut: 'Ctrl+Z',
        when: (ctx) => Boolean(ctx.values['history.undoAvailable']),
        run: async () => {
          await undo();
        },
      },
      {
        id: 'history.redo',
        title: t('redo'),
        description: t('redoDesc'),
        section: t('section.history'),
        keywords: ['redo', 'history'],
        shortcut: 'Ctrl+Shift+Z',
        when: (ctx) => Boolean(ctx.values['history.redoAvailable']),
        run: async () => {
          await redo();
        },
      },
      {
        id: 'project.checkpoint',
        title: t('createCheckpoint'),
        description: t('createCheckpointDesc'),
        section: t('section.project'),
        keywords: ['checkpoint', 'history', 'restore'],
        when: (ctx) => Boolean(ctx.values['capability.project.write']),
        run: () => {
          createCheckpoint();
          setActiveView('kal.version-control');
        },
      },
      {
        id: 'workbench.language',
        title: t('switchLanguage'),
        description: t('switchLanguageDesc'),
        section: 'Workbench',
        keywords: ['language', 'locale', 'i18n', '语言'],
        run: () => {
          const builtIn = ['en', 'zh-CN'];
          const current = i18n.language;
          const idx = builtIn.indexOf(current);
          const next = builtIn[(idx + 1) % builtIn.length];
          i18n.changeLanguage(next);
        },
      },
      {
        id: 'workbench.command-palette.close',
        title: t('closeCommandPalette'),
        description: t('closeCommandPaletteDesc'),
        section: 'Workbench',
        keywords: ['palette', 'command', 'close'],
        run: () => {
          setCommandPaletteOpen(false);
        },
      },
    ];

    return [...viewCommands, ...projectCommands];
  }, [
    advanceRun,
    createCheckpoint,
    createRun,
    redo,
    refreshDiagnostics,
    reloadProject,
    replayRun,
    setActiveView,
    setCommandPaletteOpen,
    stepRun,
    toggleBreakpoint,
    undo,
    views,
    selectedRunId,
    selectedStepId,
    t,
    tr,
  ]);

  return {
    context,
    commands: commands.filter((command) => !command.when || command.when(context)),
    allCommands: commands,
    activeViewId,
  };
}
