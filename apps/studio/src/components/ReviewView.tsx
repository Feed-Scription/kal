import { useState } from 'react';
import { ClipboardCheck, FlaskConical, RotateCcw, ShieldCheck, Sparkles, Eye, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCapabilityGate, useReviewWorkspace, useStudioCommands, useVersionControl, useRunDebug } from '@/kernel/hooks';

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

export function ReviewView() {
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
      setError((err as Error).message || '执行 review 操作失败');
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
              <h1 className="text-lg font-semibold">Review Workspace</h1>
              <p className="text-sm text-muted-foreground">把当前编辑状态打包成可审查 proposal，并围绕 lint/smoke/debug 做验证。</p>
            </div>
          </div>

          <div className="space-y-2">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Proposal 标题" />
            <Input value={intent} onChange={(event) => setIntent(event.target.value)} placeholder="目标与意图说明" />
            <Button onClick={handleCreate}>创建 Proposal Bundle</Button>
          </div>

          <div className="space-y-2">
            {proposals.length === 0 ? (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                当前还没有 proposal。先创建一个 review bundle。
              </div>
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
                    {proposal.status} · {formatTime(proposal.createdAt)}
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border bg-card p-5">
          {!activeProposal ? (
            <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
              选择或创建一个 proposal 以开始 review。
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">{activeProposal.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{activeProposal.intent}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div>{activeProposal.status}</div>
                  <div>{formatTime(activeProposal.createdAt)}</div>
                </div>
              </div>

              {error ? (
                <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
                  {error}
                </div>
              ) : null}

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="space-y-4 rounded-xl border p-4">
                  <div className="text-sm font-medium">Semantic Summary</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border p-3 text-sm">
                      <div className="text-xs text-muted-foreground">Added Flows</div>
                      <div className="mt-1 font-semibold">{activeProposal.semanticSummary.addedFlows.length}</div>
                    </div>
                    <div className="rounded-lg border p-3 text-sm">
                      <div className="text-xs text-muted-foreground">Changed Flows</div>
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
                      </div>
                    ))}
                    {activeProposal.semanticSummary.sessionChanged ? (
                      <div className="rounded-lg border px-3 py-2 text-sm">
                        Session steps {activeProposal.semanticSummary.beforeSessionSteps} {'->'} {activeProposal.semanticSummary.afterSessionSteps}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-4 rounded-xl border p-4">
                  <div className="text-sm font-medium">Review Context</div>
                  <div className="rounded-lg border p-3 text-sm">
                    <div className="text-xs text-muted-foreground">Touched Resources</div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {activeProposal.touchedResources.map((resourceId) => (
                        <span key={resourceId} className="rounded-full border px-2 py-0.5 font-mono text-xs">
                          {resourceId}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3 text-sm">
                    <div className="text-xs text-muted-foreground">Expected Diagnostics</div>
                    <div className="mt-1">
                      {activeProposal.expectedDiagnostics.errors} errors / {activeProposal.expectedDiagnostics.warnings} warnings
                    </div>
                  </div>
                  <div className="rounded-lg border p-3 text-sm">
                    <div className="text-xs text-muted-foreground">Related Run</div>
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
                          查看 Trace
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
                  <div className="text-sm font-medium">Validation Plan</div>
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
                      运行 Lint + Smoke
                    </Button>
                    <Button variant="outline" onClick={() => setActiveView('kal.debugger')}>
                      <Sparkles className="size-4" />
                      打开 Debugger
                    </Button>
                    <Button
                      disabled={!capabilityGate.grants['comment.write']}
                      variant="outline"
                      onClick={() => {
                        const threadId = createCommentThread({
                          title: `Review: ${activeProposal.title}`,
                          body: `针对 proposal ${activeProposal.title} 发起 review 讨论。`,
                          anchor: { kind: 'proposal', proposalId: activeProposal.id },
                        });
                        if (threadId) {
                          setActiveView('kal.comments');
                        }
                      }}
                    >
                      发起评论线程
                    </Button>
                    <Button variant="outline" onClick={() => setActiveView('kal.version-control')}>
                      查看历史
                    </Button>
                  </div>
                  <div className="rounded-lg border p-3 text-sm">
                    <div className="text-xs text-muted-foreground">Validation State</div>
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
                          查看 Problems
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
                  <div className="text-sm font-medium">Accept / Rollback</div>
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
                      接受 Proposal
                    </Button>
                    <Button
                      variant="outline"
                      disabled={submitting || !activeProposal.baseCheckpointId}
                      onClick={() => void runAction(() => rollbackProposal(activeProposal.id))}
                    >
                      <RotateCcw className="size-4" />
                      回滚到 Base Checkpoint
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
