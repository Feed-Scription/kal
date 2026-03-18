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
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Command, LayoutDashboard, Plus, RefreshCw, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
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
import type { StudioWorkspacePreset } from "./kernel/types";

type AppSidebarProps = {
  children: React.ReactNode;
};

const PRESETS_WITH_FLOWS: StudioWorkspacePreset[] = ['authoring', 'debug', 'review'];
const PRESETS_WITH_RUNS: StudioWorkspacePreset[] = ['debug', 'review', 'history'];
const PRESETS_WITH_VIEWS: StudioWorkspacePreset[] = ['authoring', 'debug', 'review', 'history'];

export function AppSidebar({ children }: AppSidebarProps) {
  const { t } = useTranslation('workbench');
  const { t: tc } = useTranslation('common');
  const { t: tr } = useTranslation('registry');
  const { project, session } = useStudioResources();
  const { flowId: currentFlow } = useFlowResource();
  const { activePreset, activeViewId, views } = useWorkbench();
  const { runs, selectedRunId } = useRunDebug();
  const { setActiveView, setActivePreset, setCommandPaletteOpen, openFlow, createFlow, reloadProject, selectRun } = useStudioCommands();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [flowNameInput, setFlowNameInput] = useState("");
  const [error, setError] = useState("");
  const [reloading, setReloading] = useState(false);

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
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleReload = async () => {
    setReloading(true);
    try {
      await reloadProject();
    } catch (e: any) {
      alert(tc("reloadFailed", { message: e.message }));
    } finally {
      setReloading(false);
    }
  };

  const showFlows = PRESETS_WITH_FLOWS.includes(activePreset);
  const showRuns = PRESETS_WITH_RUNS.includes(activePreset);
  const showViews = PRESETS_WITH_VIEWS.includes(activePreset);
  const showPackage = activePreset === 'package';

  const presetViews = views.filter(
    (view) => !view.presets || view.presets.includes(activePreset),
  );

  const workspacePresets: Array<{ id: StudioWorkspacePreset; label: string; desc: string }> = [
    { id: "authoring", label: t("preset.authoring"), desc: t("preset.authoringDesc") },
    { id: "debug", label: t("preset.debug"), desc: t("preset.debugDesc") },
    { id: "review", label: t("preset.review"), desc: t("preset.reviewDesc") },
    { id: "history", label: t("preset.history"), desc: t("preset.historyDesc") },
    { id: "package", label: t("preset.package"), desc: t("preset.packageDesc") },
  ];

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
              <SidebarGroup>
                <SidebarGroupLabel>{t("workspacePresets")}</SidebarGroupLabel>
                <SidebarGroupContent className="px-2">
                  <div className="flex flex-wrap gap-2">
                    {workspacePresets.map((preset) => (
                      <Button
                        key={preset.id}
                        variant={activePreset === preset.id ? "secondary" : "outline"}
                        size="xs"
                        title={preset.desc}
                        onClick={() => setActivePreset(preset.id)}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                </SidebarGroupContent>
              </SidebarGroup>

              {showFlows && (
                <SidebarGroup>
                  <div className="flex items-center justify-between px-2">
                    <SidebarGroupLabel>{t("flowResources")}</SidebarGroupLabel>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={openCreateDialog}
                    >
                      <Plus className="size-4" />
                    </Button>
                  </div>
                  <SidebarGroupContent>
                    <SidebarMenu>
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
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              )}

              {showRuns && (
                <SidebarGroup>
                  <SidebarGroupLabel>{t("runs")}</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
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
              )}

              {(showViews || showPackage) && presetViews.length > 0 && (
                <SidebarGroup>
                  <SidebarGroupLabel>{t("views")}</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {presetViews.map((view) => {
                        const Icon = view.icon;
                        return (
                          <SidebarMenuItem key={view.id}>
                            <SidebarMenuButton
                              tooltip={tr(view.description)}
                              isActive={activeViewId === view.id}
                              onClick={() => setActiveView(view.id)}
                            >
                              <Icon className="size-4" />
                              <span>{tr(view.title)}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              )}

              <SidebarGroup>
                <SidebarGroupLabel>{t("projectCommands")}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        onClick={handleReload}
                        disabled={reloading}
                      >
                        <RefreshCw className={`mr-2 size-4 ${reloading ? "animate-spin" : ""}`} />
                        {reloading ? t("reloading") : t("reloadProject")}
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
                <div className="flex items-center justify-between">
                  <span>{t("sessionLabel")}</span>
                  <span className={`font-medium ${session ? "text-green-500" : "text-muted-foreground"}`}>
                    {session ? tc("configured") : tc("none")}
                  </span>
                </div>
              </div>
            )}
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-w-0 overflow-hidden">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <div>
            <p className="text-sm font-medium">{t("studioKernel")}</p>
            <p className="text-xs text-muted-foreground">
              {activePreset && t("workspaceLabel", { preset: t(`preset.${activePreset}`) })}
            </p>
          </div>
          <div className="flex-1" />
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
        <div className="relative h-[calc(100vh-3.5rem-2rem)] overflow-hidden">
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
