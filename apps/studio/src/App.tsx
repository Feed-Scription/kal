import '@xyflow/react/dist/style.css';
import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from 'react-i18next';
import { PanelGroup, Panel, type ImperativePanelHandle } from 'react-resizable-panels';
import { Info } from "lucide-react";
import { AppSidebar } from "./AppSidebar";
import { ExtensionSurface } from "./components/ExtensionSurface";
import { ResizeHandle } from "./components/ResizeHandle";
import { WorkbenchInspector } from "./components/WorkbenchInspector";
import { WorkbenchPanels } from "./components/WorkbenchPanels";
import { ProjectLoader } from "./components/ProjectLoader";
import { StatusBar } from "./components/StatusBar";
import { Button } from "./components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./components/ui/sheet";
import { useExtensionRuntimeMap, usePanelContributions, useWorkbench, useStudioResources } from "./kernel/hooks";

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
  const { activeViewId, views } = useWorkbench();
  const extensionRuntime = useExtensionRuntimeMap();
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

  if (!project) {
    return <ProjectLoader />;
  }

  return (
    <>
      <AppSidebar onToggleInspector={toggleInspector} inspectorVisible={inspectorVisible}>
        <PanelGroup direction="horizontal" autoSaveId="studio-workbench-h">
          {/* Main editor column */}
          <Panel defaultSize={75} minSize={40}>
            <PanelGroup direction="vertical" autoSaveId="studio-workbench-v">
              {/* Editor area */}
              <Panel defaultSize={hasPanels ? 70 : 100} minSize={30}>
                <div className="flex h-full flex-col">
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

              {hasPanels ? (
                <>
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
                </>
              ) : null}
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

      <StatusBar />
    </>
  );
}
