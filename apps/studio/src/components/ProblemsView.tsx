import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CircleCheckBig, Info, RefreshCw } from "lucide-react";
import { useTranslation } from 'react-i18next';
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { useConnectionState, useDiagnostics, useSaveState, useStudioCommands } from "@/kernel/hooks";
import { formatDateTime } from '@/i18n/format';
import type { DiagnosticPayload } from "@/types/project";

type ProblemItem = {
  id: string;
  severity: "error" | "warning" | "info";
  title: string;
  detail: string;
  suggestions?: string[];
};

function severityOf(diagnostic: DiagnosticPayload): "error" | "warning" | "info" {
  if (diagnostic.code === "UNUSED_FLOW") {
    return "warning";
  }
  if (diagnostic.code === "LINT_FAILED") {
    return "error";
  }
  return diagnostic.phase === "cli" ? "warning" : "error";
}

export function ProblemsView() {
  const { t } = useTranslation('workbench');
  const { engineConnected, connectionError } = useConnectionState();
  const { diagnostics: report, updatedAt } = useDiagnostics();
  const saveState = useSaveState();
  const { refreshDiagnostics } = useStudioCommands();
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!engineConnected) {
      return;
    }

    setLoading(true);
    try {
      await refreshDiagnostics();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (engineConnected && !report) {
      void refresh();
    }
  }, [engineConnected, refreshDiagnostics, report]);

  const kernelProblems = useMemo(() => {
    const entries: ProblemItem[] = [];

    if (connectionError) {
      entries.push({
        id: "engine-connection",
        severity: "error",
        title: t("problems.engineConnectionFailed"),
        detail: connectionError,
      });
    }

    if (saveState.status === "error" && saveState.message) {
      entries.push({
        id: "save-error",
        severity: "error",
        title: t("problems.saveFailed"),
        detail: saveState.message,
      });
    }

    return entries;
  }, [connectionError, saveState.message, saveState.status]);

  const formatTimestamp = (timestamp: number) =>
    formatDateTime(timestamp);

  const allProblems: ProblemItem[] = [
    ...kernelProblems,
    ...(report?.diagnostics ?? []).map((diagnostic, index) => ({
      id: `${diagnostic.code}-${index}`,
      severity: severityOf(diagnostic),
      title: `${diagnostic.code}: ${diagnostic.message}`,
      detail: diagnostic.file
        ? `${diagnostic.file}${diagnostic.jsonPath ? ` (${diagnostic.jsonPath})` : ""}`
        : diagnostic.phase,
      suggestions: diagnostic.suggestions,
    })),
  ];

  return (
    <div className="h-full w-full overflow-auto bg-background p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{t('problems.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('problems.subtitle')}</p>
          </div>
          <div className="flex items-center gap-3">
            {updatedAt ? (
              <div className="rounded-full border px-3 py-1 text-sm text-muted-foreground">
                {t('problems.updatedAt', { time: formatTimestamp(updatedAt) })}
              </div>
            ) : null}
            {report ? (
              <div className="rounded-full border px-3 py-1 text-sm text-muted-foreground">
                {t('problems.panelSummary', { errors: report.summary.errors, warnings: report.summary.warnings })}
              </div>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading || !engineConnected}>
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              {t('problems.refresh')}
            </Button>
          </div>
        </div>

        {!engineConnected ? (
          <EmptyState message={t('problems.engineDisconnected')} />
        ) : null}

        <div className="space-y-3">
          {allProblems.length === 0 ? (
            <div className="flex items-start gap-3 rounded-2xl border border-green-600/20 bg-green-600/5 p-4 text-sm">
              <CircleCheckBig className="mt-0.5 size-4 text-green-600" />
              <p className="text-muted-foreground">
                {t('problems.noProblemsDetail')}
              </p>
            </div>
          ) : (
            allProblems.map((problem) => (
              <div key={problem.id} className="rounded-2xl border bg-card p-4">
                <div className="flex items-start gap-3">
                  {problem.severity === "error" ? (
                    <AlertTriangle className="mt-0.5 size-4 text-red-600" />
                  ) : problem.severity === "warning" ? (
                    <AlertTriangle className="mt-0.5 size-4 text-yellow-600" />
                  ) : (
                    <Info className="mt-0.5 size-4 text-blue-600" />
                  )}
                  <div className="space-y-2">
                    <div className="font-medium">{problem.title}</div>
                    <div className="text-sm text-muted-foreground">{problem.detail}</div>
                    {problem.suggestions && problem.suggestions.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {problem.suggestions.map((suggestion) => (
                          <span key={suggestion} className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                            {suggestion}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
