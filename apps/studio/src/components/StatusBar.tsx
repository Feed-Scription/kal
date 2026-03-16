import { CheckCircle2, Lock, XCircle, Loader2, Wifi } from "lucide-react";
import { useCapabilityGate, useConnectionState, useFlowResource, useKernelJobs, useResourceVersion, useSaveState, useStudioResources, useWorkbench } from "@/kernel/hooks";
import type { ResourceId } from "@/types/project";

export function StatusBar() {
  const { project } = useStudioResources();
  const { flowId: currentFlow } = useFlowResource();
  const { engineConnected } = useConnectionState();
  const saveState = useSaveState();
  const { activeExtension, activePreset, activeView } = useWorkbench();
  const jobs = useKernelJobs();
  const capabilityGate = useCapabilityGate(activeExtension?.capabilities);
  const activeResourceId = (currentFlow ? `flow://${currentFlow}` : "session://default") as ResourceId;
  const activeVersion = useResourceVersion(activeResourceId);

  if (!project) return null;

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const currentFlowData = currentFlow ? project.flows[currentFlow] : null;
  const lastSaved = saveState.updatedAt ? new Date(saveState.updatedAt) : null;
  const activeJobs = jobs.filter((job) => job.status === "running");

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between border-t bg-background/95 px-4 py-2 text-xs backdrop-blur">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Wifi className={`size-3.5 ${engineConnected ? "text-green-600" : "text-red-600"}`} />
          <span className={engineConnected ? "text-green-600" : "text-red-600"}>
            {engineConnected ? "已连接" : "未连接"}
          </span>
        </div>
        <span className="text-muted-foreground">
          项目: <span className="font-medium text-foreground">{project.config.name}</span>
        </span>
        {currentFlow && (
          <span className="text-muted-foreground">
            Flow: <span className="font-medium text-foreground">{currentFlow}</span>
          </span>
        )}
        <span className="text-muted-foreground">
          版本: <span className="font-medium text-foreground">v{activeVersion?.version ?? 0}</span>
        </span>
        <span className="text-muted-foreground">
          视图: <span className="font-medium text-foreground">{activeView.shortTitle}</span>
        </span>
        <span className="text-muted-foreground">
          工作区: <span className="font-medium text-foreground">{activePreset}</span>
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Lock className={`size-3.5 ${capabilityGate.trusted ? "text-green-600" : "text-yellow-600"}`} />
          <span className="font-medium text-foreground">
            {capabilityGate.trusted ? "trusted" : "restricted"}
          </span>
        </span>
      </div>

      <div className="flex items-center gap-4">
        {currentFlowData && (
          <>
            <span className="text-muted-foreground">
              节点: <span className="font-medium text-foreground">{currentFlowData.data.nodes.length}</span>
            </span>
            <span className="text-muted-foreground">
              连线: <span className="font-medium text-foreground">{currentFlowData.data.edges.length}</span>
            </span>
          </>
        )}

        <div className="flex items-center gap-1.5">
          {activeJobs.length > 0 ? (
            <span className="flex items-center gap-1.5 text-blue-600">
              <Loader2 className="size-3.5 animate-spin" />
              {activeJobs.length} 个任务进行中
            </span>
          ) : null}
          {saveState.status === "saved" && (
            <span className="flex items-center gap-1.5 animate-in fade-in-0 duration-200 ease-[var(--ease-apple)]">
              <CheckCircle2 className="size-3.5 text-green-600" />
              <span className="text-green-600">
                已保存 {saveState.resource ? `${saveState.resource} ` : ""}{lastSaved && `(${formatTime(lastSaved)})`}
              </span>
            </span>
          )}
          {saveState.status === "saving" && (
            <span className="flex items-center gap-1.5 animate-in fade-in-0 duration-200 ease-[var(--ease-apple)]">
              <Loader2 className="size-3.5 animate-spin text-yellow-600" />
              <span className="text-yellow-600">保存中 {saveState.resource ? `(${saveState.resource})` : ""}</span>
            </span>
          )}
          {saveState.status === "error" && (
            <span className="flex items-center gap-1.5 animate-in fade-in-0 duration-200 ease-[var(--ease-apple)]">
              <XCircle className="size-3.5 text-red-600" />
              <span className="text-red-600">保存失败{saveState.resource ? `: ${saveState.resource}` : ""}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
