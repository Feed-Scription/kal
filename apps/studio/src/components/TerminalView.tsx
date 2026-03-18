import { useState, useRef, useCallback, useEffect } from 'react';
import { Lock, Terminal, Plus, X, Square, TerminalSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useCapabilityGate, useStudioCommands } from '@/kernel/hooks';
import { engineApi } from '@/api/engine-client';

const ALLOWED_COMMANDS = ['lint', 'smoke', 'schema', 'debug-list', 'debug-state', 'config', 'eval'];

type TerminalMode = 'quick' | 'session';
const PROCESS_EXEC_PROMPT_STORAGE_KEY = 'kal.studio.prompts.processExec';

interface SessionState {
  id: string;
  alive: boolean;
  output: string;
  unsubscribe: (() => void) | null;
}

function isLocalDesktopMode() {
  if (typeof window === 'undefined') {
    return false;
  }

  const { protocol, hostname } = window.location;
  return (
    protocol === 'file:' ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]'
  );
}

function hasSeenProcessExecPrompt() {
  if (typeof window === 'undefined') {
    return true;
  }

  return window.localStorage.getItem(PROCESS_EXEC_PROMPT_STORAGE_KEY) === 'shown';
}

function markProcessExecPromptSeen() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(PROCESS_EXEC_PROMPT_STORAGE_KEY, 'shown');
}

function RestrictedState({
  canRequestAccess,
  onRequestAccess,
}: {
  canRequestAccess: boolean;
  onRequestAccess?: () => void;
}) {
  const { t } = useTranslation('terminal');

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-md rounded-xl border border-yellow-600/20 bg-yellow-500/5 p-4 text-sm shadow-sm">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <Lock className="size-4 text-yellow-600" />
          {t('executionUnavailable')}
        </div>
        <p className="mt-2 text-muted-foreground">
          {t('executionUnavailableDesc')}
        </p>
        {canRequestAccess ? (
          <div className="mt-4 flex justify-end">
            <Button size="sm" onClick={onRequestAccess}>
              {t('requestExecutionAccess')}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Quick commands panel — the original lightweight terminal */
function QuickCommandsPanel({
  disabled,
  canRequestAccess,
  onRequestAccess,
}: {
  disabled: boolean;
  canRequestAccess: boolean;
  onRequestAccess: () => void;
}) {
  const { t } = useTranslation('terminal');
  const [command, setCommand] = useState('');
  const [output, setOutput] = useState<Array<{ command: string; result: string; error?: boolean }>>([]);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const outputRef = useRef<HTMLDivElement>(null);
  const { recordKernelEvent } = useStudioCommands();

  const handleExec = useCallback(async (cmd?: string) => {
    if (disabled) return;

    const execCmd = (cmd ?? command).trim().toLowerCase();
    if (!execCmd) return;

    setRunning(true);
    setCommand('');
    setHistory((prev) => [...prev, execCmd]);
    setHistoryIndex(-1);

    try {
      const data = await engineApi.execCommand(execCmd);
      setOutput((prev) => [...prev, { command: execCmd, result: JSON.stringify(data.result, null, 2) }]);
      recordKernelEvent({
        type: 'resource.changed',
        message: `Terminal: executed "${execCmd}"`,
      });
    } catch (err) {
      setOutput((prev) => [...prev, { command: execCmd, result: (err as Error).message, error: true }]);
    } finally {
      setRunning(false);
      requestAnimationFrame(() => {
        outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight, behavior: 'smooth' });
      });
    }
  }, [command, disabled, recordKernelEvent]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !running) {
      void handleExec();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(newIndex);
      setCommand(history[newIndex] ?? '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;
      const newIndex = historyIndex + 1;
      if (newIndex >= history.length) {
        setHistoryIndex(-1);
        setCommand('');
      } else {
        setHistoryIndex(newIndex);
        setCommand(history[newIndex] ?? '');
      }
    }
  };

  if (disabled) {
    return <RestrictedState canRequestAccess={canRequestAccess} onRequestAccess={onRequestAccess} />;
  }

  return (
    <>
      <div ref={outputRef} className="flex-1 overflow-auto p-4 font-mono text-xs">
        {output.length === 0 ? (
          <div className="text-muted-foreground">
            {t('noOutput', { commands: ALLOWED_COMMANDS.join(', ') })}
          </div>
        ) : (
          output.map((entry, i) => (
            <div key={i} className="mb-4">
              <div className="text-sky-600">$ {entry.command}</div>
              <pre className={`mt-1 whitespace-pre-wrap ${entry.error ? 'text-destructive' : 'text-foreground'}`}>
                {entry.result}
              </pre>
            </div>
          ))
        )}
      </div>
      <div className="flex gap-2 border-t px-4 py-3">
        <Input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('inputPlaceholder')}
          className="font-mono text-sm"
          disabled={running}
        />
        <Button size="sm" disabled={running || !command.trim()} onClick={() => void handleExec()}>
          {running ? t('executing') : t('execute')}
        </Button>
      </div>
    </>
  );
}

/** Streaming shell session panel */
function SessionPanel({
  disabled,
  canRequestAccess,
  onRequestAccess,
}: {
  disabled: boolean;
  canRequestAccess: boolean;
  onRequestAccess: () => void;
}) {
  const { t } = useTranslation('terminal');
  const [session, setSession] = useState<SessionState | null>(null);
  const [input, setInput] = useState('');
  const [creating, setCreating] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  const createSession = useCallback(async () => {
    if (disabled) return;

    setCreating(true);
    try {
      const { session: info } = await engineApi.createTerminalSession();
      const unsub = engineApi.subscribeTerminalSession(info.id, (chunk) => {
        setSession((prev) => {
          if (!prev || prev.id !== info.id) return prev;
          return { ...prev, output: prev.output + chunk.data };
        });
        scrollToBottom();
      });
      setSession({ id: info.id, alive: true, output: '', unsubscribe: unsub });
    } catch (err) {
      setSession({ id: 'error', alive: false, output: (err as Error).message, unsubscribe: null });
    } finally {
      setCreating(false);
    }
  }, [disabled, scrollToBottom]);

  const killSession = useCallback(async () => {
    if (disabled || !session) return;
    session.unsubscribe?.();
    try {
      await engineApi.killTerminalSession(session.id);
    } catch { /* ignore */ }
    setSession((prev) => prev ? { ...prev, alive: false } : null);
  }, [disabled, session]);

  const sendInput = useCallback(async () => {
    if (disabled || !session || !input) return;
    try {
      await engineApi.writeTerminalSession(session.id, input + '\n');
      setInput('');
    } catch (err) {
      setSession((prev) => prev ? { ...prev, output: prev.output + `\r\n[Error: ${(err as Error).message}]\r\n` } : null);
    }
  }, [disabled, session, input]);

  const handleCtrlC = useCallback(async () => {
    if (disabled || !session) return;
    try {
      await engineApi.writeTerminalSession(session.id, '\x03');
    } catch { /* ignore */ }
  }, [disabled, session]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      session?.unsubscribe?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (disabled) {
    return <RestrictedState canRequestAccess={canRequestAccess} onRequestAccess={onRequestAccess} />;
  }

  if (!session) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Button variant="outline" onClick={() => void createSession()} disabled={creating}>
          <Plus className="mr-1.5 size-4" />
          {creating ? t('creating') : t('createSession')}
        </Button>
      </div>
    );
  }

  return (
    <>
      <div ref={outputRef} className="flex-1 overflow-auto bg-[#1e1e1e] p-4 font-mono text-xs text-[#d4d4d4]">
        <pre className="whitespace-pre-wrap">{session.output || t('waitingOutput')}</pre>
      </div>
      <div className="flex gap-2 border-t px-4 py-3">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void sendInput();
            }
          }}
          placeholder={t('inputCommandPlaceholder')}
          className="font-mono text-sm"
          disabled={!session.alive}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => void handleCtrlC()}
          disabled={!session.alive}
          title={t('sendCtrlC')}
        >
          <Square className="size-3" />
        </Button>
        {session.alive ? (
          <Button size="sm" variant="destructive" onClick={() => void killSession()} title={t('killSession')}>
            <X className="size-3" />
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => { setSession(null); void createSession(); }}>
            <Plus className="size-3" />
          </Button>
        )}
      </div>
    </>
  );
}

export function TerminalView() {
  const { t } = useTranslation('terminal');
  const { setCapabilityGrant } = useStudioCommands();
  const capabilityGate = useCapabilityGate();
  const canExecute = capabilityGate.grants['process.exec'];
  const localDesktopMode = isLocalDesktopMode();
  const [mode, setMode] = useState<TerminalMode>('quick');
  const [authorizationDialogOpen, setAuthorizationDialogOpen] = useState(() => {
    if (!localDesktopMode || canExecute || hasSeenProcessExecPrompt()) {
      return false;
    }

    markProcessExecPromptSeen();
    return true;
  });
  const canRequestLocalAccess = localDesktopMode && !canExecute;

  const requestLocalAccess = useCallback(() => {
    if (!localDesktopMode) {
      return;
    }

    markProcessExecPromptSeen();
    setAuthorizationDialogOpen(true);
  }, [localDesktopMode]);

  const allowLocalExecution = useCallback(() => {
    setCapabilityGrant('process.exec', true);
    setAuthorizationDialogOpen(false);
  }, [setCapabilityGrant]);

  return (
    <>
      <div className="flex h-full w-full flex-col bg-background">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Terminal className="size-4" />
            <h1 className="text-sm font-semibold">{t('title')}</h1>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant={mode === 'quick' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setMode('quick')}
              title={t('quickCommandsTitle')}
            >
              <TerminalSquare className="mr-1 size-3" />
              {t('quick')}
            </Button>
            <Button
              variant={mode === 'session' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setMode('session')}
              title={t('terminalSessionTitle')}
            >
              <Terminal className="mr-1 size-3" />
              {t('shell')}
            </Button>
          </div>
        </div>
        {mode === 'quick' ? (
          <QuickCommandsPanel
            disabled={!canExecute}
            canRequestAccess={canRequestLocalAccess}
            onRequestAccess={requestLocalAccess}
          />
        ) : (
          <SessionPanel
            disabled={!canExecute}
            canRequestAccess={canRequestLocalAccess}
            onRequestAccess={requestLocalAccess}
          />
        )}
      </div>
      <Dialog open={authorizationDialogOpen} onOpenChange={setAuthorizationDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('processExecConsentTitle')}</DialogTitle>
            <DialogDescription>
              {t('processExecConsentDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-primary/15 bg-primary/[0.03] p-4 text-sm">
            <div className="font-medium text-foreground">{t('processExecConsentScopeTitle')}</div>
            <p className="mt-1 text-muted-foreground">
              {t('processExecConsentScopeDescription')}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAuthorizationDialogOpen(false)}>
              {t('processExecConsentDeny')}
            </Button>
            <Button onClick={allowLocalExecution}>
              {t('processExecConsentAllow')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
