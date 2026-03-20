import { useEffect, useMemo, useState } from 'react';
import { FlaskConical, Loader2, Scale } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { engineApi } from '@/api/engine-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useStudioResources, useWorkbench } from '@/kernel/hooks';
import type { EvalComparisonResult, EvalRunResult, EvalRunVariant } from '@/types/project';

type EvalSlot = 'a' | 'b';

function parseJsonObject(value: string, field: string): Record<string, unknown> | undefined {
  if (!value.trim()) {
    return undefined;
  }
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(field);
  }
  return parsed as Record<string, unknown>;
}

function parseVariant(value: string): EvalRunVariant | undefined {
  if (!value.trim()) {
    return undefined;
  }
  const parsed = JSON.parse(value) as unknown;
  if (Array.isArray(parsed)) {
    return { fragments: parsed as Array<Record<string, unknown>> };
  }
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { fragments?: unknown[] }).fragments)) {
    return parsed as EvalRunVariant;
  }
  throw new Error('variant');
}

function ResultCard({
  title,
  result,
}: {
  title: string;
  result: EvalRunResult | null;
}) {
  const { t } = useTranslation('eval');

  if (!result) {
    return null;
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="text-xs text-muted-foreground">
          {result.model ?? t('resultModelDefault')} · {t('resultRuns', { count: result.runs })}
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <div className="rounded-lg border px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('metrics.cost')}</div>
          <div className="mt-1 text-sm font-medium">${result.result.cost}</div>
        </div>
        <div className="rounded-lg border px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('metrics.latency')}</div>
          <div className="mt-1 text-sm font-medium">{result.result.avgLatency}ms</div>
        </div>
      </div>
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">{t('outputs')}</div>
        <pre className="max-h-56 overflow-auto rounded-lg border bg-muted/30 p-3 text-xs leading-5">
          {JSON.stringify(result.result.outputs.slice(0, 3), null, 2)}
        </pre>
      </div>
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">{t('stats')}</div>
        <pre className="max-h-48 overflow-auto rounded-lg border bg-muted/30 p-3 text-xs leading-5">
          {JSON.stringify(
            {
              numeric: result.result.numericStats,
              boolean: result.result.booleanStats ?? {},
            },
            null,
            2,
          )}
        </pre>
      </div>
    </section>
  );
}

function ComparisonCard({ result }: { result: EvalComparisonResult | null }) {
  const { t } = useTranslation('eval');

  if (!result) {
    return null;
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Scale className="size-4" />
        {t('compareTitle')}
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {result.diff.cost ? (
          <div className="rounded-lg border px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('metrics.costDelta')}</div>
            <div className="mt-1 text-sm font-medium">{result.diff.cost.delta}</div>
          </div>
        ) : null}
        {result.diff.avgLatency ? (
          <div className="rounded-lg border px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('metrics.latencyDelta')}</div>
            <div className="mt-1 text-sm font-medium">{result.diff.avgLatency.delta}ms</div>
          </div>
        ) : null}
      </div>
      <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/30 p-3 text-xs leading-5">
        {JSON.stringify(result.diff, null, 2)}
      </pre>
    </section>
  );
}

export function PromptEvalView() {
  const { t } = useTranslation('eval');
  const { project } = useStudioResources();
  const { activeFlowId } = useWorkbench();
  const flowNames = useMemo(() => Object.keys(project?.flows ?? {}).sort(), [project?.flows]);
  const [flowId, setFlowId] = useState('');
  const [nodeId, setNodeId] = useState('');
  const [runs, setRuns] = useState('5');
  const [inputText, setInputText] = useState('');
  const [stateText, setStateText] = useState('');
  const [modelA, setModelA] = useState('');
  const [modelB, setModelB] = useState('');
  const [variantAText, setVariantAText] = useState('');
  const [variantBText, setVariantBText] = useState('');
  const [resultA, setResultA] = useState<EvalRunResult | null>(null);
  const [resultB, setResultB] = useState<EvalRunResult | null>(null);
  const [comparison, setComparison] = useState<EvalComparisonResult | null>(null);
  const [loadingSlot, setLoadingSlot] = useState<EvalSlot | 'compare' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (flowId) {
      return;
    }
    setFlowId(activeFlowId ?? flowNames[0] ?? '');
  }, [activeFlowId, flowId, flowNames]);

  const selectedFlow = flowId ? project?.flows[flowId] ?? null : null;
  const evalNodes = useMemo(() => {
    if (!selectedFlow) {
      return [];
    }
    return selectedFlow.data.nodes.filter((node) => node.type === 'PromptBuild' || node.type === 'GenerateText');
  }, [selectedFlow]);

  useEffect(() => {
    if (evalNodes.length === 0) {
      setNodeId('');
      return;
    }
    if (!evalNodes.some((node) => node.id === nodeId)) {
      setNodeId(evalNodes[0]!.id);
    }
  }, [evalNodes, nodeId]);

  const runCount = useMemo(() => {
    const parsed = Number.parseInt(runs, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
  }, [runs]);

  const runSlot = async (slot: EvalSlot): Promise<EvalRunResult> => {
    if (!flowId || !nodeId) {
      throw new Error(t('missingSelection'));
    }

    const input = parseJsonObject(inputText, 'input');
    const state = parseJsonObject(stateText, 'state');
    const variant = parseVariant(slot === 'a' ? variantAText : variantBText);
    const model = (slot === 'a' ? modelA : modelB).trim() || undefined;

    const result = await engineApi.runEval({
      flowId,
      nodeId,
      runs: runCount,
      input,
      state,
      variant,
      model,
    });

    if (slot === 'a') {
      setResultA(result);
    } else {
      setResultB(result);
    }
    return result;
  };

  const handleRun = async (slot: EvalSlot) => {
    try {
      setError(null);
      setComparison(null);
      setLoadingSlot(slot);
      await runSlot(slot);
    } catch (nextError) {
      const key = (nextError as Error).message;
      setError(key === 'input' || key === 'state' || key === 'variant' ? t(`invalid.${key}`) : key);
    } finally {
      setLoadingSlot(null);
    }
  };

  const handleCompare = async () => {
    try {
      setError(null);
      setLoadingSlot('compare');
      const a = await runSlot('a');
      const b = await runSlot('b');
      const result = await engineApi.compareEval(a, b);
      setComparison(result);
    } catch (nextError) {
      const key = (nextError as Error).message;
      setError(key === 'input' || key === 'state' || key === 'variant' ? t(`invalid.${key}`) : key);
    } finally {
      setLoadingSlot(null);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4">
      <section className="space-y-4 rounded-xl border bg-card p-4">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <FlaskConical className="size-5" />
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>{t('flow')}</Label>
            <Select value={flowId} onValueChange={setFlowId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('chooseFlow')} />
              </SelectTrigger>
              <SelectContent>
                {flowNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('node')}</Label>
            <Select value={nodeId} onValueChange={setNodeId} disabled={evalNodes.length === 0}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('chooseNode')} />
              </SelectTrigger>
              <SelectContent>
                {evalNodes.map((node) => (
                  <SelectItem key={node.id} value={node.id}>
                    {node.label || node.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('runs')}</Label>
            <Input value={runs} onChange={(event) => setRuns(event.target.value)} />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t('input')}</Label>
            <Textarea
              value={inputText}
              onChange={(event) => setInputText(event.target.value)}
              placeholder={t('inputPlaceholder')}
              className="min-h-[120px]"
            />
          </div>
          <div className="space-y-2">
            <Label>{t('state')}</Label>
            <Textarea
              value={stateText}
              onChange={(event) => setStateText(event.target.value)}
              placeholder={t('statePlaceholder')}
              className="min-h-[120px]"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3 rounded-lg border p-3">
            <div className="text-sm font-medium">{t('variantA')}</div>
            <Input value={modelA} onChange={(event) => setModelA(event.target.value)} placeholder={t('modelPlaceholder')} />
            <Textarea
              value={variantAText}
              onChange={(event) => setVariantAText(event.target.value)}
              placeholder={t('variantPlaceholder')}
              className="min-h-[140px]"
            />
            <Button className="w-full gap-2" disabled={loadingSlot !== null} onClick={() => void handleRun('a')}>
              {loadingSlot === 'a' ? <Loader2 className="size-4 animate-spin" /> : null}
              {t('runA')}
            </Button>
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <div className="text-sm font-medium">{t('variantB')}</div>
            <Input value={modelB} onChange={(event) => setModelB(event.target.value)} placeholder={t('modelPlaceholder')} />
            <Textarea
              value={variantBText}
              onChange={(event) => setVariantBText(event.target.value)}
              placeholder={t('variantPlaceholder')}
              className="min-h-[140px]"
            />
            <Button variant="outline" className="w-full gap-2" disabled={loadingSlot !== null} onClick={() => void handleRun('b')}>
              {loadingSlot === 'b' ? <Loader2 className="size-4 animate-spin" /> : null}
              {t('runB')}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="gap-2" disabled={loadingSlot !== null || !nodeId} onClick={() => void handleCompare()}>
            {loadingSlot === 'compare' ? <Loader2 className="size-4 animate-spin" /> : <Scale className="size-4" />}
            {t('compare')}
          </Button>
        </div>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}
      </section>

      <ResultCard title={t('resultA')} result={resultA} />
      <ResultCard title={t('resultB')} result={resultB} />
      <ComparisonCard result={comparison} />
    </div>
  );
}
