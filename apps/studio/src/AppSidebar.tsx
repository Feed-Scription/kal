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
import { Command, LayoutDashboard, Plus, RefreshCw, PlayCircle, Route, ClipboardCheck, Package, Zap, Bookmark } from "lucide-react";
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
import { useFlowResource, useWorkbench, useStudioCommands, useStudioResources, useRunDebug, useReviewWorkspace, usePackages } from "./kernel/hooks";
import { getStudioView } from "./kernel/registry";
import type { StudioWorkspacePreset } from "./kernel/types";

type AppSidebarProps = {
  children: React.ReactNode;
};

// ── Per-preset sidebar configuration ──

type PresetResourcesConfig = {
  showFlows: boolean;
  showSession: boolean;
  showRuns: boolean;
  showProposals: boolean;
  showPackages: boolean;
};

type PresetSidebarConfig = {
  resources: PresetResourcesConfig;
  toolViewIds: string[];
  actions: string[];
};

const PRESET_SIDEBAR_CONFIG: Record<StudioWorkspacePreset, PresetSidebarConfig> = {
  authoring: {
    resources: { showFlows: true, showSession: true, showRuns: false, showProposals: false, showPackages: false },
    toolViewIds: ['kal.config', 'kal.problems', 'kal.prompt-preview'],
    actions: ['reload'],
  },
  debug: {
    resources: { showFlows: true, showSession: false, showRuns: true, showProposals: false, showPackages: false },
    toolViewIds: ['kal.debugger', 'kal.h5-preview', 'kal.prompt-eval', 'kal.prompt-preview', 'kal.problems'],
    actions: ['newRun', 'smokeRun', 'reload'],
  },
  review: {
    resources: { showFlows: false, showSession: false, showRuns: true, showProposals: true, showPackages: false },
    toolViewIds: ['kal.review', 'kal.comments', 'kal.version-control', 'kal.problems'],
    actions: ['createProposal', 'createCheckpoint', 'reload'],
  },
  package: {
    resources: { showFlows: false, showSession: false, showRuns: false, showProposals: false, showPackages: true },
    toolViewIds: ['kal.template-browser', 'kal.vercel-deploy'],
    actions: ['reload'],
  },
};

const WORKSPACE_PRESETS: StudioWorkspacePreset[] = ['authoring', 'debug', 'review', 'package'];

export function AppSidebar({ children }: AppSidebarProps) {
  const { t } = useTranslation('workbench');
  const { t: tc } = useTranslation('common');
  const { t: tr } = useTranslation('registry');
  const { project, session } = useStudioResources();
  const { flowId: currentFlow } = useFlowResource();
  const { activePreset, activeViewId } = useWorkbench();
  const { runs, selectedRunId } = useRunDebug();
  const { proposals } = useReviewWorkspace();
  const { installed: installedPackages } = usePackages();
  const {
    setActiveView, setActivePreset, setCommandPaletteOpen,
    openFlow, createFlow, reloadProject, selectRun,
    createRun, createSmokeRun, createReviewProposal,
    setActiveProposal, createCheckpoint,
  } = useStudioCommands();

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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleReload = async () => {
    setReloading(true);
    try {
      await reloadProject();
    } catch (e: unknown) {
      alert(tc("reloadFailed", { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setReloading(false);
    }
  };

  const handleNewRun = async () => {
    await createRun(true);
    setActivePreset('debug');
    setActiveView('kal.debugger');
  };

  const handleSmokeRun = async () => {
    await createSmokeRun();
    setActivePreset('debug');
    setActiveView('kal.debugger');
  };

  const handleCreateProposal = () => {
    const proposalId = createReviewProposal();
    if (proposalId) {
      setActiveProposal(proposalId);
      setActivePreset('review');
      setActiveView('kal.review');
    }
  };

  const handleCreateCheckpoint = () => {
    createCheckpoint();
    setActiveView('kal.version-control');
  };

  const config = PRESET_SIDEBAR_CONFIG[activePreset];

  const toolViews = useMemo(() => {
    return config.toolViewIds
      .map((id) => {
        try { return getStudioView(id); } catch { return null; }
      })
      .filter((v): v is NonNullable<typeof v> => v !== null && v.id !== 'kal.flow');
  }, [config.toolViewIds]);

  const workspacePresets = WORKSPACE_PRESETS.map((id) => ({
    id,
    label: t(`preset.${id}`),
    desc: t(`preset.${id}Desc`),
  }));

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
              {/* Preset switcher */}
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

              {/* Resources section */}
              <SidebarGroup>
                <SidebarGroupLabel>{t("resources")}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {/* Flow list */}
                    {config.resources.showFlows && (
                      <>
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
                      </>
                    )}

                    {/* Session entry */}
                    {config.resources.showSession && (
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
                    )}

                    {/* Run list */}
                    {config.resources.showRuns && (
                      <>
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
                      </>
                    )}

                    {/* Proposal list */}
                    {config.resources.showProposals && (
                      <>
                        <SidebarMenuItem>
                          <div className="flex items-center justify-between px-2 py-1">
                            <span className="text-xs font-medium text-muted-foreground">{t("proposals")}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={handleCreateProposal}
                            >
                              <Plus className="size-3" />
                            </Button>
                          </div>
                        </SidebarMenuItem>
                        {proposals.length === 0 ? (
                          <SidebarMenuItem>
                            <span className="px-2 text-xs text-muted-foreground">{t("noProposals")}</span>
                          </SidebarMenuItem>
                        ) : (
                          proposals.map((proposal) => (
                            <SidebarMenuItem key={proposal.id}>
                              <SidebarMenuButton
                                tooltip={proposal.title}
                                isActive={false}
                                onClick={() => {
                                  setActiveProposal(proposal.id);
                                  setActiveView('kal.review');
                                }}
                              >
                                <ClipboardCheck className="size-4" />
                                <span className="flex-1 truncate">{proposal.title}</span>
                                <span className="text-[10px] uppercase text-muted-foreground">
                                  {proposal.status}
                                </span>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          ))
                        )}
                      </>
                    )}

                    {/* Installed packages list */}
                    {config.resources.showPackages && (
                      <>
                        <SidebarMenuItem>
                          <div className="flex items-center px-2 py-1">
                            <span className="text-xs font-medium text-muted-foreground">{t("installedPackages")}</span>
                          </div>
                        </SidebarMenuItem>
                        {installedPackages.length === 0 ? (
                          <SidebarMenuItem>
                            <span className="px-2 text-xs text-muted-foreground">{t("noPackages")}</span>
                          </SidebarMenuItem>
                        ) : (
                          installedPackages.map((pkg) => (
                            <SidebarMenuItem key={pkg.manifest.id}>
                              <SidebarMenuButton
                                tooltip={pkg.manifest.name}
                                onClick={() => setActiveView('kal.package-manager')}
                              >
                                <Package className="size-4" />
                                <span className="flex-1 truncate">{pkg.manifest.name}</span>
                                <span className={`text-[10px] ${pkg.enabled ? "text-green-500" : "text-muted-foreground"}`}>
                                  {pkg.manifest.kind}
                                </span>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          ))
                        )}
                      </>
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
                    {config.actions.includes('newRun') && (
                      <SidebarMenuItem>
                        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleNewRun}>
                          <Zap className="mr-2 size-4" />
                          {t("newRun")}
                        </Button>
                      </SidebarMenuItem>
                    )}
                    {config.actions.includes('smokeRun') && (
                      <SidebarMenuItem>
                        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleSmokeRun}>
                          <PlayCircle className="mr-2 size-4" />
                          {t("smokeRun")}
                        </Button>
                      </SidebarMenuItem>
                    )}
                    {config.actions.includes('createProposal') && (
                      <SidebarMenuItem>
                        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleCreateProposal}>
                          <ClipboardCheck className="mr-2 size-4" />
                          {t("createProposal")}
                        </Button>
                      </SidebarMenuItem>
                    )}
                    {config.actions.includes('createCheckpoint') && (
                      <SidebarMenuItem>
                        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleCreateCheckpoint}>
                          <Bookmark className="mr-2 size-4" />
                          {t("createCheckpoint")}
                        </Button>
                      </SidebarMenuItem>
                    )}
                    {config.actions.includes('reload') && (
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
                    )}
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
