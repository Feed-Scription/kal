import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Play, AlertCircle, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRunDebug, useStudioCommands } from "@/kernel/hooks";
import type { FlowMeta, ExecutionResult } from "@/types/project";

type ExecutionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flowId: string;
  flowMeta?: FlowMeta;
};

type ExecutionState = "idle" | "running" | "success" | "error";

export function ExecutionDialog({ open, onOpenChange, flowId, flowMeta }: ExecutionDialogProps) {
  const { executeFlow } = useStudioCommands();
  const { flowExecutionTrace } = useRunDebug();
  const { t } = useTranslation('flow');
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [state, setState] = useState<ExecutionState>("idle");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const inputs = flowMeta?.inputs ?? [];

  // Initialize inputValues from defaultValues when dialog opens
  useEffect(() => {
    if (open && inputs.length > 0) {
      const defaults: Record<string, string> = {};
      for (const input of inputs) {
        if (input.defaultValue != null) {
          defaults[input.name] = String(input.defaultValue);
        }
      }
      setInputValues(defaults);
    }
  }, [open]);

  // Derive progress from streaming trace
  const trace = flowExecutionTrace?.flowId === flowId ? flowExecutionTrace : null;
  const nodeResults = trace?.nodeResults ?? {};
  const executionOrder = trace?.executionOrder ?? [];
  const completedCount = Object.values(nodeResults).filter(
    (r) => r.status === 'success' || r.status === 'error',
  ).length;
  const runningNode = Object.values(nodeResults).find((r) => r.status === 'running');

  const handleExecute = async () => {
    setState("running");
    setResult(null);
    setError("");

    try {
      const parsedInput: Record<string, unknown> = {};
      for (const input of inputs) {
        const raw = inputValues[input.name];
        if (raw !== undefined && raw !== '') {
          try {
            parsedInput[input.name] = JSON.parse(raw);
          } catch {
            parsedInput[input.name] = raw;
          }
        }
      }

      const executionResult = await executeFlow(flowId, parsedInput) as ExecutionResult;
      setResult(executionResult);
      setState(executionResult.error ? "error" : "success");
      if (executionResult.error) {
        setError(executionResult.error);
      }
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return;
      setState("error");
      setError((err as Error).message || t('executionFailed'));
    }
  };

  const handleClose = () => {
    setState("idle");
    setResult(null);
    setError("");
    setInputValues({});
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('runFlowTitle', { flowId })}</DialogTitle>
          <DialogDescription>
            {t('clickToRun')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {inputs.length > 0 && (
            <div className="space-y-3">
              {inputs.map((input) => (
                <div key={input.name} className="space-y-1.5">
                  <Label htmlFor={`input-${input.name}`}>
                    {input.name}
                    {input.type && (
                      <span className="ml-1.5 text-xs text-muted-foreground">({input.type})</span>
                    )}
                  </Label>
                  <Input
                    id={`input-${input.name}`}
                    value={inputValues[input.name] ?? ''}
                    onChange={(e) =>
                      setInputValues((prev) => ({ ...prev, [input.name]: e.target.value }))
                    }
                    placeholder={input.defaultValue != null ? String(input.defaultValue) : undefined}
                    disabled={state === "running"}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Streaming progress (Phase 1) */}
          {state === "running" && executionOrder.length > 0 && (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{t('nodeProgress', { progress: `${completedCount} / ${executionOrder.length}` })}</span>
                {runningNode && (
                  <span className="flex items-center gap-1">
                    <Loader2 className="size-3 animate-spin" />
                    {runningNode.nodeId}
                  </span>
                )}
              </div>
              <div className="flex gap-1">
                {executionOrder.map((nodeId) => {
                  const nr = nodeResults[nodeId];
                  let bg = 'bg-muted';
                  if (nr?.status === 'success') bg = 'bg-green-500';
                  else if (nr?.status === 'error') bg = 'bg-red-500';
                  else if (nr?.status === 'running') bg = 'bg-blue-500 animate-pulse';
                  return (
                    <div
                      key={nodeId}
                      className={`h-1.5 flex-1 rounded-full ${bg} transition-colors`}
                      title={`${nodeId}: ${nr?.status ?? t('executing')}`}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {state === "running" && executionOrder.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t('executing')}
            </div>
          )}

          {state === "success" && result && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle2 className="size-4" />
                {t('executionSuccess')}
                {result.duration != null && (
                  <span className="text-xs text-muted-foreground">({result.duration}ms)</span>
                )}
              </div>
              <pre className="max-h-[300px] overflow-auto rounded-lg bg-muted/60 p-3 text-xs">
                {JSON.stringify(result.outputs, null, 2)}
              </pre>
            </div>
          )}

          {state === "error" && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="size-4" />
              {error || t('executionFailed')}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {t('close')}
          </Button>
          <Button onClick={handleExecute} disabled={state === "running"}>
            {state === "running" ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Play className="mr-1.5 size-4" />
            )}
            {state === "running" ? t('executing') : t('run')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
