import { useEffect, useState } from "react";
import { useProjectStore } from "@/store/projectStore";
import { CheckCircle2, XCircle, Loader2, Wifi } from "lucide-react";

export function StatusBar() {
  const project = useProjectStore((state) => state.project);
  const currentFlow = useProjectStore((state) => state.currentFlow);
  const engineConnected = useProjectStore((state) => state.engineConnected);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  useEffect(() => {
    const handleSave = () => setSaveStatus("saving");
    const handleSaved = () => {
      setSaveStatus("saved");
      setLastSaved(new Date());
    };
    const handleError = () => setSaveStatus("error");

    window.addEventListener("flow:saving", handleSave);
    window.addEventListener("flow:saved", handleSaved);
    window.addEventListener("flow:error", handleError);

    return () => {
      window.removeEventListener("flow:saving", handleSave);
      window.removeEventListener("flow:saved", handleSaved);
      window.removeEventListener("flow:error", handleError);
    };
  }, []);

  if (!project) return null;

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const currentFlowData = currentFlow ? project.flows[currentFlow] : null;

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
          {saveStatus === "saved" && (
            <>
              <CheckCircle2 className="size-3.5 text-green-600" />
              <span className="text-green-600">
                已保存 {lastSaved && `(${formatTime(lastSaved)})`}
              </span>
            </>
          )}
          {saveStatus === "saving" && (
            <>
              <Loader2 className="size-3.5 animate-spin text-yellow-600" />
              <span className="text-yellow-600">保存中...</span>
            </>
          )}
          {saveStatus === "error" && (
            <>
              <XCircle className="size-3.5 text-red-600" />
              <span className="text-red-600">保存失败</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
