import { useState, useRef, useCallback, useEffect } from 'react';
import { Terminal, Plus, X, Square, TerminalSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useStudioCommands } from '@/kernel/hooks';
import { engineApi } from '@/api/engine-client';

const ALLOWED_COMMANDS = ['lint', 'smoke', 'schema', 'debug-list', 'debug-state', 'config', 'eval'];

type TerminalMode = 'quick' | 'session';

interface SessionState {
  id: string;
  alive: boolean;
  output: string;
  unsubscribe: (() => void) | null;
}

/** Quick commands panel — the original lightweight terminal */
function QuickCommandsPanel() {
  const [command, setCommand] = useState('');
  const [output, setOutput] = useState<Array<{ command: string; result: string; error?: boolean }>>([]);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const outputRef = useRef<HTMLDivElement>(null);
  const { recordKernelEvent } = useStudioCommands();

  const handleExec = useCallback(async (cmd?: string) => {
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
  }, [command, recordKernelEvent]);

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

  return (
    <>
      <div ref={outputRef} className="flex-1 overflow-auto p-4 font-mono text-xs">
        {output.length === 0 ? (
          <div className="text-muted-foreground">
            输入命令并回车执行。当前支持: {ALLOWED_COMMANDS.join(', ')}
            <br />
            使用 ↑↓ 箭头键浏览历史命令。
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
          placeholder="输入命令 (lint, smoke)"
          className="font-mono text-sm"
          disabled={running}
        />
        <Button size="sm" disabled={running || !command.trim()} onClick={() => void handleExec()}>
          {running ? '执行中...' : '执行'}
        </Button>
      </div>
    </>
  );
}

/** Streaming shell session panel */
function SessionPanel() {
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
  }, [scrollToBottom]);

  const killSession = useCallback(async () => {
    if (!session) return;
    session.unsubscribe?.();
    try {
      await engineApi.killTerminalSession(session.id);
    } catch { /* ignore */ }
    setSession((prev) => prev ? { ...prev, alive: false } : null);
  }, [session]);

  const sendInput = useCallback(async () => {
    if (!session || !input) return;
    try {
      await engineApi.writeTerminalSession(session.id, input + '\n');
      setInput('');
    } catch (err) {
      setSession((prev) => prev ? { ...prev, output: prev.output + `\r\n[Error: ${(err as Error).message}]\r\n` } : null);
    }
  }, [session, input]);

  const handleCtrlC = useCallback(async () => {
    if (!session) return;
    try {
      await engineApi.writeTerminalSession(session.id, '\x03');
    } catch { /* ignore */ }
  }, [session]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      session?.unsubscribe?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!session) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Button variant="outline" onClick={() => void createSession()} disabled={creating}>
          <Plus className="mr-1.5 size-4" />
          {creating ? '创建中...' : '创建终端会话'}
        </Button>
      </div>
    );
  }

  return (
    <>
      <div ref={outputRef} className="flex-1 overflow-auto bg-[#1e1e1e] p-4 font-mono text-xs text-[#d4d4d4]">
        <pre className="whitespace-pre-wrap">{session.output || '等待输出...'}</pre>
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
          placeholder="输入命令..."
          className="font-mono text-sm"
          disabled={!session.alive}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => void handleCtrlC()}
          disabled={!session.alive}
          title="发送 Ctrl+C"
        >
          <Square className="size-3" />
        </Button>
        {session.alive ? (
          <Button size="sm" variant="destructive" onClick={() => void killSession()} title="终止会话">
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
  const [mode, setMode] = useState<TerminalMode>('quick');

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Terminal className="size-4" />
          <h1 className="text-sm font-semibold">Terminal</h1>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={mode === 'quick' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setMode('quick')}
            title="快捷命令"
          >
            <TerminalSquare className="mr-1 size-3" />
            Quick
          </Button>
          <Button
            variant={mode === 'session' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setMode('session')}
            title="终端会话"
          >
            <Terminal className="mr-1 size-3" />
            Shell
          </Button>
        </div>
      </div>
      {mode === 'quick' ? <QuickCommandsPanel /> : <SessionPanel />}
    </div>
  );
}
