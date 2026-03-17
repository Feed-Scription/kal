import { History } from "lucide-react";
import { useTranslation } from 'react-i18next';
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { useStudioCommands, useVersionControl } from "@/kernel/hooks";
import { formatDateTime } from '@/i18n/format';

export function VersionControlPanel() {
  const { t } = useTranslation('vcs');
  const { checkpoints, transactions } = useVersionControl();
  const { createCheckpoint, setActiveView } = useStudioCommands();
  const recent = transactions.slice(0, 4);

  return (
    <section className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="size-4" />
          <div>
            <h3 className="text-sm font-semibold">{t('panel.historyPanel')}</h3>
            <p className="text-xs text-muted-foreground">{t('panel.historyPanelSubtitle')}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => createCheckpoint()}>
            {t('createCheckpoint')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setActiveView("kal.version-control")}>
            {t('panel.openDetails')}
          </Button>
        </div>
      </div>

      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>{transactions.length} {t('transactions').toLowerCase()}</span>
        <span>{checkpoints.length} {t('checkpoints').toLowerCase()}</span>
      </div>

      <div className="space-y-2">
        {recent.length === 0 ? (
          <EmptyState message={t('panel.noTransactions')} compact />
        ) : (
          recent.map((transaction) => (
            <div key={transaction.id} className="rounded-lg border px-3 py-2 text-sm">
              <div className="font-medium">{transaction.operations[0]?.summary ?? transaction.id}</div>
              <div className="text-xs text-muted-foreground">
                {transaction.resourceId} · {formatDateTime(transaction.timestamp)}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
