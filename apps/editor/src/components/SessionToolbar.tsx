import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Save, Download, Trash2, Plus, Play } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type SessionToolbarProps = {
  hasSession: boolean;
  onSave?: () => void;
  onExport?: () => void;
  onDelete?: () => void;
  onCreate?: () => void;
  onRun?: () => void;
  canRun?: boolean;
};

export function SessionToolbar({
  hasSession,
  onSave,
  onExport,
  onDelete,
  onCreate,
  onRun,
  canRun = false,
}: SessionToolbarProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!hasSession) {
    return (
      <div className="absolute left-4 top-4 z-10 flex gap-2 rounded-lg border bg-background/95 p-2 shadow-lg backdrop-blur">
        <Button variant="ghost" size="sm" onClick={onCreate}>
          <Plus className="mr-1.5 size-4" />
          新建 Session
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="absolute left-4 top-4 z-10 flex gap-2 rounded-lg border bg-background/95 p-2 shadow-lg backdrop-blur">
        <div className="flex items-center gap-2 border-r pr-2">
          <span className="text-sm font-medium">Session</span>
        </div>

        <Button variant="ghost" size="sm" onClick={onSave} title="保存 Session (Ctrl+S)">
          <Save className="mr-1.5 size-4" />
          保存
        </Button>

        <Button variant="ghost" size="sm" onClick={onExport} title="导出 JSON">
          <Download className="mr-1.5 size-4" />
          导出
        </Button>

        <Button variant="ghost" size="sm" onClick={onRun} title="运行 Session" disabled={!canRun}>
          <Play className="mr-1.5 size-4" />
          运行
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirmOpen(true)}
          title="删除 Session"
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="mr-1.5 size-4" />
          删除
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除当前 Session 吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmOpen(false);
                onDelete?.();
              }}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
