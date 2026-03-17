import { Info } from "lucide-react";
import { useStudioResources } from "@/kernel/hooks";

export function StateManager() {
  const { state } = useStudioResources();

  const stateEntries = Object.entries(state);

  return (
    <div className="h-full w-full overflow-auto bg-background p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">State 管理</h1>
        </div>

        <div className="flex items-start gap-2 rounded-lg border bg-blue-500/10 p-4 text-sm">
          <Info className="size-4 shrink-0 mt-0.5 text-blue-600" />
          <p className="text-muted-foreground">
            State 数据来自 Engine 的 canonical snapshot，当前为只读模式。如需修改，请直接编辑项目文件后重载项目。
          </p>
        </div>

        {stateEntries.length === 0 ? (
          <div className="rounded-lg border p-8 text-center text-muted-foreground">
            暂无 State 数据
          </div>
        ) : (
          <div className="rounded-lg border">
            <table className="w-full">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="p-3 text-left text-sm font-medium">Key</th>
                  <th className="p-3 text-left text-sm font-medium">Type</th>
                  <th className="p-3 text-left text-sm font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {stateEntries.map(([key, stateValue]) => (
                  <tr key={key} className="border-b last:border-0">
                    <td className="p-3 font-mono text-sm">{key}</td>
                    <td className="p-3 text-sm text-muted-foreground">
                      {stateValue.type}
                    </td>
                    <td className="p-3 text-sm">
                      {typeof stateValue.value === "object"
                        ? JSON.stringify(stateValue.value)
                        : String(stateValue.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
