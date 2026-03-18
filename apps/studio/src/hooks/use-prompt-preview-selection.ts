import { useEffect, useMemo, useState } from "react";
import { engineApi } from "@/api/engine-client";
import { useCanvasSelection } from "@/hooks/use-canvas-selection";
import { useWorkbench } from "@/kernel/hooks";
import type { PromptPreviewEntry } from "@/types/project";

function getSelectedPromptEntryId(
  nodeId: string | null,
  context: 'flow' | 'session' | null,
  activeFlowId: string | null,
): string | null {
  if (!nodeId || !context) return null;
  if (context === 'session') return `session:${nodeId}`;
  if (context === 'flow' && activeFlowId) return `flow:${activeFlowId}:${nodeId}`;
  return null;
}

export function usePromptPreviewSelection() {
  const { activeFlowId } = useWorkbench();
  const { selectedNodeId, selectionContext } = useCanvasSelection();
  const [entries, setEntries] = useState<PromptPreviewEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);

  const matchedId = useMemo(
    () => getSelectedPromptEntryId(selectedNodeId, selectionContext, activeFlowId),
    [selectedNodeId, selectionContext, activeFlowId],
  );

  useEffect(() => {
    let active = true;

    engineApi.listPromptPreviewEntries()
      .then((nextEntries) => {
        if (!active) {
          return;
        }
        setEntries(nextEntries);
        setRenderError(null);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setRenderError((error as Error).message);
      })
      .finally(() => {
        if (active) {
          setLoadingEntries(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const matchedEntry = useMemo(
    () => entries.find((entry) => entry.id === matchedId) ?? null,
    [entries, matchedId],
  );

  return {
    entries,
    loadingEntries,
    matchedEntry,
    matchedId,
    renderError,
    total: entries.length,
  };
}
