import { useState } from "react";
import { Loader2, AlertCircle, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/store/projectStore";

export function ProjectLoader() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const connect = useProjectStore((state) => state.connect);

  const handleConnect = async () => {
    setLoading(true);
    setError("");

    try {
      await connect();
    } catch (err: any) {
      setError(err.message || "连接 Engine 失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-6 rounded-lg border border-border bg-card p-8 shadow-lg">
        <div className="space-y-2 text-center">
          <Wifi className="mx-auto size-12 text-muted-foreground" />
          <h1 className="text-2xl font-bold">连接 Engine</h1>
          <p className="text-sm text-muted-foreground">
            连接到 Kal Engine 服务开始编辑
          </p>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/50 p-4 text-center">
            <p className="font-mono text-sm">http://localhost:3000</p>
          </div>

          <Button
            className="w-full"
            size="lg"
            onClick={handleConnect}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                连接中...
              </>
            ) : (
              <>
                <Wifi className="mr-2 size-4" />
                连接
              </>
            )}
          </Button>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          <div className="space-y-2 rounded-lg border bg-blue-500/10 p-4 text-sm">
            <h3 className="font-semibold text-blue-600">使用说明</h3>
            <p className="text-muted-foreground">
              请先启动 Engine 服务：
            </p>
            <pre className="mt-2 rounded bg-muted p-2 text-xs font-mono overflow-x-auto">
              kal serve &lt;project-path&gt;
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
