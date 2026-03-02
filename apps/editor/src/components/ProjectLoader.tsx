import { useState } from "react";
import { FolderOpen, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/store/projectStore";

export function ProjectLoader() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const loadProject = useProjectStore((state) => state.loadProject);

  const handleOpenDirectory = async () => {
    setLoading(true);
    setError("");

    try {
      // Check if File System Access API is supported
      if (!('showDirectoryPicker' in window)) {
        throw new Error('您的浏览器不支持 File System Access API。请使用 Chrome、Edge 或其他支持的浏览器。');
      }

      // @ts-ignore - showDirectoryPicker is not in TypeScript types yet
      const dirHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
      });

      await loadProject(dirHandle);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User cancelled, do nothing
        setError("");
      } else {
        setError(err.message || "加载项目失败");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-6 rounded-lg border border-border bg-card p-8 shadow-lg">
        <div className="space-y-2 text-center">
          <FolderOpen className="mx-auto size-12 text-muted-foreground" />
          <h1 className="text-2xl font-bold">打开项目</h1>
          <p className="text-sm text-muted-foreground">
            选择一个 KAL 项目文件夹开始编辑
          </p>
        </div>

        <div className="space-y-4">
          <Button
            className="w-full"
            size="lg"
            onClick={handleOpenDirectory}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                加载中...
              </>
            ) : (
              <>
                <FolderOpen className="mr-2 size-4" />
                选择项目文件夹
              </>
            )}
          </Button>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          <div className="space-y-2 rounded-lg border bg-muted/50 p-4 text-sm">
            <h3 className="font-semibold">项目结构要求：</h3>
            <ul className="space-y-1 text-muted-foreground">
              <li>• kal_config.json（必需）</li>
              <li>• flow/ 文件夹（必需）</li>
              <li>• initial_state.json（可选）</li>
            </ul>
          </div>

          <div className="space-y-2 rounded-lg border bg-blue-500/10 p-4 text-sm">
            <h3 className="font-semibold text-blue-600">浏览器要求：</h3>
            <p className="text-muted-foreground">
              需要支持 File System Access API 的浏览器：
            </p>
            <ul className="space-y-1 text-muted-foreground">
              <li>• Chrome 86+</li>
              <li>• Edge 86+</li>
              <li>• Opera 72+</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
