/** 判断事件目标是否为可编辑元素（INPUT / TEXTAREA / contentEditable） */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  );
}

/**
 * 将 "Ctrl+Shift+Z" 格式的快捷键字符串与 KeyboardEvent 匹配。
 * - "Ctrl" 匹配 metaKey(Mac) 或 ctrlKey(其他)
 * - "Shift" 匹配 shiftKey
 * - "Alt" 匹配 altKey
 * - 最后一段为 key 名，与 event.key.toLowerCase() 比较
 * - 不含 Shift 时要求 shiftKey === false，避免 Ctrl+Z 误匹配 Ctrl+Shift+Z
 */
export function matchShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.split('+');
  const key = parts.pop()!.toLowerCase();

  const requireCtrl = parts.some((p) => p === 'Ctrl');
  const requireShift = parts.some((p) => p === 'Shift');
  const requireAlt = parts.some((p) => p === 'Alt');

  const mod = event.metaKey || event.ctrlKey;

  if (requireCtrl && !mod) return false;
  if (!requireCtrl && mod) return false;
  if (requireShift !== event.shiftKey) return false;
  if (requireAlt !== event.altKey) return false;

  return event.key.toLowerCase() === key;
}
