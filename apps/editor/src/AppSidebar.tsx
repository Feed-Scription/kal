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
import { LayoutDashboard, Database, Settings, Wifi, X, Plus, RefreshCw, Route } from "lucide-react";
import { useProjectStore } from "@/store/projectStore";
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

import type { ViewType } from "./App";

type AppSidebarProps = {
  children: React.ReactNode;
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
};

export function AppSidebar({ children, currentView, onViewChange }: AppSidebarProps) {
  const project = useProjectStore((state) => state.project);
  const currentFlow = useProjectStore((state) => state.currentFlow);
  const setCurrentFlow = useProjectStore((state) => state.setCurrentFlow);
  const disconnect = useProjectStore((state) => state.disconnect);
  const createFlow = useProjectStore((state) => state.createFlow);
  const reloadProject = useProjectStore((state) => state.reloadProject);
  const engineConnected = useProjectStore((state) => state.engineConnected);

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
                    <span className="truncate font-semibold">Kal Editor</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {project?.config.name || "AI游戏编辑器"}
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
                <SidebarGroupLabel>视图</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        tooltip="Flow 编辑"
                        isActive={currentView === "flow"}
                        onClick={() => onViewChange("flow")}
                      >
                        <LayoutDashboard className="size-4" />
                        <span>Flow 编辑</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        tooltip="State 管理"
                        isActive={currentView === "state"}
                        onClick={() => onViewChange("state")}
                      >
                        <Database className="size-4" />
                        <span>State 管理</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        tooltip="项目设置"
                        isActive={currentView === "config"}
                        onClick={() => onViewChange("config")}
                      >
                        <Settings className="size-4" />
                        <span>项目设置</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        tooltip="Session 编辑"
                        isActive={currentView === "session"}
                        onClick={() => onViewChange("session")}
                      >
                        <Route className="size-4" />
                        <span>Session</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              {(currentView === "flow" || currentView === "session") && (
                <SidebarGroup>
                  <div className="flex items-center justify-between px-2">
                    <SidebarGroupLabel>Flow 列表</SidebarGroupLabel>
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
                            onClick={() => {
                              setCurrentFlow(flowName);
                              onViewChange("flow");
                            }}
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
                <SidebarGroupLabel>项目</SidebarGroupLabel>
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
                  <span className={`font-medium ${project.session ? "text-green-500" : "text-muted-foreground"}`}>
                    {project.session ? "已配置" : "无"}
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
          <div className="flex-1" />
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
