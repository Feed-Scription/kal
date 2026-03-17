import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStudioCommands, useVersionControl } from "@/kernel/hooks";

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString("zh-CN", { hour12: false });
}

export function VersionControlPanel() {
  const { checkpoints, transactions } = useVersionControl();
  const { createCheckpoint, setActiveView } = useStudioCommands();
  const recent = transactions.slice(0, 4);

  return (
    <section className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="size-4" />
          <div>
            <h3 className="text-sm font-semibold">History Panel</h3>
            <p className="text-xs text-muted-foreground">基于 transaction/version 的底部历史 panel。</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => createCheckpoint()}>
            Checkpoint
          </Button>
          <Button variant="outline" size="sm" onClick={() => setActiveView("kal.version-control")}>
            打开详情
          </Button>
        </div>
      </div>

      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>{transactions.length} transactions</span>
        <span>{checkpoints.length} checkpoints</span>
      </div>

      <div className="space-y-2">
        {recent.length === 0 ? (
          <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            当前还没有事务记录。
          </div>
        ) : (
          recent.map((transaction) => (
            <div key={transaction.id} className="rounded-lg border px-3 py-2 text-sm">
              <div className="font-medium">{transaction.operations[0]?.summary ?? transaction.id}</div>
              <div className="text-xs text-muted-foreground">
                {transaction.resourceId} · {formatTime(transaction.timestamp)}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
