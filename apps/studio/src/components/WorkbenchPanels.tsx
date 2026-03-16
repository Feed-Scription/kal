import { usePanelContributions } from "@/kernel/hooks";
import { ExtensionSurface } from "./ExtensionSurface";

export function WorkbenchPanels() {
  const panels = usePanelContributions();

  if (panels.length === 0) {
    return null;
  }

  return (
    <div className="grid max-h-72 gap-3 overflow-auto border-t bg-background/70 p-3 lg:grid-cols-2">
      {panels.map(({ contribution, runtime }) => (
        <ExtensionSurface
          key={contribution.id}
          contribution={contribution}
          runtime={runtime}
        />
      ))}
    </div>
  );
}
