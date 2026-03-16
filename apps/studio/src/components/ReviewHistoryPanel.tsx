import { ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useReviewWorkspace, useStudioCommands } from '@/kernel/hooks';

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false });
}

export function ReviewHistoryPanel() {
  const { proposals } = useReviewWorkspace();
  const { setActiveView } = useStudioCommands();

  return (
    <section className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="size-4" />
          <div>
            <h3 className="text-sm font-semibold">Review History</h3>
            <p className="text-xs text-muted-foreground">底部 panel 中的 proposal 历史摘要。</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setActiveView('kal.review')}>
          打开 Review
        </Button>
      </div>

      {proposals.length === 0 ? (
        <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          当前还没有 proposal history。
        </div>
      ) : (
        <div className="space-y-2">
          {proposals.slice(0, 5).map((proposal) => (
            <div key={proposal.id} className="rounded-lg border px-3 py-2 text-sm">
              <div className="font-medium">{proposal.title}</div>
              <div className="text-xs text-muted-foreground">
                {proposal.status} · {formatTime(proposal.createdAt)}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
