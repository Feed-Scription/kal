import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * 统一空状态组件
 *
 * 用于替换项目中所有 `border-dashed` 空状态 div，提供一致的视觉语言。
 * 支持两种尺寸：compact（面板内）和 default（主视图内）。
 */
export function EmptyState({
  icon: Icon,
  message,
  description,
  action,
  compact = false,
  className,
  ...props
}: {
  icon?: React.ComponentType<{ className?: string }>;
  message: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
} & Omit<ComponentProps<'div'>, 'children'>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-dashed text-sm text-muted-foreground',
        compact ? 'p-3' : 'p-5',
        className,
      )}
      {...props}
    >
      <div className={cn('flex flex-col items-center gap-2', compact ? '' : 'text-center')}>
        {Icon && <Icon className={cn('opacity-40', compact ? 'size-5' : 'size-8')} />}
        <div>{message}</div>
        {description && <div className="text-xs opacity-70">{description}</div>}
        {action && <div className="mt-1">{action}</div>}
      </div>
    </div>
  );
}
