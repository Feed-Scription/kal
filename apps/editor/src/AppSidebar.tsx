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
import { LayoutDashboard, Database, Settings, FolderOpen, X, Plus, Edit2, Trash2 } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AppSidebarProps = {
  children: React.ReactNode;
  currentView: "flow" | "state" | "config";
  onViewChange: (view: "flow" | "state" | "config") => void;
};

export function AppSidebar({ children, currentView, onViewChange }: AppSidebarProps) {
  const project = useProjectStore((state) => state.project);
  const currentFlow = useProjectStore((state) => state.currentFlow);
  const setCurrentFlow = useProjectStore((state) => state.setCurrentFlow);
  const closeProject = useProjectStore((state) => state.closeProject);
  const createFlow = useProjectStore((state) => state.createFlow);
  const renameFlow = useProjectStore((state) => state.renameFlow);
  const deleteFlow = useProjectStore((state) => state.deleteFlow);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "rename">("create");
  const [flowNameInput, setFlowNameInput] = useState("");
  const [renamingFlow, setRenamingFlow] = useState<string | null>(null);
  const [error, setError] = useState("");

  const openCreateDialog = () => {
    setDialogMode("create");
    setFlowNameInput("");
    setError("");
    setDialogOpen(true);
  };

  const openRenameDialog = (flowName: string) => {
    setDialogMode("rename");
    setRenamingFlow(flowName);
    setFlowNameInput(flowName);
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
      if (dialogMode === "create") {
        await createFlow(name);
      } else if (renamingFlow) {
        await renameFlow(renamingFlow, name);
      }
      setDialogOpen(false);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDeleteFlow = async (flowName: string) => {
    if (!confirm(`确定要删除 Flow "${flowName}" 吗？`)) return;
    try {
      await deleteFlow(flowName);
    } catch (e: any) {
      alert(e.message);
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
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              {currentView === "flow" && (
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
                          <div className="flex items-center w-full group">
                            <SidebarMenuButton
                              tooltip={flowName}
                              isActive={currentFlow === flowName}
                              onClick={() => setCurrentFlow(flowName)}
                              className="flex-1"
                            >
                              <LayoutDashboard className="size-4" />
                              <span className="flex-1 truncate">{flowName}</span>
                              <span className="text-xs text-muted-foreground">
                                {project.flows[flowName]?.nodes.length || 0}
                              </span>
                            </SidebarMenuButton>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 opacity-0 group-hover:opacity-100"
                                >
                                  <Settings className="size-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openRenameDialog(flowName)}>
                                  <Edit2 className="mr-2 size-4" />
                                  重命名
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleDeleteFlow(flowName)}
                                  className="text-destructive"
                                >
                                  <Trash2 className="mr-2 size-4" />
                                  删除
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
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
                        onClick={closeProject}
                      >
                        <X className="mr-2 size-4" />
                        关闭项目
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
              <FolderOpen className="size-4" />
              <span>{project.path}</span>
            </div>
          )}
        </div>
        <div className="h-[calc(100vh-3.5rem-2rem)]">
          {children}
        </div>
      </SidebarInset>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "create" ? "创建新 Flow" : "重命名 Flow"}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === "create"
                ? "输入新 Flow 的名称"
                : `重命名 Flow "${renamingFlow}"`}
            </DialogDescription>
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
            <Button onClick={handleSubmit}>
              {dialogMode === "create" ? "创建" : "重命名"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
