import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Save, Download, Trash2, Plus, LayoutGrid } from "lucide-react";
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
  onAutoLayout?: () => void;
};

export function SessionToolbar({
  hasSession,
  onSave,
  onExport,
  onDelete,
  onCreate,
  onAutoLayout,
}: SessionToolbarProps) {
  const { t } = useTranslation('session');
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!hasSession) {
    return (
      <div className="absolute left-4 top-4 z-10 flex gap-2 rounded-lg border bg-background/95 p-2 shadow-lg backdrop-blur">
        <Button variant="ghost" size="sm" onClick={onCreate}>
          <Plus className="mr-1.5 size-4" />
          {t('newSession')}
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="absolute left-4 top-4 z-10 flex gap-2 rounded-lg border bg-background/95 p-2 shadow-lg backdrop-blur">
        <Button variant="ghost" size="sm" onClick={onSave} title={t('saveSession')}>
          <Save className="mr-1.5 size-4" />
          {t('save')}
        </Button>

        <Button variant="ghost" size="sm" onClick={onExport} title={t('exportJson')}>
          <Download className="mr-1.5 size-4" />
          {t('export')}
        </Button>

        <Button variant="ghost" size="sm" onClick={onAutoLayout} title={t('autoLayout')}>
          <LayoutGrid className="mr-1.5 size-4" />
          {t('layout')}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirmOpen(true)}
          title={t('deleteSession')}
          className="border-l pl-4 text-destructive hover:text-destructive"
        >
          <Trash2 className="mr-1.5 size-4" />
          {t('delete')}
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('confirmDelete')}</DialogTitle>
            <DialogDescription>
              {t('confirmDeleteDesc')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmOpen(false);
                onDelete?.();
              }}
            >
              {t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
