import { useMemo, useState } from "react";
import { GitBranch, GitCommit, GitCompareArrows, History, RotateCcw, Save, Trash2 } from "lucide-react";
import { useTranslation } from 'react-i18next';
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useFlowResource,
  useGitStatus,
  useResourceVersion,
  useStudioCommands,
  useStudioResources,
  useVersionControl,
} from "@/kernel/hooks";
import { compareSnapshot } from "@/kernel/semantic-diff";
import type { ResourceId } from "@/types/project";
import { formatDateTime, formatDate } from '@/i18n/format';

export function VersionControlView() {
  const { t } = useTranslation('vcs');
  const { project, session } = useStudioResources();
  const { flowId: activeFlowId } = useFlowResource();
  const { resourceVersions, transactions, checkpoints } = useVersionControl();
  const { createCheckpoint, restoreCheckpoint, deleteCheckpoint, refreshGitStatus } = useStudioCommands();
  const gitState = useGitStatus();
  const [checkpointLabel, setCheckpointLabel] = useState("");
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [compareCheckpointId, setCompareCheckpointId] = useState<string | null>(null);

  const activeResourceId = (activeFlowId ? `flow://${activeFlowId}` : "session://default") as ResourceId;
  const activeVersion = useResourceVersion(activeResourceId);
  const compareCheckpoint = checkpoints.find((checkpoint) => checkpoint.id === compareCheckpointId) ?? null;
  const compareSummary = compareCheckpoint && project
    ? compareSnapshot(compareCheckpoint.snapshot, project)
    : null;

  const restorableResources = useMemo(() => {
    if (!project) {
      return [];
    }

    return [
      {
        id: "project://current" as ResourceId,
        title: t('projectSnapshot'),
        subtitle: t('flowsSessionSummary', {
          flowCount: Object.keys(project.flows).length,
          sessionStatus: session ? t('hasSession') : t('noSession'),
        }),
      },
      ...Object.keys(project.flows).map((flowName) => ({
        id: `flow://${flowName}` as ResourceId,
        title: flowName,
        subtitle: t('flowResource'),
      })),
      {
        id: "session://default" as ResourceId,
        title: "default",
        subtitle: session ? t('sessionResource') : t('sessionNotConfigured'),
      },
    ];
  }, [project, session, t]);

  const handleCreateCheckpoint = () => {
    createCheckpoint(checkpointLabel.trim() || undefined);
    setCheckpointLabel("");
  };

  const handleRestore = async (checkpointId: string) => {
    setRestoringId(checkpointId);
    try {
      await restoreCheckpoint(checkpointId);
    } finally {
      setRestoringId(null);
    }
  };

  const handleDeleteCheckpoint = (checkpointId: string, checkpointLabel: string) => {
    if (!window.confirm(t('confirmDeleteCheckpoint', { label: checkpointLabel }))) {
      return;
    }
    setCompareCheckpointId((current) => (current === checkpointId ? null : current));
    deleteCheckpoint(checkpointId);
  };

  if (!project) {
    return null;
  }

  return (
    <div className="h-full w-full overflow-auto bg-background p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        {gitState.status?.available ? (
          <section className="grid gap-6 xl:grid-cols-2">
            <div className="space-y-4 rounded-2xl border bg-card p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GitBranch className="size-4" />
                  <div>
                    <h2 className="text-lg font-semibold">{t('git.title')}</h2>
                    <p className="text-sm text-muted-foreground">
                      {t('git.currentBranch')} <span className="font-mono text-foreground">{gitState.status.branch}</span>
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => void refreshGitStatus()}>
                  <RotateCcw className="size-4" />
                  {t('git.refresh')}
                </Button>
              </div>

              {gitState.status.clean ? (
                <EmptyState message={t('git.cleanMessage')} />
              ) : (
                <div className="space-y-3">
                  {gitState.status.staged.length > 0 ? (
                    <div className="rounded-xl border p-4">
                      <div className="mb-2 text-xs font-medium text-green-600">{t('git.staged')} ({gitState.status.staged.length})</div>
                      {gitState.status.staged.map((file) => (
                        <div key={file} className="font-mono text-xs text-muted-foreground">{file}</div>
                      ))}
                    </div>
                  ) : null}
                  {gitState.status.unstaged.length > 0 ? (
                    <div className="rounded-xl border p-4">
                      <div className="mb-2 text-xs font-medium text-yellow-600">{t('git.unstaged')} ({gitState.status.unstaged.length})</div>
                      {gitState.status.unstaged.map((file) => (
                        <div key={file} className="font-mono text-xs text-muted-foreground">{file}</div>
                      ))}
                    </div>
                  ) : null}
                  {gitState.status.untracked.length > 0 ? (
                    <div className="rounded-xl border p-4">
                      <div className="mb-2 text-xs font-medium text-red-600">{t('git.untracked')} ({gitState.status.untracked.length})</div>
                      {gitState.status.untracked.map((file) => (
                        <div key={file} className="font-mono text-xs text-muted-foreground">{file}</div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="space-y-4 rounded-2xl border bg-card p-5">
              <div className="flex items-center gap-2">
                <GitCommit className="size-4" />
                <div>
                  <h2 className="text-lg font-semibold">{t('git.commits')}</h2>
                  <p className="text-sm text-muted-foreground">{t('git.commitsSubtitle', { count: gitState.log?.commits.length ?? 0 })}</p>
                </div>
              </div>

              <div className="space-y-2">
                {(gitState.log?.commits ?? []).length === 0 ? (
                  <EmptyState message={t('git.noCommits')} />
                ) : (
                  (gitState.log?.commits ?? []).map((commit) => (
                    <div key={commit.hash} className="rounded-lg border px-4 py-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{commit.message}</div>
                          <div className="text-xs text-muted-foreground">{commit.author}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-xs text-muted-foreground">{commit.hash.slice(0, 7)}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatDate(new Date(commit.date).getTime())}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1.1fr_1.2fr_1.7fr]">
        <section className="space-y-4 rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-2">
            <History className="size-4" />
            <div>
              <h1 className="text-lg font-semibold">{t('resourceVersions')}</h1>
              <p className="text-sm text-muted-foreground">{t('resourceVersionsSubtitle')}</p>
            </div>
          </div>

          <div className="space-y-3">
            {restorableResources.map((resource) => {
              const version = resourceVersions[resource.id];
              const active = resource.id === activeResourceId;

              return (
                <div
                  key={resource.id}
                  className={`rounded-xl border px-4 py-3 ${active ? "border-primary bg-primary/5" : ""}`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-medium">{resource.title}</div>
                      <div className="text-xs text-muted-foreground">{resource.subtitle}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm">v{version?.version ?? 0}</div>
                      <div className="text-xs text-muted-foreground">
                        {version ? formatDateTime(version.updatedAt) : t('notWritten')}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
            {t('focusedResource')}
            <span className="ml-2 font-mono text-foreground">{activeResourceId}</span>
            <span className="ml-2">{t('versionLabel')} {activeVersion?.version ?? 0}</span>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-2">
            <Save className="size-4" />
            <div>
              <h2 className="text-lg font-semibold">{t('checkpoints')}</h2>
              <p className="text-sm text-muted-foreground">{t('checkpointsSubtitle')}</p>
            </div>
          </div>

          <div className="flex gap-2">
            <Input
              value={checkpointLabel}
              onChange={(event) => setCheckpointLabel(event.target.value)}
              placeholder={t('checkpointPlaceholder')}
            />
            <Button onClick={handleCreateCheckpoint}>{t('create')}</Button>
          </div>

          <div className="space-y-3">
            {checkpoints.length === 0 ? (
              <EmptyState message={t('noCheckpointsDetail')} />
            ) : (
              checkpoints.map((checkpoint) => (
                <div key={checkpoint.id} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-medium">{checkpoint.label}</div>
                      <div className="text-xs text-muted-foreground">{formatDateTime(checkpoint.createdAt)}</div>
                      {checkpoint.description ? (
                        <div className="mt-1 text-sm text-muted-foreground">{checkpoint.description}</div>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={restoringId === checkpoint.id}
                        onClick={() => void handleRestore(checkpoint.id)}
                      >
                        <RotateCcw className="size-4" />
                        {restoringId === checkpoint.id ? t('restoring') : t('restore')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={restoringId === checkpoint.id}
                        onClick={() => handleDeleteCheckpoint(checkpoint.id, checkpoint.label)}
                      >
                        <Trash2 className="size-4" />
                        {t('deleteCheckpoint')}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant={compareCheckpointId === checkpoint.id ? "secondary" : "outline"}
                      size="sm"
                      onClick={() =>
                        setCompareCheckpointId((current) => (current === checkpoint.id ? null : checkpoint.id))
                      }
                    >
                      <GitCompareArrows className="size-4" />
                      {compareCheckpointId === checkpoint.id ? t('cancelCompare') : t('compareCurrent')}
                    </Button>
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">
                    {t('coversFlows', { count: Object.keys(checkpoint.snapshot.flows).length })}
                    {checkpoint.snapshot.session ? t('includesSession') : t('sessionEmpty')}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border bg-card p-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">
              {compareSummary ? t('semanticCompare') : t('transactions')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {compareSummary
                ? t('semanticCompareSubtitle')
                : t('transactionsSubtitle')}
            </p>
          </div>

          {compareSummary ? (
            <div className="space-y-4">
              <div className="rounded-xl border bg-muted/20 p-4 text-sm">
                <div className="font-medium">{compareCheckpoint?.label}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  checkpoint: {formatDateTime(compareCheckpoint?.createdAt ?? Date.now())}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border p-4">
                  <div className="text-xs text-muted-foreground">{t('addedFlows')}</div>
                  <div className="mt-2 text-lg font-semibold">{compareSummary.addedFlows.length}</div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    {compareSummary.addedFlows.length > 0 ? compareSummary.addedFlows.join(", ") : t('none')}
                  </div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-xs text-muted-foreground">{t('removedFlows')}</div>
                  <div className="mt-2 text-lg font-semibold">{compareSummary.removedFlows.length}</div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    {compareSummary.removedFlows.length > 0 ? compareSummary.removedFlows.join(", ") : t('none')}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border p-4">
                <div className="mb-3 text-sm font-medium">{t('changedFlows')}</div>
                {compareSummary.changedFlows.length === 0 ? (
                  <div className="text-sm text-muted-foreground">{t('noFlowChanges')}</div>
                ) : (
                  <div className="space-y-2">
                    {compareSummary.changedFlows.map((flow) => (
                      <div key={flow.flowName} className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
                        <div className="font-medium">{flow.flowName}</div>
                        <div className="text-xs text-muted-foreground">
                          {t('flowNodeEdgeSummary', { beforeNodes: flow.beforeNodes, afterNodes: flow.afterNodes, beforeEdges: flow.beforeEdges, afterEdges: flow.afterEdges })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border p-4">
                <div className="text-sm font-medium">{t('sessionDiff')}</div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {compareSummary.sessionChanged
                    ? t('stepsSummary', { before: compareSummary.beforeSessionSteps, after: compareSummary.afterSessionSteps })
                    : t('sessionNoChanges')}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {transactions.length === 0 ? (
                <EmptyState message={t('noTransactions')} />
              ) : (
                transactions.map((transaction) => (
                  <div key={transaction.id} className="rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="font-medium">{transaction.operations[0]?.summary ?? transaction.id}</div>
                        <div className="font-mono text-xs text-muted-foreground">{transaction.resourceId}</div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <div>{transaction.origin.label}</div>
                        <div>{formatDateTime(transaction.timestamp)}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-3 text-xs">
                      <span className="rounded-full border px-2 py-0.5 font-mono">
                        v{transaction.baseVersion} → v{transaction.nextVersion}
                      </span>
                      <span className="font-mono text-muted-foreground">{transaction.id}</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {transaction.operations.map((operation, index) => (
                        <div key={`${transaction.id}-${index}`} className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
                          <div>{operation.summary}</div>
                          <div className="font-mono text-xs text-muted-foreground">{operation.type}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </section>
        </div>
      </div>
    </div>
  );
}
