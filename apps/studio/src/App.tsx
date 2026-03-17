import '@xyflow/react/dist/style.css';
import { Command, Lock, Play, RefreshCw, X } from "lucide-react";
import { AppSidebar } from "./AppSidebar";
import { CommandPalette } from "./components/CommandPalette";
import { ExtensionSurface } from "./components/ExtensionSurface";
import { WorkbenchInspector } from "./components/WorkbenchInspector";
import { WorkbenchPanels } from "./components/WorkbenchPanels";
import { ProjectLoader } from "./components/ProjectLoader";
import { StatusBar } from "./components/StatusBar";
import { Button } from "./components/ui/button";
import { useCapabilityGate, useExtensionRuntimeMap, useStudioCommands, useWorkbench, useStudioResources } from "./kernel/hooks";

export default function App() {
  const { project } = useStudioResources();
  const { activeExtension, activeViewId, openViews, views } = useWorkbench();
  const extensionRuntime = useExtensionRuntimeMap();
  const capabilityGate = useCapabilityGate(activeExtension?.capabilities);
  const { closeView, createRun, refreshDiagnostics, setActiveView, setCommandPaletteOpen } = useStudioCommands();
  const activeView = views.find((view) => view.id === activeViewId) ?? views[0] ?? null;

  if (!project) {
    return <ProjectLoader />;
  }

  return (
    <>
      <AppSidebar>
        <div className="flex h-full min-h-0">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between gap-3 overflow-x-auto border-b bg-background/80 px-3 py-2 backdrop-blur">
              <div className="flex items-center gap-2 overflow-x-auto">
                {openViews.map((view) => {
                  const Icon = view.icon;
                  const active = view.id === activeViewId;

                  return (
                    <div
                      key={view.id}
                      className={`group flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                        active
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-transparent bg-muted/40 text-muted-foreground hover:border-border hover:text-foreground"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setActiveView(view.id)}
                        className="flex items-center gap-2 whitespace-nowrap"
                      >
                        <Icon className="size-4" />
                        {view.shortTitle}
                      </button>
                      {openViews.length > 1 ? (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="opacity-70 transition-opacity group-hover:opacity-100"
                          onClick={(event) => {
                            event.stopPropagation();
                            closeView(view.id);
                          }}
                        >
                          <X className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCommandPaletteOpen(true)}>
                  <Command className="size-4" />
                  Palette
                </Button>
                <Button variant="outline" size="sm" onClick={() => void refreshDiagnostics()}>
                  <RefreshCw className="size-4" />
                  Diagnostics
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await createRun(false);
                    setActiveView("kal.debugger");
                  }}
                >
                  <Play className="size-4" />
                  Run
                </Button>
                <div className="flex items-center gap-1 rounded-lg border px-2 py-1 text-xs text-muted-foreground">
                  <Lock className={`size-3.5 ${capabilityGate.trusted ? "text-green-600" : "text-yellow-600"}`} />
                  {capabilityGate.trusted ? "Trusted" : "Restricted"}
                </div>
              </div>
            </div>

            <div className="relative min-h-0 flex-1">
              {activeView ? (
                <div className="absolute inset-0">
                  <ExtensionSurface
                    contribution={activeView}
                    runtime={extensionRuntime[activeView.extensionId] ?? null}
                    chrome="fill"
                  />
                </div>
              ) : null}
            </div>
            <WorkbenchPanels />
          </div>
          <WorkbenchInspector />
        </div>
      </AppSidebar>
      <CommandPalette />
      <StatusBar />
    </>
  );
}
