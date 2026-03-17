import { useState, useRef, useCallback } from 'react';
import { Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useStudioCommands } from '@/kernel/hooks';
import { engineApi } from '@/api/engine-client';

const ALLOWED_COMMANDS = ['lint', 'smoke'];

export function TerminalView() {
  const [command, setCommand] = useState('');
  const [output, setOutput] = useState<Array<{ command: string; result: string; error?: boolean }>>([]);
  const [running, setRunning] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const { recordKernelEvent } = useStudioCommands();

  const handleExec = useCallback(async () => {
    const cmd = command.trim().toLowerCase();
    if (!cmd) return;

    setRunning(true);
    setCommand('');
    try {
      const data = await engineApi.execCommand(cmd);
      setOutput((prev) => [...prev, { command: cmd, result: JSON.stringify(data.result, null, 2) }]);
      recordKernelEvent({
        type: 'resource.changed',
        message: `Terminal: executed "${cmd}"`,
      });
    } catch (err) {
      setOutput((prev) => [...prev, { command: cmd, result: (err as Error).message, error: true }]);
    } finally {
      setRunning(false);
      requestAnimationFrame(() => {
        outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight, behavior: 'smooth' });
      });
    }
  }, [command, recordKernelEvent]);

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Terminal className="size-4" />
        <h1 className="text-sm font-semibold">Terminal</h1>
        <span className="text-xs text-muted-foreground">
          Allowed: {ALLOWED_COMMANDS.join(', ')}
        </span>
      </div>

      <div ref={outputRef} className="flex-1 overflow-auto p-4 font-mono text-xs">
        {output.length === 0 ? (
          <div className="text-muted-foreground">
            输入命令并回车执行。当前支持: {ALLOWED_COMMANDS.join(', ')}
          </div>
        ) : (
          output.map((entry, i) => (
            <div key={i} className="mb-4">
              <div className="text-muted-foreground">$ {entry.command}</div>
              <pre className={`mt-1 whitespace-pre-wrap ${entry.error ? 'text-destructive' : ''}`}>
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
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !running) void handleExec();
          }}
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
