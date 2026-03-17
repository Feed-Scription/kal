import { useEffect, useState } from "react";
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { useStudioCommands } from "@/kernel/hooks";

export function ProjectLoader() {
  const { t } = useTranslation('workbench');
  const { t: tc } = useTranslation('common');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { connect } = useStudioCommands();

  const handleConnect = async () => {
    setLoading(true);
    setError("");

    try {
      await connect();
    } catch (err: any) {
      setError(err.message || tc("connectEngineFailed"));
      setLoading(false);
    }
  };

  useEffect(() => {
    void handleConnect();
  }, [connect]);

  if (loading && !error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background animate-in fade-in-0 duration-300 ease-[var(--ease-apple)]">
        <div className="flex flex-col items-center gap-3 animate-in fade-in-0 zoom-in-95 duration-500 ease-[var(--ease-apple)]">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("connectingKernel")}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background animate-in fade-in-0 duration-300 ease-[var(--ease-apple)]">
        <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6 shadow-lg animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-400 ease-[var(--ease-apple)]">
          <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
          <Button
            className="w-full"
            onClick={handleConnect}
            disabled={loading}
          >
            <RefreshCw className="mr-2 size-4" />
            {tc("retry")}
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
