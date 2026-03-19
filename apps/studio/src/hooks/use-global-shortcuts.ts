import { useEffect } from 'react';
import { useCommandRegistry } from '@/kernel/commands';
import { isEditableTarget, matchShortcut } from '@/lib/keyboard';

/**
 * 全局快捷键监听 hook
 *
 * 从命令注册表中读取所有带 shortcut 的命令，统一注册 window 级 keydown 监听器。
 * - 匹配到快捷键后检查命令的 when 条件
 * - 如果命令没有 global: true 且焦点在可编辑元素上，跳过
 */
export function useGlobalShortcuts() {
  const { allCommands, context } = useCommandRegistry();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      for (const command of allCommands) {
        if (!command.shortcut) continue;

        // 匹配快捷键
        if (!matchShortcut(event, command.shortcut)) continue;

        // 检查 when 条件
        if (command.when && !command.when(context)) continue;

        // 如果命令没有 global: true 且焦点在可编辑元素上，跳过
        if (!command.global && isEditableTarget(event.target)) continue;

        // 匹配成功，执行命令
        event.preventDefault();
        void Promise.resolve(command.run());
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [allCommands, context]);
}
