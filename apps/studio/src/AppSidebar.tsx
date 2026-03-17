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
import { Command, LayoutDashboard, Lock, Plus, RefreshCw, Wifi, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
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
import { useCapabilityGate, useConnectionState, useExtensionRuntimeMap, useFlowResource, useWorkbench, useStudioCommands, useStudioResources } from "./kernel/hooks";
import type { StudioRegisteredExtensionDescriptor, StudioWorkspacePreset } from "./kernel/types";

type AppSidebarProps = {
  children: React.ReactNode;
};

export function AppSidebar({ children }: AppSidebarProps) {
  const { project, session } = useStudioResources();
  const { flowId: currentFlow } = useFlowResource();
  const { engineConnected } = useConnectionState();
  const { activeExtension, activePreset, activeViewId, coreExtensions, workflowExtensions } = useWorkbench();
  const extensionRuntime = useExtensionRuntimeMap();
  const { setActiveView, setActivePreset, setCommandPaletteOpen, openFlow, disconnect, createFlow, reloadProject } = useStudioCommands();
  const capabilityGate = useCapabilityGate(activeExtension?.capabilities);

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
      setError("名称不能为空");
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      setError("名称只能包含字母、数字、下划线和连字符");
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
      alert("重载失败: " + e.message);
    } finally {
      setReloading(false);
    }
  };

  const renderExtensionGroup = (label: string, extensions: StudioRegisteredExtensionDescriptor[]) => {
    if (extensions.length === 0) {
      return null;
    }

    return (
      <SidebarGroup>
        <SidebarGroupLabel>{label}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {extensions.flatMap((extension) =>
              (extension.contributes.views ?? []).map((view) => {
                const Icon = view.icon;
                const runtime = extensionRuntime[extension.id];
                const showStatus = activePreset === 'debug';

                return (
                  <SidebarMenuItem key={view.id}>
                    <SidebarMenuButton
                      tooltip={`${extension.title} · ${view.description}`}
                      isActive={activeViewId === view.id}
                      onClick={() => setActiveView(view.id)}
                    >
                      <Icon className="size-4" />
                      <span>{view.title}</span>
                      {showStatus && runtime ? (
                        <span className={`ml-auto text-[10px] uppercase ${
                          runtime.status === 'active' ? 'text-green-600' : 'text-muted-foreground'
                        }`}>
                          {runtime.status}
                        </span>
                      ) : null}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              }),
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };

  const workspacePresets: Array<{ id: StudioWorkspacePreset; label: string }> = [
    { id: "authoring", label: "创作" },
    { id: "debug", label: "调试" },
    { id: "review", label: "审查" },
    { id: "history", label: "历史" },
    { id: "package", label: "分发" },
  ];

  return (
    <SidebarProvider>
      <Sidebar>
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
                      {project?.config.name || "AI-native 工作台"}
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
                <SidebarGroupLabel>工作区预设</SidebarGroupLabel>
                <SidebarGroupContent className="px-2">
                  <div className="flex flex-wrap gap-2">
                    {workspacePresets.map((preset) => (
                      <Button
                        key={preset.id}
                        variant={activePreset === preset.id ? "secondary" : "outline"}
                        size="xs"
                        onClick={() => setActivePreset(preset.id)}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                </SidebarGroupContent>
              </SidebarGroup>

              {renderExtensionGroup("官方核心扩展", coreExtensions)}
              {renderExtensionGroup("官方工作流扩展", workflowExtensions)}

              {(activeViewId === "kal.flow" || activeViewId === "kal.session") && (
                <SidebarGroup>
                  <div className="flex items-center justify-between px-2">
                    <SidebarGroupLabel>Flow 资源</SidebarGroupLabel>
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

              <SidebarGroup>
                <SidebarGroupLabel>项目命令</SidebarGroupLabel>
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
                        {reloading ? "重载中..." : "重载项目"}
                      </Button>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        onClick={disconnect}
                      >
                        <X className="mr-2 size-4" />
                        断开连接
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
                  <span>项目:</span>
                  <span className="font-medium text-foreground">{project.config.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>版本:</span>
                  <span className="font-medium text-foreground">{project.config.version}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Flow:</span>
                  <span className="font-medium text-foreground">{Object.keys(project.flows).length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Session:</span>
                  <span className={`font-medium ${session ? "text-green-500" : "text-muted-foreground"}`}>
                    {session ? "已配置" : "无"}
                  </span>
                </div>
              </div>
            )}
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <div>
            <p className="text-sm font-medium">Studio Kernel</p>
            <p className="text-xs text-muted-foreground">
              {activePreset === "authoring" && "Authoring Workspace"}
              {activePreset === "debug" && "Debug Workspace"}
              {activePreset === "review" && "Review Workspace"}
              {activePreset === "history" && "History Workspace"}
              {activePreset === "package" && "Package Workspace"}
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
            命令面板
            <span className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground">Ctrl K</span>
          </Button>
          {activeExtension ? (
            <div className="hidden items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground lg:flex">
              <Lock className={`size-3.5 ${capabilityGate.trusted ? "text-green-600" : "text-yellow-600"}`} />
              <span>{capabilityGate.trusted ? "Trusted" : "Restricted"}</span>
              <span>{activeExtension.id}</span>
            </div>
          ) : null}
          {project && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Wifi className={`size-4 ${engineConnected ? "text-green-500" : "text-red-500"}`} />
              <span>{project.name}</span>
            </div>
          )}
        </div>
        <div className="relative h-[calc(100vh-3.5rem-2rem)]">
          {children}
        </div>
      </SidebarInset>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建新 Flow</DialogTitle>
            <DialogDescription>输入新 Flow 的名称</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="flowName">Flow 名称</Label>
              <Input
                id="flowName"
                value={flowNameInput}
                onChange={(e) => setFlowNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmit();
                }}
                placeholder="例如: main, chat, game"
                autoFocus
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSubmit}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
