import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Command, LayoutDashboard, PanelRight, Play, Plus, PlayCircle, Route, Zap, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFlowResource, useWorkbench, useStudioCommands, useStudioResources, useRunDebug } from "./kernel/hooks";
import { getStudioView } from "./kernel/registry";

type AppSidebarProps = {
  children: React.ReactNode;
  onToggleInspector?: () => void;
  inspectorVisible?: boolean;
};

const TOOL_VIEW_IDS = ['kal.play', 'kal.config', 'kal.prompt-preview', 'kal.version-control'];

export function AppSidebar({ children, onToggleInspector, inspectorVisible }: AppSidebarProps) {
  const { t } = useTranslation('workbench');
  const { t: tc } = useTranslation('common');
  const { t: tr } = useTranslation('registry');
  const { project, session } = useStudioResources();
  const { flowId: currentFlow } = useFlowResource();
  const { activeViewId } = useWorkbench();
  const { runs, selectedRunId } = useRunDebug();
  const {
    setActiveView, setCommandPaletteOpen,
    openFlow, createFlow, selectRun,
    createRun, createSmokeRun, createCheckpoint,
  } = useStudioCommands();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [flowNameInput, setFlowNameInput] = useState("");
  const [error, setError] = useState("");

  const openCreateDialog = () => {
    setFlowNameInput("");
    setError("");
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    const name = flowNameInput.trim();
    if (!name) {
      setError(tc("nameEmpty"));
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      setError(tc("nameInvalidChars"));
      return;
    }
    try {
      await createFlow(name);
      setDialogOpen(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleNewRun = async () => {
    await createRun(true);
    setActiveView('kal.play');
  };

  const handleSmokeRun = async () => {
    await createSmokeRun();
  };

  const handleCreateCheckpoint = () => {
    createCheckpoint();
    setActiveView('kal.version-control');
  };

  const toolViews = useMemo(() => {
    return TOOL_VIEW_IDS
      .map((id) => {
        try { return getStudioView(id); } catch { return null; }
      })
      .filter((v): v is NonNullable<typeof v> => v !== null && v.id !== 'kal.flow');
  }, []);

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="pb-8">
        <SidebarHeader className="border-b border-sidebar-border">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <a href="/">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                    <LayoutDashboard className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">KAL Studio</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {project?.config.name || t("aiWorkbench")}
                    </span>
                  </div>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          {project && (
            <>
              {/* Resources section */}
              <SidebarGroup>
                <SidebarGroupLabel>{t("resources")}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {/* Flow list */}
                    <SidebarMenuItem>
                      <div className="flex items-center justify-between px-2 py-1">
                        <span className="text-xs font-medium text-muted-foreground">{t("flowResources")}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={openCreateDialog}
                        >
                          <Plus className="size-3" />
                        </Button>
                      </div>
                    </SidebarMenuItem>
                    {Object.keys(project.flows).map((flowName) => (
                      <SidebarMenuItem key={flowName}>
                        <SidebarMenuButton
                          tooltip={flowName}
                          isActive={currentFlow === flowName}
                          onClick={() => openFlow(flowName)}
                        >
                          <LayoutDashboard className="size-4" />
                          <span className="flex-1 truncate">{flowName}</span>
                          <span className="text-xs text-muted-foreground">
                            {project.flows[flowName]?.data.nodes.length || 0}
                          </span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}

                    {/* Session entry */}
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        tooltip={t("sessionEntry")}
                        isActive={activeViewId === 'kal.session'}
                        onClick={() => setActiveView('kal.session')}
                      >
                        <Route className="size-4" />
                        <span className="flex-1">{t("sessionEntry")}</span>
                        <span className={`text-xs ${session ? "text-green-500" : "text-muted-foreground"}`}>
                          {session ? tc("configured") : tc("none")}
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>

                    {/* Run list */}
                    <SidebarMenuItem>
                      <div className="flex items-center px-2 py-1">
                        <span className="text-xs font-medium text-muted-foreground">{t("runs")}</span>
                      </div>
                    </SidebarMenuItem>
                    {runs.length === 0 ? (
                      <SidebarMenuItem>
                        <span className="px-2 text-xs text-muted-foreground">{t("noRuns")}</span>
                      </SidebarMenuItem>
                    ) : (
                      runs.map((record) => (
                        <SidebarMenuItem key={record.runId}>
                          <SidebarMenuButton
                            tooltip={`Run ${record.runId.slice(0, 8)}`}
                            isActive={selectedRunId === record.runId}
                            onClick={() => selectRun(record.runId)}
                          >
                            <PlayCircle className="size-4" />
                            <span className="flex-1 truncate">
                              {record.runId.slice(0, 8)}
                            </span>
                            <span className={`text-[10px] uppercase ${
                              record.run.status === 'ended' ? 'text-green-600' :
                              record.run.status === 'waiting_input' || record.run.status === 'paused' ? 'text-blue-600' :
                              record.run.status === 'error' ? 'text-red-600' :
                              'text-muted-foreground'
                            }`}>
                              {record.run.status}
                            </span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              {/* Tools section */}
              {toolViews.length > 0 && (
                <SidebarGroup>
                  <SidebarGroupLabel>{t("tools")}</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {toolViews.map((view) => {
                        const Icon = view.icon;
                        return (
                          <SidebarMenuItem key={view.id}>
                            <SidebarMenuButton
                              tooltip={tr(view.description)}
                              isActive={activeViewId === view.id}
                              onClick={() => setActiveView(view.id)}
                            >
                              <Icon className="size-4" />
                              <span>{tr(view.shortTitle)}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              )}

              {/* Quick actions section */}
              <SidebarGroup>
                <SidebarGroupLabel>{t("quickActions")}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleNewRun}>
                        <Zap className="mr-2 size-4" />
                        {t("newRun")}
                      </Button>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleSmokeRun}>
                        <PlayCircle className="mr-2 size-4" />
                        {t("smokeRun")}
                      </Button>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleCreateCheckpoint}>
                        <Bookmark className="mr-2 size-4" />
                        {t("createCheckpoint")}
                      </Button>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </>
          )}
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border">
          <div className="p-3 text-xs">
            {project && (
              <div className="space-y-1 text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>{t("projectLabel")}</span>
                  <span className="font-medium text-foreground">{project.config.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{t("versionLabel")}</span>
                  <span className="font-medium text-foreground">{project.config.version}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{t("flowLabel")}</span>
                  <span className="font-medium text-foreground">{Object.keys(project.flows).length}</span>
                </div>
              </div>
            )}
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-w-0 overflow-hidden">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <div>
            <p className="text-sm font-medium">{t("studioKernel")}</p>
          </div>
          <div className="flex-1" />
          <Button
            variant={inspectorVisible ? "secondary" : "ghost"}
            size="icon-sm"
            onClick={onToggleInspector}
            title={`${t('inspector')} (⌘I)`}
            aria-label={t('inspector')}
          >
            <PanelRight className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={async () => {
              await createRun(false);
              setActiveView('kal.play');
            }}
            title={t('tooltips.run')}
            aria-label={t('tooltips.run')}
          >
            <Play className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="hidden gap-2 md:inline-flex"
            onClick={() => setCommandPaletteOpen(true)}
          >
            <Command className="size-4" />
            {t("commandPalette")}
            <span className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground">Ctrl K</span>
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden pb-[33px]">
          {children}
        </div>
      </SidebarInset>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("createNewFlow")}</DialogTitle>
            <DialogDescription>{t("enterFlowName")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="flowName">{t("flowName")}</Label>
              <Input
                id="flowName"
                value={flowNameInput}
                onChange={(e) => setFlowNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmit();
                }}
                placeholder={t("flowNamePlaceholder")}
                autoFocus
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={handleSubmit}>{tc("create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
