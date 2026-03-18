import { ExternalLink, Loader2, Monitor, Radio, RefreshCw, Smartphone, Tablet } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { getEngineAssetUrl } from '@/api/engine-client';
import { useFlowResource, useStudioResources, useRunDebug, useStudioCommands, useWorkbench } from '@/kernel/hooks';
import { cn } from '@/lib/utils';
import type { ExecutionResult } from '@/types/project';

type DeviceSize = 'mobile' | 'tablet' | 'desktop';

const DEVICE_SIZES: Record<DeviceSize, { width: string; height: string; icon: typeof Smartphone }> = {
  mobile: { width: '375px', height: '667px', icon: Smartphone },
  tablet: { width: '768px', height: '1024px', icon: Tablet },
  desktop: { width: '100%', height: '100%', icon: Monitor },
};

/**
 * KAL Studio ↔ H5 Preview postMessage Protocol
 *
 * Studio → Preview:
 *   { type: 'kal:state.sync',   payload: { state: Record<string,any> } }
 *   { type: 'kal:run.sync',     payload: { run: RunView | null } }
 *   { type: 'kal:signal.out',   payload: { channel: string, data: any } }
 *
 * Preview → Studio:
 *   { type: 'kal:signal.in',    payload: { channel: string, data: any } }
 *   { type: 'kal:preview.ready' }
 */

type KalMessage =
  | { type: 'kal:preview.ready' }
  | { type: 'kal:signal.in'; payload: { channel: string; data: unknown } };

function normalizeSignalInput(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }
  if (typeof data === 'number' || typeof data === 'boolean') {
    return String(data);
  }
  if (data && typeof data === 'object' && 'value' in (data as Record<string, unknown>)) {
    const value = (data as { value?: unknown }).value;
    return value === undefined ? JSON.stringify(data) : String(value);
  }
  return JSON.stringify(data);
}

export function H5PreviewView() {
  const { t } = useTranslation('preview');
  const [reloadToken, setReloadToken] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [deviceSize, setDeviceSize] = useState<DeviceSize>('desktop');
  const [previewReady, setPreviewReady] = useState(false);
  const [signalLog, setSignalLog] = useState<Array<{ direction: 'in' | 'out'; channel: string; data: unknown; time: number }>>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const emittedSignalKeysRef = useRef<Set<string>>(new Set());
  const { state, session } = useStudioResources();
  const { activeFlowId } = useWorkbench();
  const { flow } = useFlowResource(activeFlowId);
  const { selectedRun } = useRunDebug();
  const { advanceRun, executeFlow, recordKernelEvent } = useStudioCommands();
  const src = `${getEngineAssetUrl('/api/tools/h5-preview')}?v=${reloadToken}`;

  const handleReload = () => {
    setLoading(true);
    setError(false);
    setPreviewReady(false);
    setReloadToken((value) => value + 1);
  };

  // Send message to iframe
  const postToPreview = useCallback((msg: { type: string; payload?: unknown }) => {
    iframeRef.current?.contentWindow?.postMessage(msg, '*');
  }, []);

  const emitSignalOut = useCallback((channel: string, data: unknown) => {
    postToPreview({ type: 'kal:signal.out', payload: { channel, data } });
    setSignalLog((prev) => [
      ...prev.slice(-49),
      { direction: 'out', channel, data, time: Date.now() },
    ]);
  }, [postToPreview]);

  // Listen for messages from iframe
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!event.data || typeof event.data.type !== 'string') return;
      const msg = event.data as KalMessage;

      if (msg.type === 'kal:preview.ready') {
        setPreviewReady(true);
        return;
      }

      if (msg.type === 'kal:signal.in' && 'payload' in msg) {
        setSignalLog((prev) => [
          ...prev.slice(-49),
          { direction: 'in', channel: msg.payload.channel, data: msg.payload.data, time: Date.now() },
        ]);
        recordKernelEvent({
          type: 'resource.changed',
          message: `H5 Preview SignalIn: ${msg.payload.channel}`,
          data: { channel: msg.payload.channel, data: msg.payload.data },
        });

        const waitingStep = session?.steps.find((step) => step.id === selectedRun?.waiting_for?.step_id);
        const waitingChannel =
          waitingStep && 'inputChannel' in waitingStep ? waitingStep.inputChannel ?? null : null;

        if (selectedRun?.waiting_for && waitingChannel === msg.payload.channel) {
          void advanceRun(selectedRun.run_id, normalizeSignalInput(msg.payload.data)).catch((error) => {
            recordKernelEvent({
              type: 'run.updated',
              message: `SignalIn advance failed: ${(error as Error).message}`,
              runId: selectedRun.run_id,
              data: { channel: msg.payload.channel },
            });
          });
          return;
        }

        const supportsChannel = Boolean(flow?.meta.inputs?.some((input) => input.name === msg.payload.channel));
        if (activeFlowId && supportsChannel) {
          void executeFlow(activeFlowId, { [msg.payload.channel]: msg.payload.data })
            .then((result) => {
              const execution = result as ExecutionResult;
              Object.entries(execution.outputs ?? {}).forEach(([channel, value]) => {
                emitSignalOut(channel, value);
              });
            })
            .catch((error) => {
              recordKernelEvent({
                type: 'resource.changed',
                message: `SignalIn flow execution failed: ${(error as Error).message}`,
                resourceId: `flow://${activeFlowId}`,
                data: { channel: msg.payload.channel },
              });
            });
        }
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [activeFlowId, advanceRun, emitSignalOut, executeFlow, flow?.meta.inputs, recordKernelEvent, selectedRun, session?.steps]);

  // Sync state to preview when it changes
  useEffect(() => {
    if (!previewReady || !state) return;
    postToPreview({ type: 'kal:state.sync', payload: { state } });
  }, [previewReady, state, postToPreview]);

  // Sync active run to preview when it changes
  useEffect(() => {
    if (!previewReady) return;
    postToPreview({ type: 'kal:run.sync', payload: { run: selectedRun ?? null } });
  }, [previewReady, selectedRun, postToPreview]);

  useEffect(() => {
    if (!previewReady || !selectedRun) {
      emittedSignalKeysRef.current.clear();
      return;
    }

    selectedRun.recent_events.forEach((event, eventIndex) => {
      if (event.type !== 'output') {
        return;
      }
      Object.entries(event.raw ?? {}).forEach(([channel, value]) => {
        const signalKey = `${selectedRun.run_id}:${selectedRun.updated_at}:${eventIndex}:${channel}:${JSON.stringify(value)}`;
        if (emittedSignalKeysRef.current.has(signalKey)) {
          return;
        }
        emittedSignalKeysRef.current.add(signalKey);
        emitSignalOut(channel, value);
      });
    });
  }, [emitSignalOut, previewReady, selectedRun]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-lg font-semibold">{t('h5.title')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('h5.subtitle')}
            </p>
          </div>
          {previewReady && (
            <span className="flex items-center gap-1 rounded-full border border-green-600/30 bg-green-50 px-2 py-0.5 text-[10px] text-green-700">
              <Radio className="size-3" />
              {t('h5.connected')}
            </span>
          )}
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
            {t('h5.reload')}
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={src} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" />
              {t('h5.openInNewTab')}
            </a>
          </Button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 p-4">
        {loading && (
          <div className="absolute inset-4 z-10 flex items-center justify-center rounded-2xl border bg-background/80 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t('h5.loading')}
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-4 z-10 flex items-center justify-center rounded-2xl border bg-background/80 backdrop-blur-sm">
            <div className="text-center">
              <p className="text-sm text-destructive">{t('h5.loadFailed')}</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={handleReload}>
                {t('h5.retry')}
              </Button>
            </div>
          </div>
        )}
        <div className="flex h-full items-center justify-center">
          <iframe
            ref={iframeRef}
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

      {signalLog.length > 0 && (
        <div className="border-t">
          <div className="flex items-center justify-between px-4 py-2">
            <span className="text-xs font-medium text-muted-foreground">{t('h5.signalLog', { count: signalLog.length })}</span>
            <Button variant="ghost" size="sm" onClick={() => setSignalLog([])}>
              {t('h5.clearLog')}
            </Button>
          </div>
          <div className="max-h-32 overflow-auto px-4 pb-2">
            {signalLog.map((entry, i) => (
              <div key={i} className="flex items-center gap-2 py-0.5 font-mono text-xs">
                <span className={entry.direction === 'in' ? 'text-green-600' : 'text-blue-600'}>
                  {entry.direction === 'in' ? '← IN' : '→ OUT'}
                </span>
                <span className="text-muted-foreground">{entry.channel}</span>
                <span className="truncate">{JSON.stringify(entry.data)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
