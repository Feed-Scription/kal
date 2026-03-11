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
import { useProjectStore } from "@/store/projectStore";
import type { FlowMeta } from "@/types/project";

type ExecutionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flowId: string;
  flowMeta?: FlowMeta;
};

type ExecutionState = "idle" | "running" | "success" | "error";

export function ExecutionDialog({ open, onOpenChange, flowId, flowMeta }: ExecutionDialogProps) {
  const executeFlow = useProjectStore((state) => state.executeFlow);
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

  const handleExecute = async () => {
    setState("running");
    setError("");
    setResult(null);

    try {
      const parsedInput: Record<string, any> = {};
      for (const [key, value] of Object.entries(inputValues)) {
        try {
          parsedInput[key] = JSON.parse(value);
        } catch {
          parsedInput[key] = value;
        }
      }

      const res = await executeFlow(flowId, parsedInput);
      setResult(res);
      setState("success");
    } catch (err: any) {
      setError(err.message || "执行失败");
      setState("error");
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setState("idle");
      setResult(null);
      setError("");
      setInputValues({});
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>运行 Flow: {flowId}</DialogTitle>
          <DialogDescription>
            {inputs.length > 0 ? "填写输入参数后执行" : "点击运行执行此 Flow"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {inputs.length > 0 && state !== "success" && (
            <div className="space-y-3">
              {inputs.map((input) => (
                <div key={input.name} className="space-y-1">
                  <Label>{input.name} <span className="text-xs text-muted-foreground">({input.type})</span></Label>
                  <Input
                    value={inputValues[input.name] ?? (input.defaultValue != null ? String(input.defaultValue) : "")}
                    onChange={(e) => setInputValues({ ...inputValues, [input.name]: e.target.value })}
                    placeholder={`${input.type}${input.required ? " (必填)" : ""}`}
                    disabled={state === "running"}
                  />
                </div>
              ))}
            </div>
          )}

          {state === "running" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              执行中...
            </div>
          )}

          {state === "success" && result && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle2 className="size-4" />
                执行成功
              </div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg border bg-muted p-3 text-xs">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}

          {state === "error" && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            {state === "success" || state === "error" ? "关闭" : "取消"}
          </Button>
          {(state === "idle" || state === "error") && (
            <Button onClick={handleExecute}>
              <Play className="mr-1.5 size-4" />
              运行
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
