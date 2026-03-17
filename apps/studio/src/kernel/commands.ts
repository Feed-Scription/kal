import { useMemo } from 'react';
import { useReviewWorkspace, useRunDebug, useWorkbench, useWorkbenchContext, useStudioCommands } from './hooks';
import type { StudioCommandContext, StudioCommandDescriptor, StudioWorkspacePreset } from './types';

const PRESET_LABELS: Record<StudioWorkspacePreset, string> = {
  authoring: '创作工作区',
  debug: '调试工作区',
  review: '审查工作区',
  history: '历史工作区',
  package: '分发工作区',
};

export function useCommandRegistry() {
  const { activeViewId, activePreset, views } = useWorkbench();
  const { activeProposal } = useReviewWorkspace();
  const { selectedRunId, selectedStepId } = useRunDebug();
  const context = useWorkbenchContext();
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
      title: `打开 ${view.title}`,
      description: view.description,
      section: '视图',
      keywords: [view.id, view.shortTitle, view.title],
      when: (ctx: StudioCommandContext) => Boolean(ctx.values['project.loaded']) && ctx.values['workbench.view'] !== view.id,
      run: () => {
        setActiveView(view.id);
      },
    }));

    const presetCommands = (Object.entries(PRESET_LABELS) as Array<[StudioWorkspacePreset, string]>).map(
      ([preset, label]) => ({
        id: `workbench.preset.${preset}`,
        title: `切换到 ${label}`,
        description: `切换 Studio 工作区到 ${label}`,
        section: '工作区',
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
        title: '创建调试 Run',
        description: '创建一个新的 managed run 并切换到调试工作区。',
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
        title: '单步推进当前 Run',
        description: '以 step 模式推进当前选中的 managed run。',
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
        title: '继续当前 Run',
        description: '以 continue 模式推进当前选中的 managed run。',
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
        title: '重放当前 Run',
        description: '基于当前 run 的输入历史从头重放。',
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
        title: '切换当前 Step 断点',
        description: '为当前选中 run 的 step 添加或移除断点。',
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
        title: '打开 Comments',
        description: '查看当前 review/comment 线程。',
        section: 'Review',
        keywords: ['comments', 'review', 'thread'],
        when: (ctx) => Boolean(ctx.values['project.loaded']),
        run: () => {
          setActiveView('kal.comments');
        },
      },
      {
        id: 'review.proposal.create',
        title: '创建 Proposal Bundle',
        description: '围绕当前版本、诊断和 selected run 生成 review bundle。',
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
        title: '为当前 Proposal 创建评论线程',
        description: '围绕当前 active proposal 打开异步评论线程。',
        section: 'Review',
        keywords: ['comment', 'proposal', 'review'],
        when: (ctx) => Boolean(ctx.values['review.active']) && Boolean(ctx.values['capability.comment.write']),
        run: () => {
          if (!activeProposal) {
            return;
          }
          createCommentThread({
            title: `Review: ${activeProposal.title}`,
            body: `针对 proposal ${activeProposal.title} 发起 review 讨论。`,
            anchor: { kind: 'proposal', proposalId: activeProposal.id },
          });
          setActiveView('kal.comments');
        },
      },
      {
        id: 'review.proposal.validate',
        title: '验证当前 Proposal',
        description: '对当前 proposal 执行 lint + smoke 验证。',
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
        title: '刷新 Diagnostics',
        description: '重新运行 diagnostics 查询，并写入统一事务日志。',
        section: '项目',
        keywords: ['diagnostics', 'problems', 'lint'],
        run: async () => {
          await refreshDiagnostics();
          setActiveView('kal.problems');
        },
      },
      {
        id: 'project.reload',
        title: '重载项目',
        description: '从 Engine 重新拉取 canonical project snapshot。',
        section: '项目',
        keywords: ['reload', 'project', 'engine'],
        when: (ctx) => Boolean(ctx.values['project.loaded']),
        run: async () => {
          await reloadProject();
        },
      },
      {
        id: 'history.undo',
        title: '撤销',
        description: '恢复到上一个事务快照。',
        section: '历史',
        keywords: ['undo', 'history'],
        shortcut: 'Ctrl+Z',
        when: (ctx) => Boolean(ctx.values['history.undoAvailable']),
        run: async () => {
          await undo();
        },
      },
      {
        id: 'history.redo',
        title: '重做',
        description: '重新应用最近一次被撤销的事务快照。',
        section: '历史',
        keywords: ['redo', 'history'],
        shortcut: 'Ctrl+Shift+Z',
        when: (ctx) => Boolean(ctx.values['history.redoAvailable']),
        run: async () => {
          await redo();
        },
      },
      {
        id: 'project.checkpoint',
        title: '创建 Checkpoint',
        description: '为当前 flows/session 创建本地可恢复检查点。',
        section: '项目',
        keywords: ['checkpoint', 'history', 'restore'],
        when: (ctx) => Boolean(ctx.values['capability.project.write']),
        run: () => {
          createCheckpoint();
          setActiveView('kal.version-control');
        },
      },
      {
        id: 'project.disconnect',
        title: '断开 Engine',
        description: '断开当前 Studio 与 Engine 的连接。',
        section: '项目',
        keywords: ['disconnect', 'engine'],
        when: (ctx) => Boolean(ctx.values['engine.connected']),
        run: () => {
          disconnect();
        },
      },
      {
        id: 'workbench.command-palette.close',
        title: '关闭命令面板',
        description: '关闭当前命令面板。',
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
  ]);

  return {
    context,
    commands: commands.filter((command) => !command.when || command.when(context)),
    allCommands: commands,
    activeViewId,
    activePreset,
  };
}
