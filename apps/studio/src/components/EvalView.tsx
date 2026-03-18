import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlaskConical, Loader2, Play, Save, GitCompareArrows } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { engineApi } from "@/api/engine-client";
import type {
  FlowListItem,
  NodeDefinition,
  EvalRunResult,
  EvalCompareResult,
  NumericStats,
} from "@/types/project";

function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

function formatPct(pct: number | null): string {
  if (pct === null) return "—";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function NumericStatsTable({ stats, t }: { stats: Record<string, NumericStats>; t: (k: string) => string }) {
  const keys = Object.keys(stats);
  if (keys.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-1.5 pr-3 font-medium">{t("field")}</th>
            <th className="py-1.5 pr-3 font-medium">{t("min")}</th>
            <th className="py-1.5 pr-3 font-medium">{t("max")}</th>
            <th className="py-1.5 pr-3 font-medium">{t("median")}</th>
            <th className="py-1.5 pr-3 font-medium">{t("mean")}</th>
            <th className="py-1.5 pr-3 font-medium">{t("stddev")}</th>
            <th className="py-1.5 pr-3 font-medium">{t("p25")}</th>
            <th className="py-1.5 font-medium">{t("p75")}</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => {
            const s = stats[key]!;
            return (
              <tr key={key} className="border-b last:border-0">
                <td className="py-1.5 pr-3 font-mono font-medium">{key}</td>
                <td className="py-1.5 pr-3">{s.min}</td>
                <td className="py-1.5 pr-3">{s.max}</td>
                <td className="py-1.5 pr-3">{s.median}</td>
                <td className="py-1.5 pr-3">{s.mean}</td>
                <td className="py-1.5 pr-3">{s.stddev}</td>
                <td className="py-1.5 pr-3">{s.p25}</td>
                <td className="py-1.5">{s.p75}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function EvalView() {
  const { t } = useTranslation("eval");

  // ── Flow & Node selection ──
  const [flows, setFlows] = useState<FlowListItem[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string>("");
  const [promptNodes, setPromptNodes] = useState<NodeDefinition[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");

  // ── Run config ──
  const [runs, setRuns] = useState(5);
  const [model, setModel] = useState("");
  const [stateJson, setStateJson] = useState("");

  // ── State ──
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<EvalRunResult | null>(null);
  const [baseline, setBaseline] = useState<EvalRunResult | null>(null);
  const [comparison, setComparison] = useState<EvalCompareResult | null>(null);

  // Load flows on mount
  useEffect(() => {
    engineApi.listFlows().then(setFlows).catch(() => {});
  }, []);

  // Load flow definition when selection changes
  useEffect(() => {
    if (!selectedFlowId) {
      setPromptNodes([]);
      setSelectedNodeId("");
      return;
    }
    engineApi.getFlow(selectedFlowId).then((flow) => {
      const nodes = flow.data.nodes.filter(
        (n) => n.type === "PromptBuild" || n.type === "GenerateText",
      );
      setPromptNodes(nodes);
      setSelectedNodeId(nodes[0]?.id ?? "");
    }).catch(() => {});
  }, [selectedFlowId]);

  const handleRun = useCallback(async () => {
    if (!selectedFlowId || !selectedNodeId) return;
    setLoading(true);
    setError("");
    setComparison(null);
    try {
      let stateOverride: Record<string, any> | undefined;
      if (stateJson.trim()) {
        try {
          stateOverride = JSON.parse(stateJson);
        } catch {
          setError(t("errors.invalidJson"));
          setLoading(false);
          return;
        }
      }
      const evalResult = await engineApi.runEval({
        flowId: selectedFlowId,
        nodeId: selectedNodeId,
        runs,
        model: model || undefined,
        state: stateOverride,
      });
      setResult(evalResult);

      // Auto-compare if baseline exists
      if (baseline) {
        try {
          const cmp = await engineApi.compareEval(baseline, evalResult);
          setComparison(cmp);
        } catch {
          // comparison is optional, don't block
        }
      }
    } catch (err) {
      setError((err as Error).message || t("errors.evalFailed"));
    } finally {
      setLoading(false);
    }
  }, [selectedFlowId, selectedNodeId, runs, model, stateJson, baseline, t]);

  const handleSaveBaseline = useCallback(() => {
    if (result) {
      setBaseline(result);
      setComparison(null);
    }
  }, [result]);

  return (
    <div className="h-full w-full overflow-auto bg-background p-6">
      <div className="mx-auto grid max-w-6xl gap-6">
        {/* ── Header + Config ── */}
        <section className="space-y-4 rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-2">
            <FlaskConical className="size-4" />
            <div>
              <h1 className="text-lg font-semibold">{t("title")}</h1>
              <p className="text-sm text-muted-foreground">{t("description")}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Flow selector */}
            <div className="space-y-1.5">
              <Label>{t("selectFlow")}</Label>
              <Select value={selectedFlowId} onValueChange={setSelectedFlowId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("selectFlow")} />
                </SelectTrigger>
                <SelectContent>
                  {flows.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Node selector */}
            <div className="space-y-1.5">
              <Label>{t("selectNode")}</Label>
              <Select
                value={selectedNodeId}
                onValueChange={setSelectedNodeId}
                disabled={promptNodes.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("selectNode")} />
                </SelectTrigger>
                <SelectContent>
                  {promptNodes.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.id} [{n.type}]
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedFlowId && promptNodes.length === 0 && (
                <p className="text-xs text-muted-foreground">{t("noPromptNodes")}</p>
              )}
            </div>

            {/* Runs */}
            <div className="space-y-1.5">
              <Label>{t("runs")}</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={runs}
                onChange={(e) => setRuns(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>

            {/* Model override */}
            <div className="space-y-1.5">
              <Label>{t("modelOverride")}</Label>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={t("modelPlaceholder")}
              />
            </div>
          </div>

          {/* State override */}
          <div className="space-y-1.5">
            <Label>{t("stateOverride")}</Label>
            <textarea
              className="w-full rounded-md border bg-transparent px-3 py-2 font-mono text-xs shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
              rows={3}
              value={stateJson}
              onChange={(e) => setStateJson(e.target.value)}
              placeholder="{}"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              onClick={() => void handleRun()}
              disabled={loading || !selectedFlowId || !selectedNodeId}
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              {loading ? t("running") : t("runEval")}
            </Button>
            <Button
              variant="outline"
              onClick={handleSaveBaseline}
              disabled={!result}
            >
              <Save className="size-4" />
              {t("saveBaseline")}
            </Button>
          </div>

          {baseline && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-2 text-xs text-green-700">
              {t("baselineSaved")} — {baseline.variant} ({baseline.runs} runs, {formatCost(baseline.result.cost)})
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          )}
        </section>

        {/* ── Results ── */}
        {!result ? (
          <EmptyState icon={FlaskConical} message={t("noResults")} />
        ) : (
          <>
            {/* Summary cards */}
            <section className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border bg-card p-4">
                <div className="text-sm text-muted-foreground">{t("cost")}</div>
                <div className="mt-1 text-2xl font-semibold">{formatCost(result.result.cost)}</div>
              </div>
              <div className="rounded-2xl border bg-card p-4">
                <div className="text-sm text-muted-foreground">{t("latency")}</div>
                <div className="mt-1 text-2xl font-semibold">{result.result.avgLatency}ms</div>
              </div>
              <div className="rounded-2xl border bg-card p-4">
                <div className="text-sm text-muted-foreground">{t("runs")}</div>
                <div className="mt-1 text-2xl font-semibold">{result.runs}</div>
                {result.model && (
                  <div className="mt-1 text-xs text-muted-foreground">{result.model}</div>
                )}
              </div>
            </section>

            {/* Numeric stats */}
            <section className="rounded-2xl border bg-card p-5">
              <h2 className="mb-3 text-sm font-semibold">{t("numericStats")}</h2>
              <NumericStatsTable stats={result.result.numericStats} t={t} />
            </section>

            {/* Boolean stats */}
            {result.result.booleanStats && Object.keys(result.result.booleanStats).length > 0 && (
              <section className="rounded-2xl border bg-card p-5">
                <h2 className="mb-3 text-sm font-semibold">{t("booleanStats")}</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-1.5 pr-3 font-medium">{t("field")}</th>
                        <th className="py-1.5 pr-3 font-medium">{t("trueCount")}</th>
                        <th className="py-1.5 pr-3 font-medium">{t("falseCount")}</th>
                        <th className="py-1.5 pr-3 font-medium">{t("trueRate")}</th>
                        <th className="py-1.5 font-medium">{t("nullCount")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(result.result.booleanStats).map(([key, s]) => (
                        <tr key={key} className="border-b last:border-0">
                          <td className="py-1.5 pr-3 font-mono font-medium">{key}</td>
                          <td className="py-1.5 pr-3">{s.trueCount}</td>
                          <td className="py-1.5 pr-3">{s.falseCount}</td>
                          <td className="py-1.5 pr-3">{(s.trueRate * 100).toFixed(1)}%</td>
                          <td className="py-1.5">{s.nullCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Per-run results */}
            <section className="rounded-2xl border bg-card p-5">
              <h2 className="mb-3 text-sm font-semibold">{t("perRun")}</h2>
              <div className="space-y-2">
                {result.result.perRun.map((run, i) => {
                  const output =
                    typeof run.output === "string"
                      ? run.output
                      : JSON.stringify(run.output, null, 2);
                  return (
                    <div key={i} className="rounded-lg border px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">{t("runIndex", { index: i + 1 })}</span>
                        <span className="text-muted-foreground">
                          {run.latency}ms · {formatCost(run.cost)}
                        </span>
                      </div>
                      <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/40 p-2">
                        {output.length > 500 ? output.slice(0, 500) + "…" : output}
                      </pre>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Comparison */}
            {comparison && (
              <section className="rounded-2xl border border-blue-500/30 bg-card p-5">
                <div className="mb-3 flex items-center gap-2">
                  <GitCompareArrows className="size-4 text-blue-500" />
                  <h2 className="text-sm font-semibold">{t("compareResults")}</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-1.5 pr-3 font-medium">{t("field")}</th>
                        <th className="py-1.5 pr-3 font-medium">{t("variantA")}</th>
                        <th className="py-1.5 pr-3 font-medium">{t("variantB")}</th>
                        <th className="py-1.5 pr-3 font-medium">{t("delta")}</th>
                        <th className="py-1.5 font-medium">{t("pctChange")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.diff.cost && (
                        <tr className="border-b">
                          <td className="py-1.5 pr-3 font-mono font-medium">{t("cost")}</td>
                          <td className="py-1.5 pr-3">{formatCost(comparison.diff.cost.a)}</td>
                          <td className="py-1.5 pr-3">{formatCost(comparison.diff.cost.b)}</td>
                          <td className="py-1.5 pr-3">{formatCost(comparison.diff.cost.delta)}</td>
                          <td className="py-1.5">{formatPct(comparison.diff.cost.pctChange)}</td>
                        </tr>
                      )}
                      {comparison.diff.avgLatency && (
                        <tr className="border-b">
                          <td className="py-1.5 pr-3 font-mono font-medium">{t("latency")}</td>
                          <td className="py-1.5 pr-3">{comparison.diff.avgLatency.a}ms</td>
                          <td className="py-1.5 pr-3">{comparison.diff.avgLatency.b}ms</td>
                          <td className="py-1.5 pr-3">{comparison.diff.avgLatency.delta}ms</td>
                          <td className="py-1.5">{formatPct(comparison.diff.avgLatency.pctChange)}</td>
                        </tr>
                      )}
                      {comparison.diff.numericStats &&
                        Object.entries(comparison.diff.numericStats).map(([key, s]) => (
                          <tr key={key} className="border-b last:border-0">
                            <td className="py-1.5 pr-3 font-mono font-medium">{key}</td>
                            <td className="py-1.5 pr-3">{s.a.median}</td>
                            <td className="py-1.5 pr-3">{s.b.median}</td>
                            <td className="py-1.5 pr-3">{s.medianDelta}</td>
                            <td className="py-1.5">—</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
