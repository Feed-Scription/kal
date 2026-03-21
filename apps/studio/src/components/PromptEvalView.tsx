import { useEffect, useMemo, useState } from 'react';
import { FlaskConical, Loader2, Scale } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { engineApi } from '@/api/engine-client';
import { Button } from '@/components/ui/button';
import { useStudioResources, useWorkbench } from '@/kernel/hooks';
import type {
  EvalComparisonResult,
  EvalRunResult,
  HandleDefinition,
  ProjectState,
} from '@/types/project';
import type { PromptFragment } from '@/utils/prompt-fragments';
import { EvalTargetSection } from '@/components/eval/EvalTargetSection';
import { EvalEnvironmentSection } from '@/components/eval/EvalEnvironmentSection';
import { EvalVariantPanel } from '@/components/eval/EvalVariantPanel';
import { EvalResultsSection } from '@/components/eval/EvalResultsSection';

type EvalSlot = 'a' | 'b';

export function PromptEvalView() {
  const { t } = useTranslation('eval');
  const { project } = useStudioResources();
  const { activeFlowId } = useWorkbench();
  const flowNames = useMemo(() => Object.keys(project?.flows ?? {}).sort(), [project?.flows]);

  // ── Target ──
  const [flowId, setFlowId] = useState('');
  const [nodeId, setNodeId] = useState('');
  const [runs, setRuns] = useState(5);

  // ── Environment (structured, not JSON strings) ──
  const [inputValues, setInputValues] = useState<Record<string, unknown>>({});
  const [stateOverrides, setStateOverrides] = useState<Record<string, unknown>>({});
  const [runtimeState, setRuntimeState] = useState<ProjectState>({});

  // ── Variants (fragments, not JSON strings) ──
  const [baselineFragments, setBaselineFragments] = useState<PromptFragment[]>([]);
  const [variantFragments, setVariantFragments] = useState<PromptFragment[]>([]);
  const [modelA, setModelA] = useState('');
  const [modelB, setModelB] = useState('');

  // ── Results ──
  const [resultA, setResultA] = useState<EvalRunResult | null>(null);
  const [resultB, setResultB] = useState<EvalRunResult | null>(null);
  const [comparison, setComparison] = useState<EvalComparisonResult | null>(null);
  const [loadingSlot, setLoadingSlot] = useState<EvalSlot | 'compare' | null>(null);
  const [progressA, setProgressA] = useState<{ completed: number; total: number } | null>(null);
  const [progressB, setProgressB] = useState<{ completed: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Derived ──
  useEffect(() => {
    if (flowId) return;
    setFlowId(activeFlowId ?? flowNames[0] ?? '');
  }, [activeFlowId, flowId, flowNames]);

  const selectedFlow = flowId ? project?.flows[flowId] ?? null : null;

  const evalNodes = useMemo(() => {
    if (!selectedFlow) return [];
    return selectedFlow.data.nodes.filter(
      (node) => node.type === 'PromptBuild' || node.type === 'GenerateText',
    );
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

  const flowInputs: HandleDefinition[] = useMemo(
    () => selectedFlow?.meta.inputs ?? [],
    [selectedFlow],
  );

  const defaultModel = project?.config?.llm?.defaultModel ?? '';

  // ── Auto-load fragments when node changes ──
  useEffect(() => {
    const node = selectedFlow?.data.nodes.find((n) => n.id === nodeId);
    const frags = (node?.config?.fragments as PromptFragment[] | undefined) ?? [];
    const cloned = JSON.parse(JSON.stringify(frags)) as PromptFragment[];
    setBaselineFragments(cloned);
    setVariantFragments(JSON.parse(JSON.stringify(cloned)) as PromptFragment[]);
  }, [nodeId, selectedFlow]);

  // ── Load runtime state ──
  useEffect(() => {
    if (!flowId) return;
    engineApi.getState().then(setRuntimeState).catch(() => {});
  }, [flowId]);

  // ── Initialize input defaults from flow.meta.inputs ──
  useEffect(() => {
    const defaults: Record<string, unknown> = {};
    for (const input of flowInputs) {
      if (input.defaultValue !== undefined) defaults[input.name] = input.defaultValue;
    }
    setInputValues(defaults);
  }, [flowInputs]);

  // ── Run logic ──
  const runSlot = async (slot: EvalSlot): Promise<EvalRunResult> => {
    if (!flowId || !nodeId) {
      throw new Error(t('missingSelection'));
    }

    const input = Object.keys(inputValues).length > 0 ? inputValues : undefined;
    const state = Object.keys(stateOverrides).length > 0 ? stateOverrides : undefined;
    const fragments = slot === 'a' ? baselineFragments : variantFragments;
    const variant = fragments.length > 0 ? { fragments } : undefined;
    const model = (slot === 'a' ? modelA : modelB).trim() || undefined;

    const setProgress = slot === 'a' ? setProgressA : setProgressB;

    const result = await engineApi.runEvalStream(
      { flowId, nodeId, runs, input, state, variant, model },
      (event) => setProgress({ completed: event.completedRuns, total: event.totalRuns }),
    );
    setProgress(null);

    if (slot === 'a') setResultA(result);
    else setResultB(result);
    return result;
  };

  const handleRun = async (slot: EvalSlot) => {
    try {
      setError(null);
      setComparison(null);
      setLoadingSlot(slot);
      (slot === 'a' ? setProgressA : setProgressB)(null);
      await runSlot(slot);
    } catch (nextError) {
      setError((nextError as Error).message);
    } finally {
      setLoadingSlot(null);
      (slot === 'a' ? setProgressA : setProgressB)(null);
    }
  };

  const handleCompare = async () => {
    try {
      setError(null);
      setLoadingSlot('compare');
      setProgressA(null);
      setProgressB(null);
      const a = await runSlot('a');
      const b = await runSlot('b');
      const result = await engineApi.compareEval(a, b);
      setComparison(result);
    } catch (nextError) {
      setError((nextError as Error).message);
    } finally {
      setLoadingSlot(null);
      setProgressA(null);
      setProgressB(null);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <FlaskConical className="size-5" />
          {t('title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* Target: Flow + Node + Runs */}
      <EvalTargetSection
        flowId={flowId}
        nodeId={nodeId}
        runs={runs}
        flowNames={flowNames}
        evalNodes={evalNodes}
        onFlowChange={setFlowId}
        onNodeChange={setNodeId}
        onRunsChange={setRuns}
      />

      {/* Environment: Inputs + State */}
      <EvalEnvironmentSection
        flowInputs={flowInputs}
        inputValues={inputValues}
        stateOverrides={stateOverrides}
        runtimeState={runtimeState}
        onInputChange={setInputValues}
        onStateChange={setStateOverrides}
      />

      {/* Variants: A (baseline, read-only) + B (editable) */}
      <div className="grid gap-4 md:grid-cols-2">
        <EvalVariantPanel
          slot="a"
          label={t('variant.baseline')}
          readOnly
          fragments={baselineFragments}
          model={modelA}
          defaultModel={defaultModel}
          loading={loadingSlot === 'a' || loadingSlot === 'compare'}
          progress={progressA}
          onRun={() => void handleRun('a')}
          onModelChange={setModelA}
        />
        <EvalVariantPanel
          slot="b"
          label={t('variant.variant')}
          fragments={variantFragments}
          model={modelB}
          defaultModel={defaultModel}
          loading={loadingSlot === 'b' || loadingSlot === 'compare'}
          progress={progressB}
          onRun={() => void handleRun('b')}
          onFragmentsChange={setVariantFragments}
          onModelChange={setModelB}
        />
      </div>

      {/* Compare — centered between variants and results */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <Button
          variant="secondary"
          size="sm"
          className="gap-2"
          disabled={loadingSlot !== null || !nodeId}
          onClick={() => void handleCompare()}
        >
          {loadingSlot === 'compare' ? <Loader2 className="size-4 animate-spin" /> : <Scale className="size-4" />}
          {t('compare')}
        </Button>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Results */}
      <EvalResultsSection resultA={resultA} resultB={resultB} comparison={comparison} />
    </div>
  );
}
