import { useState, useRef, useCallback } from 'react';
import { Terminal, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useStudioCommands } from '@/kernel/hooks';
import { engineApi } from '@/api/engine-client';

const ALLOWED_COMMANDS = ['lint', 'smoke'];

export function TerminalView() {
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

  const handleClear = () => {
    setOutput([]);
  };

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Terminal className="size-4" />
          <h1 className="text-sm font-semibold">Terminal</h1>
          <span className="text-xs text-muted-foreground">
            Allowed: {ALLOWED_COMMANDS.join(', ')}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleClear}
          disabled={output.length === 0}
          title="清屏"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

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
    </div>
  );
}
