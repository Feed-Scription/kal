import { useState } from 'react';
import { ClipboardCheck, FlaskConical, RotateCcw, ShieldCheck, Sparkles, Eye, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from "@/components/EmptyState";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCapabilityGate, useReviewWorkspace, useStudioCommands, useVersionControl, useRunDebug } from '@/kernel/hooks';
import { formatDateTime } from '@/i18n/format';

export function ReviewView() {
  const { t } = useTranslation('review');
  const { activeProposal, proposals } = useReviewWorkspace();
  const capabilityGate = useCapabilityGate();
  const { checkpoints } = useVersionControl();
  const { selectedRun } = useRunDebug();
  const {
    createReviewProposal,
    createCommentThread,
    setActiveProposal,
    validateProposal,
    acceptProposal,
    rollbackProposal,
    setActivePreset,
    setActiveView,
    selectRun,
  } = useStudioCommands();
  const [title, setTitle] = useState('');
  const [intent, setIntent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = () => {
    const proposalId = createReviewProposal({
      title: title.trim() || undefined,
      intent: intent.trim() || undefined,
      baseCheckpointId: checkpoints[0]?.id ?? null,
    });
    if (proposalId) {
      setActiveProposal(proposalId);
      setActivePreset('review');
      setTitle('');
      setIntent('');
      setError('');
    }
  };

  const runAction = async (action: () => Promise<void>) => {
    setSubmitting(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError((err as Error).message || t('actionError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full w-full overflow-auto bg-background p-6">
      <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[0.9fr_1.5fr]">
        <section className="space-y-4 rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="size-4" />
            <div>
              <h1 className="text-lg font-semibold">{t('workspaceTitle')}</h1>
              <p className="text-sm text-muted-foreground">{t('workspaceSubtitle')}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t('proposalTitlePlaceholder')} />
            <Input value={intent} onChange={(event) => setIntent(event.target.value)} placeholder={t('intentPlaceholder')} />
            <Button onClick={handleCreate}>{t('createProposalBundle')}</Button>
          </div>

          <div className="space-y-2">
            {proposals.length === 0 ? (
              <EmptyState message={t('noProposalsYet')} />
            ) : (
              proposals.map((proposal) => (
                <button
                  key={proposal.id}
                  type="button"
                  onClick={() => setActiveProposal(proposal.id)}
                  className={`w-full rounded-xl border px-4 py-3 text-left ${
                    activeProposal?.id === proposal.id ? 'border-primary bg-primary/5' : ''
                  }`}
                >
                  <div className="font-medium">{proposal.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {proposal.status} · {formatDateTime(proposal.createdAt)}
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border bg-card p-5">
          {!activeProposal ? (
            <EmptyState message={t('selectOrCreateProposal')} />
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">{activeProposal.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{activeProposal.intent}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div>{activeProposal.status}</div>
                  <div>{formatDateTime(activeProposal.createdAt)}</div>
                </div>
              </div>

              {error ? (
                <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
                  {error}
                </div>
              ) : null}

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="space-y-4 rounded-xl border p-4">
                  <div className="text-sm font-medium">{t('semanticSummary')}</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border p-3 text-sm">
                      <div className="text-xs text-muted-foreground">{t('touchedResources')}</div>
                      <div className="mt-1 font-semibold">{activeProposal.semanticSummary.addedFlows.length}</div>
                    </div>
                    <div className="rounded-lg border p-3 text-sm">
                      <div className="text-xs text-muted-foreground">{t('riskNotes')}</div>
                      <div className="mt-1 font-semibold">{activeProposal.semanticSummary.changedFlows.length}</div>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    {activeProposal.semanticSummary.changedFlows.map((flow) => (
                      <div key={flow.flowName} className="rounded-lg border px-3 py-2">
                        <div className="font-medium">{flow.flowName}</div>
                        <div className="text-xs text-muted-foreground">
                          nodes {flow.beforeNodes} {'->'} {flow.afterNodes} · edges {flow.beforeEdges} {'->'} {flow.afterEdges}
                        </div>
                        {flow.addedNodes && flow.addedNodes.length > 0 ? (
                          <div className="mt-1 text-xs text-green-600">+ nodes: {flow.addedNodes.join(', ')}</div>
                        ) : null}
                        {flow.removedNodes && flow.removedNodes.length > 0 ? (
                          <div className="mt-1 text-xs text-red-600">- nodes: {flow.removedNodes.join(', ')}</div>
                        ) : null}
                        {flow.changedNodes && flow.changedNodes.length > 0 ? (
                          <div className="mt-1 space-y-0.5">
                            {flow.changedNodes.map((cn) => (
                              <div key={cn.nodeId} className="text-xs text-amber-600">
                                ~ {cn.nodeId}: {cn.changes.join(', ')}
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {(flow.addedEdges ?? 0) > 0 || (flow.removedEdges ?? 0) > 0 ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            edges: +{flow.addedEdges ?? 0} / -{flow.removedEdges ?? 0}
                          </div>
                        ) : null}
                      </div>
                    ))}
                    {activeProposal.semanticSummary.sessionChanged ? (
                      <div className="rounded-lg border px-3 py-2 text-sm">
                        Session steps {activeProposal.semanticSummary.beforeSessionSteps} {'->'} {activeProposal.semanticSummary.afterSessionSteps}
                        {activeProposal.semanticSummary.sessionDiff ? (
                          <div className="mt-1 space-y-0.5 text-xs">
                            {activeProposal.semanticSummary.sessionDiff.addedSteps.length > 0 ? (
                              <div className="text-green-600">+ steps: {activeProposal.semanticSummary.sessionDiff.addedSteps.join(', ')}</div>
                            ) : null}
                            {activeProposal.semanticSummary.sessionDiff.removedSteps.length > 0 ? (
                              <div className="text-red-600">- steps: {activeProposal.semanticSummary.sessionDiff.removedSteps.join(', ')}</div>
                            ) : null}
                            {activeProposal.semanticSummary.sessionDiff.changedSteps.map((cs) => (
                              <div key={cs.stepId} className="text-amber-600">
                                ~ {cs.stepId}: {cs.changes.join(', ')}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-4 rounded-xl border p-4">
                  <div className="text-sm font-medium">{t('reviewContext')}</div>
                  <div className="rounded-lg border p-3 text-sm">
                    <div className="text-xs text-muted-foreground">{t('touchedResources')}</div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {activeProposal.touchedResources.map((resourceId) => (
                        <span key={resourceId} className="rounded-full border px-2 py-0.5 font-mono text-xs">
                          {resourceId}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3 text-sm">
                    <div className="text-xs text-muted-foreground">{t('validations')}</div>
                    <div className="mt-1">
                      {activeProposal.expectedDiagnostics.errors} errors / {activeProposal.expectedDiagnostics.warnings} warnings
                    </div>
                  </div>
                  <div className="rounded-lg border p-3 text-sm">
                    <div className="text-xs text-muted-foreground">{t('relatedRun')}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span>{activeProposal.relatedRunId ?? selectedRun?.run_id ?? 'none'}</span>
                      {(activeProposal.relatedRunId ?? selectedRun?.run_id) ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => {
                            const runId = activeProposal.relatedRunId ?? selectedRun?.run_id;
                            if (runId) {
                              void selectRun(runId);
                              setActiveView('kal.debugger');
                              setActivePreset('debug');
                            }
                          }}
                        >
                          <Eye className="mr-1 size-3" />
                          {t('viewTrace')}
                        </Button>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      state keys: {activeProposal.relatedStateKeys.join(', ') || 'none'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-3 rounded-xl border p-4">
                  <div className="text-sm font-medium">{t('validationPlan')}</div>
                  <div className="space-y-2 text-sm">
                    {activeProposal.recommendedValidations.map((item) => (
                      <div key={item} className="rounded-lg border px-3 py-2">
                        {item}
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={submitting} onClick={() => void runAction(() => validateProposal(activeProposal.id))}>
                      <FlaskConical className="size-4" />
                      {t('runLintSmoke')}
                    </Button>
                    <Button variant="outline" onClick={() => setActiveView('kal.debugger')}>
                      <Sparkles className="size-4" />
                      {t('openDebugger')}
                    </Button>
                    <Button
                      disabled={!capabilityGate.grants['comment.write']}
                      variant="outline"
                      onClick={() => {
                        const threadId = createCommentThread({
                          title: `Review: ${activeProposal.title}`,
                          body: t('commentThreadBody', { title: activeProposal.title }),
                          anchor: { kind: 'proposal', proposalId: activeProposal.id },
                        });
                        if (threadId) {
                          setActiveView('kal.comments');
                        }
                      }}
                    >
                      {t('startCommentThread')}
                    </Button>
                    <Button variant="outline" onClick={() => setActiveView('kal.version-control')}>
                      {t('viewHistory')}
                    </Button>
                  </div>
                  <div className="rounded-lg border p-3 text-sm">
                    <div className="text-xs text-muted-foreground">{t('validationState')}</div>
                    <div className="mt-1">
                      lint: {activeProposal.validation.lintStatus} · smoke: {activeProposal.validation.smokeStatus}
                    </div>
                    {activeProposal.validation.diagnostics ? (
                      <div className="mt-1 text-xs">
                        {activeProposal.validation.diagnostics.summary.errors} errors / {activeProposal.validation.diagnostics.summary.warnings} warnings
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-2 h-5 px-2 text-xs"
                          onClick={() => setActiveView('kal.problems')}
                        >
                          <AlertCircle className="mr-1 size-3" />
                          {t('viewProblems')}
                        </Button>
                      </div>
                    ) : null}
                    {activeProposal.validation.smoke ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        smoke: {activeProposal.validation.smoke.completedSteps} / {activeProposal.validation.smoke.totalSteps} steps · {activeProposal.validation.smoke.finalStatus}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border p-4">
                  <div className="text-sm font-medium">{t('acceptRollbackTitle')}</div>
                  <div className="space-y-2 text-sm">
                    {activeProposal.riskNotes.map((note) => (
                      <div key={note} className="rounded-lg border px-3 py-2">
                        {note}
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button disabled={submitting} onClick={() => void runAction(() => acceptProposal(activeProposal.id))}>
                      <ShieldCheck className="size-4" />
                      {t('acceptProposal')}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={submitting || !activeProposal.baseCheckpointId}
                      onClick={() => void runAction(() => rollbackProposal(activeProposal.id))}
                    >
                      <RotateCcw className="size-4" />
                      {t('rollbackToBase')}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
