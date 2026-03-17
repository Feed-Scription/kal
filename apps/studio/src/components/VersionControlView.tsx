import { useMemo, useState } from "react";
import { GitBranch, GitCommit, GitCompareArrows, History, RotateCcw, Save } from "lucide-react";
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

function formatDateTime(timestamp: number) {
  return new Date(timestamp).toLocaleString("zh-CN", { hour12: false });
}

export function VersionControlView() {
  const { project, session } = useStudioResources();
  const { flowId: activeFlowId } = useFlowResource();
  const { resourceVersions, transactions, checkpoints } = useVersionControl();
  const { createCheckpoint, restoreCheckpoint, refreshGitStatus } = useStudioCommands();
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
        title: "项目快照",
        subtitle: `${Object.keys(project.flows).length} flows / ${session ? "有 session" : "无 session"}`,
      },
      ...Object.keys(project.flows).map((flowName) => ({
        id: `flow://${flowName}` as ResourceId,
        title: flowName,
        subtitle: "Flow 资源",
      })),
      {
        id: "session://default" as ResourceId,
        title: "default",
        subtitle: session ? "Session 资源" : "Session 未配置",
      },
    ];
  }, [project, session]);

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
                    <h2 className="text-lg font-semibold">Git Status</h2>
                    <p className="text-sm text-muted-foreground">
                      当前分支: <span className="font-mono text-foreground">{gitState.status.branch}</span>
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => void refreshGitStatus()}>
                  <RotateCcw className="size-4" />
                  刷新
                </Button>
              </div>

              {gitState.status.clean ? (
                <EmptyState message="工作区干净，没有未提交的变更。" />
              ) : (
                <div className="space-y-3">
                  {gitState.status.staged.length > 0 ? (
                    <div className="rounded-xl border p-4">
                      <div className="mb-2 text-xs font-medium text-green-600">已暂存 ({gitState.status.staged.length})</div>
                      {gitState.status.staged.map((file) => (
                        <div key={file} className="font-mono text-xs text-muted-foreground">{file}</div>
                      ))}
                    </div>
                  ) : null}
                  {gitState.status.unstaged.length > 0 ? (
                    <div className="rounded-xl border p-4">
                      <div className="mb-2 text-xs font-medium text-yellow-600">未暂存 ({gitState.status.unstaged.length})</div>
                      {gitState.status.unstaged.map((file) => (
                        <div key={file} className="font-mono text-xs text-muted-foreground">{file}</div>
                      ))}
                    </div>
                  ) : null}
                  {gitState.status.untracked.length > 0 ? (
                    <div className="rounded-xl border p-4">
                      <div className="mb-2 text-xs font-medium text-red-600">未跟踪 ({gitState.status.untracked.length})</div>
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
                  <h2 className="text-lg font-semibold">最近提交</h2>
                  <p className="text-sm text-muted-foreground">最近 {gitState.log?.commits.length ?? 0} 条 Git 提交记录。</p>
                </div>
              </div>

              <div className="space-y-2">
                {(gitState.log?.commits ?? []).length === 0 ? (
                  <EmptyState message="没有提交记录。" />
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
                            {new Date(commit.date).toLocaleDateString("zh-CN")}
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
              <h1 className="text-lg font-semibold">资源版本</h1>
              <p className="text-sm text-muted-foreground">Kernel 持有的本地 resource/version 索引。</p>
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
                        {version ? formatDateTime(version.updatedAt) : "未写入"}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
            当前聚焦资源:
            <span className="ml-2 font-mono text-foreground">{activeResourceId}</span>
            <span className="ml-2">版本 {activeVersion?.version ?? 0}</span>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-2">
            <Save className="size-4" />
            <div>
              <h2 className="text-lg font-semibold">Checkpoints</h2>
              <p className="text-sm text-muted-foreground">围绕 flows + session 的本地 checkpoint 与恢复入口。</p>
            </div>
          </div>

          <div className="flex gap-2">
            <Input
              value={checkpointLabel}
              onChange={(event) => setCheckpointLabel(event.target.value)}
              placeholder="输入 checkpoint 名称"
            />
            <Button onClick={handleCreateCheckpoint}>创建</Button>
          </div>

          <div className="space-y-3">
            {checkpoints.length === 0 ? (
              <EmptyState message="还没有 checkpoint。先创建一个，再进行语义编辑和恢复验证。" />
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
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={restoringId === checkpoint.id}
                      onClick={() => void handleRestore(checkpoint.id)}
                    >
                      <RotateCcw className="size-4" />
                      {restoringId === checkpoint.id ? "恢复中..." : "恢复"}
                    </Button>
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
                      {compareCheckpointId === checkpoint.id ? "取消对比" : "对比当前"}
                    </Button>
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">
                    覆盖 {Object.keys(checkpoint.snapshot.flows).length} 个 Flow，
                    {checkpoint.snapshot.session ? "包含 Session 快照" : "Session 为空"}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border bg-card p-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">
              {compareSummary ? "Semantic Compare" : "Transactions"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {compareSummary
                ? "对比 checkpoint 与当前工作区的语义差异。"
                : "所有 Flow / Session / Project 写入都通过统一事务日志进入 Studio。"}
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
                  <div className="text-xs text-muted-foreground">新增 Flows</div>
                  <div className="mt-2 text-lg font-semibold">{compareSummary.addedFlows.length}</div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    {compareSummary.addedFlows.length > 0 ? compareSummary.addedFlows.join(", ") : "无"}
                  </div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-xs text-muted-foreground">删除 Flows</div>
                  <div className="mt-2 text-lg font-semibold">{compareSummary.removedFlows.length}</div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    {compareSummary.removedFlows.length > 0 ? compareSummary.removedFlows.join(", ") : "无"}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border p-4">
                <div className="mb-3 text-sm font-medium">Changed Flows</div>
                {compareSummary.changedFlows.length === 0 ? (
                  <div className="text-sm text-muted-foreground">没有 Flow 语义变化。</div>
                ) : (
                  <div className="space-y-2">
                    {compareSummary.changedFlows.map((flow) => (
                      <div key={flow.flowName} className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
                        <div className="font-medium">{flow.flowName}</div>
                        <div className="text-xs text-muted-foreground">
                          nodes {flow.beforeNodes} → {flow.afterNodes} · edges {flow.beforeEdges} → {flow.afterEdges}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border p-4">
                <div className="text-sm font-medium">Session Diff</div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {compareSummary.sessionChanged
                    ? `steps ${compareSummary.beforeSessionSteps} → ${compareSummary.afterSessionSteps}`
                    : "Session 没有变化。"}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {transactions.length === 0 ? (
                <EmptyState message="还没有事务记录。" />
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
