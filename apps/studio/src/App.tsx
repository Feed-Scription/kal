import '@xyflow/react/dist/style.css';
import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from 'react-i18next';
import { PanelGroup, Panel, type ImperativePanelHandle } from 'react-resizable-panels';
import { Command, Info, Lock, PanelRight, Play, RefreshCw } from "lucide-react";
import { AppSidebar } from "./AppSidebar";
import { CommandPalette } from "./components/CommandPalette";
import { ExtensionSurface } from "./components/ExtensionSurface";
import { ResizeHandle } from "./components/ResizeHandle";
import { WorkbenchInspector } from "./components/WorkbenchInspector";
import { WorkbenchPanels } from "./components/WorkbenchPanels";
import { ProjectLoader } from "./components/ProjectLoader";
import { StatusBar } from "./components/StatusBar";
import { Button } from "./components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./components/ui/sheet";
import { useCapabilityGate, useExtensionRuntimeMap, usePanelContributions, useStudioCommands, useWorkbench, useStudioResources } from "./kernel/hooks";

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1280 : true,
  );
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1280px)');
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

export default function App() {
  const { t } = useTranslation('workbench');
  const { project } = useStudioResources();
  const { activeExtension, activeViewId, views } = useWorkbench();
  const extensionRuntime = useExtensionRuntimeMap();
  const capabilityGate = useCapabilityGate(activeExtension?.capabilities);
  const { createRun, refreshDiagnostics, setActiveView, setCommandPaletteOpen } = useStudioCommands();
  const activeView = views.find((view) => view.id === activeViewId) ?? views[0] ?? null;
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorVisible, setInspectorVisible] = useState(true);
  const panelContributions = usePanelContributions();
  const hasPanels = panelContributions.length > 0;
  const isDesktop = useIsDesktop();

  const inspectorPanelRef = useRef<ImperativePanelHandle>(null);
  const bottomPanelRef = useRef<ImperativePanelHandle>(null);

  // Auto-collapse/expand bottom panel when preset changes panel availability
  useEffect(() => {
    const panel = bottomPanelRef.current;
    if (!panel) return;
    if (!hasPanels && !panel.isCollapsed()) {
      panel.collapse();
    } else if (hasPanels && panel.isCollapsed()) {
      panel.expand();
    }
  }, [hasPanels]);

  // Auto-collapse inspector on small screens, restore on desktop
  useEffect(() => {
    const panel = inspectorPanelRef.current;
    if (!panel) return;
    if (!isDesktop && !panel.isCollapsed()) {
      panel.collapse();
    }
  }, [isDesktop]);

  const toggleInspector = useCallback(() => {
    const panel = inspectorPanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }, []);

  const toggleBottomPanel = useCallback(() => {
    const panel = bottomPanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }, []);

  // Cmd+I / Ctrl+I to toggle inspector, Cmd+J / Ctrl+J to toggle bottom panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === 'i') {
        e.preventDefault();
        toggleInspector();
      } else if (e.key === 'j') {
        e.preventDefault();
        toggleBottomPanel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleInspector, toggleBottomPanel]);

  if (!project) {
    return <ProjectLoader />;
  }

  return (
    <>
      <AppSidebar>
        <PanelGroup direction="horizontal" autoSaveId="studio-workbench-h">
          {/* Main editor column */}
          <Panel defaultSize={75} minSize={40}>
            <PanelGroup direction="vertical" autoSaveId="studio-workbench-v">
              {/* Editor area */}
              <Panel defaultSize={70} minSize={30}>
                <div className="flex h-full flex-col">
                  <div className="flex items-center justify-end gap-1 border-b bg-background/80 px-3 py-2 backdrop-blur">
                      <Button variant="ghost" size="icon-sm" onClick={() => setCommandPaletteOpen(true)} title={t('tooltips.commandPalette')} aria-label={t('tooltips.commandPalette')}>
                        <Command className="size-4" />
                      </Button>
                      <Button
                        variant={inspectorVisible ? "secondary" : "ghost"}
                        size="icon-sm"
                        onClick={toggleInspector}
                        title={`${t('inspector')} (⌘I)`}
                        aria-label={t('inspector')}
                      >
                        <PanelRight className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => void refreshDiagnostics()} title={t('tooltips.refreshDiagnostics')} aria-label={t('tooltips.refreshDiagnostics')}>
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
                        aria-label={t('tooltips.run')}
                      >
                        <Play className="size-4" />
                      </Button>
                      <div className="ml-1 flex items-center gap-1 rounded-lg border px-2 py-1 text-xs text-muted-foreground">
                        <Lock className={`size-3.5 ${capabilityGate.trusted ? "text-green-600" : "text-yellow-600"}`} />
                        {capabilityGate.trusted ? t("trusted") : t("restricted")}
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
                </div>
              </Panel>

              {/* Bottom panel resize handle */}
              <ResizeHandle direction="horizontal" />

              {/* Bottom panels (collapsible) */}
              <Panel
                ref={bottomPanelRef}
                defaultSize={30}
                minSize={10}
                collapsible
                collapsedSize={0}
              >
                <WorkbenchPanels />
              </Panel>
            </PanelGroup>
          </Panel>

          {/* Inspector resize handle */}
          <ResizeHandle direction="vertical" />

          {/* Inspector panel (collapsible) */}
          <Panel
            ref={inspectorPanelRef}
            defaultSize={25}
            minSize={15}
            collapsible
            collapsedSize={0}
            onCollapse={() => setInspectorVisible(false)}
            onExpand={() => setInspectorVisible(true)}
          >
            <WorkbenchInspector />
          </Panel>
        </PanelGroup>
      </AppSidebar>

      {/* xl 以下的 Inspector 触发按钮 */}
      <Button
        variant="outline"
        size="icon-sm"
        className="fixed right-4 bottom-12 z-40 shadow-md xl:hidden"
        onClick={() => setInspectorOpen(true)}
        title={t('inspector')}
        aria-label={t('inspector')}
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
