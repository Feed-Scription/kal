import { Info } from "lucide-react";
import { useStudioResources } from "@/kernel/hooks";

export function ConfigEditor() {
  const { config } = useStudioResources();

  if (!config) return null;

  return (
    <div className="h-full w-full overflow-auto bg-background p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">项目设置</h1>
        </div>

        <div className="flex items-start gap-2 rounded-lg border bg-blue-500/10 p-4 text-sm">
          <Info className="size-4 shrink-0 mt-0.5 text-blue-600" />
          <p className="text-muted-foreground">
            配置数据来自 Engine 的 canonical config，当前为只读模式。如需修改，请直接编辑项目文件后重载项目。
          </p>
        </div>

        <div className="space-y-6 rounded-lg border bg-card p-6">
          <div>
            <h2 className="mb-4 text-lg font-semibold">基本信息</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">项目名称</label>
                <p className="text-sm">{config.name}</p>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">版本</label>
                <p className="text-sm">{config.version}</p>
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-4 text-lg font-semibold">引擎设置</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">日志级别</label>
                <p className="text-sm">{config.engine.logLevel}</p>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">最大并发 Flow</label>
                <p className="text-sm">{config.engine.maxConcurrentFlows}</p>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">超时时间 (ms)</label>
                <p className="text-sm">{config.engine.timeout}</p>
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-4 text-lg font-semibold">LLM 配置</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">Provider</label>
                <p className="text-sm">{config.llm.provider || "—"}</p>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">默认模型</label>
                <p className="text-sm">{config.llm.defaultModel || "—"}</p>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">Base URL</label>
                <p className="text-sm">{config.llm.baseUrl || "—"}</p>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">最大重试次数</label>
                <p className="text-sm">{config.llm.retry.maxRetries}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
