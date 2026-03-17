import { ClipboardList } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { useReviewWorkspace, useStudioCommands } from '@/kernel/hooks';
import { formatTimeFromTimestamp } from '@/i18n/format';

export function ReviewHistoryPanel() {
  const { t } = useTranslation('review');
  const { proposals } = useReviewWorkspace();
  const { setActiveView } = useStudioCommands();

  return (
    <section className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="size-4" />
          <div>
            <h3 className="text-sm font-semibold">Review History</h3>
            <p className="text-xs text-muted-foreground">{t('history.subtitle')}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setActiveView('kal.review')}>
          {t('history.openReview')}
        </Button>
      </div>

      {proposals.length === 0 ? (
        <EmptyState message={t('history.noHistory')} compact />
      ) : (
        <div className="space-y-2">
          {proposals.slice(0, 5).map((proposal) => (
            <div key={proposal.id} className="rounded-lg border px-3 py-2 text-sm">
              <div className="font-medium">{proposal.title}</div>
              <div className="text-xs text-muted-foreground">
                {proposal.status} · {formatTimeFromTimestamp(proposal.createdAt)}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
