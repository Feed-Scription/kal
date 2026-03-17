import { MessageSquareMore } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { useCommentsWorkspace, useStudioCommands } from '@/kernel/hooks';

function describeAnchor(anchor: { kind: 'proposal'; proposalId: string } | { kind: 'resource'; resourceId: string } | { kind: 'run'; runId: string }) {
  if (anchor.kind === 'proposal') {
    return `proposal:${anchor.proposalId}`;
  }
  if (anchor.kind === 'run') {
    return `run:${anchor.runId}`;
  }
  return anchor.resourceId;
}

export function CommentsPanel() {
  const { threads } = useCommentsWorkspace();
  const { setActiveView, setActiveCommentThread } = useStudioCommands();

  return (
    <section className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageSquareMore className="size-4" />
          <div>
            <h3 className="text-sm font-semibold">Comments</h3>
            <p className="text-xs text-muted-foreground">评论线程摘要，可用于 review coordination。</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setActiveView('kal.comments')}>
          打开详情
        </Button>
      </div>

      {threads.length === 0 ? (
        <EmptyState message="当前没有评论线程。" compact />
      ) : (
        <div className="space-y-2">
          {threads.slice(0, 5).map((thread) => (
            <button
              key={thread.id}
              type="button"
              onClick={() => {
                setActiveCommentThread(thread.id);
                setActiveView('kal.comments');
              }}
              className="w-full rounded-lg border px-3 py-2 text-left text-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium">{thread.title}</div>
                <div className="text-xs text-muted-foreground">{thread.status}</div>
              </div>
              <div className="text-xs text-muted-foreground">
                {describeAnchor(thread.anchor)} · {thread.comments.length} comments
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
