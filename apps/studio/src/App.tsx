import '@xyflow/react/dist/style.css';
import { useState } from "react";
import { useTranslation } from 'react-i18next';
import { Command, Info, Lock, Play, RefreshCw, X } from "lucide-react";
import { AppSidebar } from "./AppSidebar";
import { CommandPalette } from "./components/CommandPalette";
import { ExtensionSurface } from "./components/ExtensionSurface";
import { WorkbenchInspector } from "./components/WorkbenchInspector";
import { WorkbenchPanels } from "./components/WorkbenchPanels";
import { ProjectLoader } from "./components/ProjectLoader";
import { StatusBar } from "./components/StatusBar";
import { Button } from "./components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./components/ui/sheet";
import { useCapabilityGate, useExtensionRuntimeMap, useStudioCommands, useWorkbench, useStudioResources } from "./kernel/hooks";

export default function App() {
  const { t } = useTranslation('workbench');
  const { project } = useStudioResources();
  const { activeExtension, activeViewId, openViews, views } = useWorkbench();
  const extensionRuntime = useExtensionRuntimeMap();
  const capabilityGate = useCapabilityGate(activeExtension?.capabilities);
  const { closeView, createRun, refreshDiagnostics, setActiveView, setCommandPaletteOpen } = useStudioCommands();
  const activeView = views.find((view) => view.id === activeViewId) ?? views[0] ?? null;
  const [inspectorOpen, setInspectorOpen] = useState(false);

  if (!project) {
    return <ProjectLoader />;
  }

  return (
    <>
      <AppSidebar>
        <div className="flex h-full min-h-0">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between gap-3 border-b bg-background/80 px-3 py-2 backdrop-blur">
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

              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="icon-sm" onClick={() => setCommandPaletteOpen(true)} title={t('tooltips.commandPalette')}>
                  <Command className="size-4" />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => void refreshDiagnostics()} title={t('tooltips.refreshDiagnostics')}>
                  <RefreshCw className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={async () => {
                    await createRun(false);
                    setActiveView("kal.debugger");
                  }}
                  title={t('tooltips.run')}
                >
                  <Play className="size-4" />
                </Button>
                <div className="ml-1 flex items-center gap-1 rounded-lg border px-2 py-1 text-xs text-muted-foreground">
                  <Lock className={`size-3.5 ${capabilityGate.trusted ? "text-green-600" : "text-yellow-600"}`} />
                  {capabilityGate.trusted ? t("trusted") : t("restricted")}
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

      {/* xl 以下的 Inspector 触发按钮 */}
      <Button
        variant="outline"
        size="icon-sm"
        className="fixed right-4 bottom-12 z-40 shadow-md xl:hidden"
        onClick={() => setInspectorOpen(true)}
        title="Inspector"
      >
        <Info className="size-4" />
      </Button>

      {/* xl 以下的 Inspector 抽屉 */}
      <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
        <SheetContent side="right" className="w-80 overflow-auto p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>{t('selectedNode')}</SheetTitle>
          </SheetHeader>
          <WorkbenchInspector mobile />
        </SheetContent>
      </Sheet>

      <CommandPalette />
      <StatusBar />
    </>
  );
}
