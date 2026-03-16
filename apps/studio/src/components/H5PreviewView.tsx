import { ExternalLink, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { getEngineAssetUrl } from '@/api/engine-client';

export function H5PreviewView() {
  const [reloadToken, setReloadToken] = useState(0);
  const src = `${getEngineAssetUrl('/api/tools/h5-preview')}?v=${reloadToken}`;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold">H5 Preview</h1>
          <p className="text-sm text-muted-foreground">
            以 browser-host 方式预览当前项目与 active run 摘要，用于压测 preview surface。
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setReloadToken((value) => value + 1)}>
            <RefreshCw className="size-4" />
            重新加载
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={src} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" />
              新窗口打开
            </a>
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-4">
        <iframe
          key={reloadToken}
          title="KAL H5 Preview"
          src={src}
          className="h-full w-full rounded-2xl border bg-white"
        />
      </div>
    </div>
  );
}
