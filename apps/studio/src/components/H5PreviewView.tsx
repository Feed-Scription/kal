import { ExternalLink, Loader2, Monitor, RefreshCw, Smartphone, Tablet } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { getEngineAssetUrl } from '@/api/engine-client';
import { cn } from '@/lib/utils';

type DeviceSize = 'mobile' | 'tablet' | 'desktop';

const DEVICE_SIZES: Record<DeviceSize, { width: string; height: string; icon: typeof Smartphone }> = {
  mobile: { width: '375px', height: '667px', icon: Smartphone },
  tablet: { width: '768px', height: '1024px', icon: Tablet },
  desktop: { width: '100%', height: '100%', icon: Monitor },
};

export function H5PreviewView() {
  const [reloadToken, setReloadToken] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [deviceSize, setDeviceSize] = useState<DeviceSize>('desktop');
  const src = `${getEngineAssetUrl('/api/tools/h5-preview')}?v=${reloadToken}`;

  const handleReload = () => {
    setLoading(true);
    setError(false);
    setReloadToken((value) => value + 1);
  };

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
          <div className="flex rounded-lg border">
            {(Object.entries(DEVICE_SIZES) as Array<[DeviceSize, typeof DEVICE_SIZES[DeviceSize]]>).map(([size, { icon: Icon }]) => (
              <Button
                key={size}
                variant="ghost"
                size="icon-sm"
                onClick={() => setDeviceSize(size)}
                className={cn(
                  'rounded-none first:rounded-l-lg last:rounded-r-lg',
                  deviceSize === size && 'bg-muted',
                )}
                title={size}
              >
                <Icon className="size-4" />
              </Button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={handleReload}>
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

      <div className="relative min-h-0 flex-1 p-4">
        {loading && (
          <div className="absolute inset-4 z-10 flex items-center justify-center rounded-2xl border bg-background/80 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              加载中...
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-4 z-10 flex items-center justify-center rounded-2xl border bg-background/80 backdrop-blur-sm">
            <div className="text-center">
              <p className="text-sm text-destructive">预览加载失败</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={handleReload}>
                重试
              </Button>
            </div>
          </div>
        )}
        <div className="flex h-full items-center justify-center">
          <iframe
            key={reloadToken}
            title="KAL H5 Preview"
            src={src}
            className="rounded-2xl border bg-white shadow-sm transition-all"
            style={{
              width: DEVICE_SIZES[deviceSize].width,
              height: DEVICE_SIZES[deviceSize].height,
            }}
            onLoad={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setError(true);
            }}
          />
        </div>
      </div>
    </div>
  );
}
