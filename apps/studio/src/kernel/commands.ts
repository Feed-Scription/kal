import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { useReviewWorkspace, useRunDebug, useWorkbench, useWorkbenchContext, useStudioCommands } from './hooks';
import type { StudioCommandContext, StudioCommandDescriptor, StudioWorkspacePreset } from './types';

export function useCommandRegistry() {
  const { activeViewId, activePreset, views } = useWorkbench();
  const { activeProposal } = useReviewWorkspace();
  const { selectedRunId, selectedStepId } = useRunDebug();
  const context = useWorkbenchContext();
  const { t } = useTranslation('commands');

  const PRESET_LABELS: Record<StudioWorkspacePreset, string> = {
    authoring: t('preset.authoring'),
    debug: t('preset.debug'),
    review: t('preset.review'),
    history: t('preset.history'),
    package: t('preset.package'),
  };
    const {
      advanceRun,
      createCommentThread,
      createReviewProposal,
      createRun,
    validateProposal,
    disconnect,
    reloadProject,
    createCheckpoint,
    refreshDiagnostics,
      replayRun,
      setActiveProposal,
      setActivePreset,
      setActiveView,
      setCommandPaletteOpen,
      stepRun,
      toggleBreakpoint,
      undo,
      redo,
    } = useStudioCommands();
  const commands = useMemo<StudioCommandDescriptor[]>(() => {
    const viewCommands = views.map((view) => ({
      id: `workbench.view.${view.id}`,
      title: t('openView', { title: view.title }),
      description: view.description,
      section: t('section.views'),
      keywords: [view.id, view.shortTitle, view.title],
      when: (ctx: StudioCommandContext) => Boolean(ctx.values['project.loaded']) && ctx.values['workbench.view'] !== view.id,
      run: () => {
        setActiveView(view.id);
      },
    }));

    const presetCommands = (Object.entries(PRESET_LABELS) as Array<[StudioWorkspacePreset, string]>).map(
      ([preset, label]) => ({
        id: `workbench.preset.${preset}`,
        title: t('switchTo', { label }),
        description: t('switchWorkspace', { label }),
        section: t('section.workspace'),
        keywords: [preset, label],
        when: (ctx: StudioCommandContext) => ctx.values['workbench.preset'] !== preset,
        run: () => {
          setActivePreset(preset);
        },
      }),
    );

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
          setActivePreset('debug');
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
          setActivePreset('debug');
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
          setActivePreset('debug');
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
          setActivePreset('debug');
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
          setActivePreset('debug');
          setActiveView('kal.debugger');
        },
      },
      {
        id: 'review.comments.open',
        title: t('openComments'),
        description: t('openCommentsDesc'),
        section: 'Review',
        keywords: ['comments', 'review', 'thread'],
        when: (ctx) => Boolean(ctx.values['project.loaded']),
        run: () => {
          setActiveView('kal.comments');
        },
      },
      {
        id: 'review.proposal.create',
        title: t('createProposal'),
        description: t('createProposalDesc'),
        section: 'Review',
        keywords: ['review', 'proposal', 'bundle'],
        when: (ctx) => Boolean(ctx.values['project.loaded']),
        run: () => {
          const proposalId = createReviewProposal();
          if (proposalId) {
            setActiveProposal(proposalId);
            setActivePreset('review');
            setActiveView('kal.review');
          }
        },
      },
      {
        id: 'review.comments.create',
        title: t('createCommentThread'),
        description: t('createCommentThreadDesc'),
        section: 'Review',
        keywords: ['comment', 'proposal', 'review'],
        when: (ctx) => Boolean(ctx.values['review.active']) && Boolean(ctx.values['capability.comment.write']),
        run: () => {
          if (!activeProposal) {
            return;
          }
          createCommentThread({
            title: `Review: ${activeProposal.title}`,
            body: t('commentThreadBody', { title: activeProposal.title }),
            anchor: { kind: 'proposal', proposalId: activeProposal.id },
          });
          setActiveView('kal.comments');
        },
      },
      {
        id: 'review.proposal.validate',
        title: t('validateProposal'),
        description: t('validateProposalDesc'),
        section: 'Review',
        keywords: ['review', 'validate', 'lint', 'smoke'],
        when: (ctx) => Boolean(ctx.values['review.active']),
        run: async () => {
          if (!activeProposal) {
            return;
          }
          await validateProposal(activeProposal.id);
          setActiveView('kal.review');
        },
      },
      {
        id: 'project.diagnostics.refresh',
        title: t('refreshDiagnostics'),
        description: t('refreshDiagnosticsDesc'),
        section: t('section.project'),
        keywords: ['diagnostics', 'problems', 'lint'],
        run: async () => {
          await refreshDiagnostics();
          setActiveView('kal.problems');
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
        id: 'project.disconnect',
        title: t('disconnectEngine'),
        description: t('disconnectEngineDesc'),
        section: t('section.project'),
        keywords: ['disconnect', 'engine'],
        when: (ctx) => Boolean(ctx.values['engine.connected']),
        run: () => {
          disconnect();
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

    return [...viewCommands, ...presetCommands, ...projectCommands];
  }, [
    advanceRun,
    createCommentThread,
    createCheckpoint,
    createReviewProposal,
    createRun,
    disconnect,
    redo,
    refreshDiagnostics,
    reloadProject,
    replayRun,
    setActiveProposal,
    setActivePreset,
    setActiveView,
    setCommandPaletteOpen,
    stepRun,
    toggleBreakpoint,
    undo,
    validateProposal,
    views,
    activeProposal,
    selectedRunId,
    selectedStepId,
    t,
  ]);

  return {
    context,
    commands: commands.filter((command) => !command.when || command.when(context)),
    allCommands: commands,
    activeViewId,
    activePreset,
  };
}
