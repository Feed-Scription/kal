import { useMemo, useState } from 'react';
import { MessageSquareMore } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useCapabilityGate,
  useCommentsWorkspace,
  useFlowResource,
  useReviewWorkspace,
  useRunDebug,
  useStudioCommands,
  useWorkbench,
} from '@/kernel/hooks';

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

function describeAnchor(anchor: { kind: 'proposal'; proposalId: string } | { kind: 'resource'; resourceId: string } | { kind: 'run'; runId: string }) {
  if (anchor.kind === 'proposal') {
    return `proposal:${anchor.proposalId}`;
  }
  if (anchor.kind === 'run') {
    return `run:${anchor.runId}`;
  }
  return anchor.resourceId;
}

export function CommentsView() {
  const { activeThread, activeThreadId, threads } = useCommentsWorkspace();
  const capabilityGate = useCapabilityGate();
  const { activeProposal } = useReviewWorkspace();
  const { selectedRun } = useRunDebug();
  const { flowId } = useFlowResource();
  const { activeViewId } = useWorkbench();
  const { addComment, createCommentThread, resolveCommentThread, setActiveCommentThread } = useStudioCommands();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [reply, setReply] = useState('');

  const defaultAnchor = useMemo(() => {
    if (activeProposal) {
      return { kind: 'proposal', proposalId: activeProposal.id } as const;
    }
    if (selectedRun) {
      return { kind: 'run', runId: selectedRun.run_id } as const;
    }
    return { kind: 'resource', resourceId: flowId ? `flow://${flowId}` : 'project://current' } as const;
  }, [activeProposal, flowId, selectedRun]);

  return (
    <div className="h-full w-full overflow-auto bg-background p-6">
      <div className="mx-auto grid max-w-6xl gap-6 xl:grid-cols-[0.92fr_1.4fr]">
        <section className="space-y-4 rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-2">
            <MessageSquareMore className="size-4" />
            <div>
              <h1 className="text-lg font-semibold">Comments</h1>
              <p className="text-sm text-muted-foreground">异步评论线程独立于 canonical project data，围绕 proposal、resource 和 run 锚定。</p>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border p-4">
            <div className="text-xs text-muted-foreground">New Thread Anchor</div>
            <div className="font-mono text-sm">{describeAnchor(defaultAnchor)}</div>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="线程标题" />
            <Input value={body} onChange={(event) => setBody(event.target.value)} placeholder="首条评论内容" />
            <Button
              disabled={!capabilityGate.grants['comment.write']}
              onClick={() => {
                const threadId = createCommentThread({
                  title: title.trim() || `Comment @ ${activeViewId}`,
                  body,
                  anchor: defaultAnchor,
                });
                if (threadId) {
                  setActiveCommentThread(threadId);
                  setTitle('');
                  setBody('');
                }
              }}
            >
              创建线程
            </Button>
          </div>

          <div className="space-y-2">
            {threads.length === 0 ? (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                当前还没有评论线程。
              </div>
            ) : (
              threads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => setActiveCommentThread(thread.id)}
                  className={`w-full rounded-xl border px-4 py-3 text-left ${
                    activeThreadId === thread.id ? 'border-primary bg-primary/5' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">{thread.title}</div>
                    <div className="text-xs text-muted-foreground">{thread.status}</div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {describeAnchor(thread.anchor)} · {thread.comments.length} comments
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border bg-card p-5">
          {!activeThread ? (
            <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
              选择一个线程以查看讨论内容。
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">{activeThread.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{describeAnchor(activeThread.anchor)}</p>
                </div>
                <Button
                  disabled={!capabilityGate.grants['comment.write']}
                  variant="outline"
                  size="sm"
                  onClick={() => resolveCommentThread(activeThread.id, activeThread.status !== 'resolved')}
                >
                  {activeThread.status === 'resolved' ? '重新打开' : '标记已解决'}
                </Button>
              </div>

              <div className="space-y-3">
                {activeThread.comments.map((comment) => (
                  <div key={comment.id} className="rounded-xl border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">{comment.author}</div>
                      <div className="text-xs text-muted-foreground">{formatTime(comment.createdAt)}</div>
                    </div>
                    <div className="mt-2 text-sm whitespace-pre-wrap break-words">{comment.body}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border p-4">
                <div className="text-sm font-medium">回复线程</div>
                <div className="mt-3 flex gap-2">
                  <Input value={reply} onChange={(event) => setReply(event.target.value)} placeholder="输入回复内容" />
                  <Button
                    disabled={!capabilityGate.grants['comment.write']}
                    onClick={() => {
                      addComment(activeThread.id, reply);
                      setReply('');
                    }}
                  >
                    回复
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
