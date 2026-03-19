import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { EditorView, basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorState } from '@codemirror/state';
import { engineApi } from '@/api/engine-client';
import { useStudioCommands } from '@/kernel/hooks';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface NodeCodeEditorDialogProps {
  nodeType: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NodeCodeEditorDialog({ nodeType, open, onOpenChange }: NodeCodeEditorDialogProps) {
  const { t } = useTranslation('workbench');
  const { reloadProject } = useStudioCommands();
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [fileName, setFileName] = useState('');
  const [sourceCode, setSourceCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load source when dialog opens
  useEffect(() => {
    if (!open || !nodeType) return;
    setLoading(true);
    setError(null);
    setSourceCode(null);

    let cancelled = false;
    engineApi.getNodeSource(nodeType).then(({ source, fileName: fn }) => {
      if (cancelled) return;
      setFileName(fn);
      setSourceCode(source);
    }).catch((err) => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : String(err));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [open, nodeType]);

  // Create CodeMirror editor once source is loaded and container is mounted
  useEffect(() => {
    if (sourceCode === null || !editorRef.current) return;

    const state = EditorState.create({
      doc: sourceCode,
      extensions: [
        basicSetup,
        javascript({ typescript: true }),
        oneDark,
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-scroller': { overflow: 'auto' },
        }),
      ],
    });

    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [sourceCode]);

  const handleSave = useCallback(async () => {
    if (!viewRef.current) return;
    const source = viewRef.current.state.doc.toString();
    setSaving(true);
    setError(null);
    try {
      await engineApi.saveNodeSource(nodeType, source);
      await reloadProject();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [nodeType, reloadProject, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col">
        <DialogHeader>
          <DialogTitle>{t('editNodeCode', { nodeType })}</DialogTitle>
          <DialogDescription>{fileName}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
            {t('loadingSource')}
          </div>
        ) : (
          <div ref={editorRef} className="min-h-0 flex-1 overflow-hidden rounded-md border" style={{ height: '60vh' }} />
        )}

        {error && (
          <p className="text-sm text-destructive">{t('saveFailed', { message: error })}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('cancel', { ns: 'common' })}
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? t('savingResource', { resource: nodeType }) : t('saveAndReload')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
