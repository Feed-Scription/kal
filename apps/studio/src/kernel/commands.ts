import { useMemo } from 'react';
import { useWorkbench, useWorkbenchContext, useStudioCommands } from './hooks';
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
  const context = useWorkbenchContext();
  const {
    disconnect,
    reloadProject,
    createCheckpoint,
    refreshDiagnostics,
    setActivePreset,
    setActiveView,
    setCommandPaletteOpen,
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
    createCheckpoint,
    disconnect,
    redo,
    refreshDiagnostics,
    reloadProject,
    setActivePreset,
    setActiveView,
    setCommandPaletteOpen,
    undo,
    views,
  ]);

  return {
    context,
    commands: commands.filter((command) => !command.when || command.when(context)),
    allCommands: commands,
    activeViewId,
    activePreset,
  };
}
