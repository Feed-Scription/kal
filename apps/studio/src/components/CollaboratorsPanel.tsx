import { Users } from 'lucide-react';
import { usePresence } from '@/kernel/hooks';

function formatRelativeTime(timestamp: number) {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  return `${Math.floor(diff / 3_600_000)}小时前`;
}

export function CollaboratorsPanel() {
  const { users, activities, selfId } = usePresence();

  return (
    <div className="flex h-full flex-col overflow-auto p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Users className="size-4" />
        <span>协作者 ({users.length})</span>
      </div>

      {users.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
          当前没有其他协作者在线。协作功能将在多人连接同一项目时启用。
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((user) => {
            const activity = activities.find((a) => a.userId === user.id);
            const isSelf = user.id === selfId;

            return (
              <div
                key={user.id}
                className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm"
              >
                <div
                  className="flex size-7 items-center justify-center rounded-full text-xs font-medium text-white"
                  style={{ backgroundColor: user.color }}
                >
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{user.name}</span>
                    {isSelf ? (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                        你
                      </span>
                    ) : null}
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                      {user.role}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {activity?.viewId ? (
                      <span>正在查看 {activity.viewId.replace('kal.', '')}</span>
                    ) : (
                      <span>活跃于 {formatRelativeTime(user.lastActiveAt)}</span>
                    )}
                    {activity?.resourceId ? (
                      <span className="ml-1 font-mono text-[10px]">· {activity.resourceId}</span>
                    ) : null}
                  </div>
                </div>
                <div
                  className="size-2 rounded-full"
                  style={{
                    backgroundColor:
                      Date.now() - user.lastActiveAt < 60_000 ? '#22c55e' : '#eab308',
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
