/**
 * Terminal Session Manager
 *
 * Provides persistent shell sessions with streaming output via child_process.spawn.
 * Each session runs a shell process (bash/zsh) that accepts commands via stdin
 * and streams stdout/stderr back to subscribers.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { platform } from 'node:os';

export interface TerminalSessionInfo {
  id: string;
  pid: number | null;
  alive: boolean;
  createdAt: number;
  cwd: string;
}

export interface TerminalOutputChunk {
  sessionId: string;
  stream: 'stdout' | 'stderr' | 'system';
  data: string;
  timestamp: number;
}

type OutputListener = (chunk: TerminalOutputChunk) => void;

interface TerminalSession {
  id: string;
  process: ChildProcess;
  cwd: string;
  createdAt: number;
  listeners: Set<OutputListener>;
  buffer: TerminalOutputChunk[];
}

const MAX_BUFFER = 500;
const MAX_SESSIONS = 4;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export class TerminalSessionManager {
  private sessions = new Map<string, TerminalSession>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private projectRoot: string) {
    this.cleanupTimer = setInterval(() => this.cleanupStale(), 60_000);
  }

  create(): TerminalSessionInfo {
    if (this.sessions.size >= MAX_SESSIONS) {
      // Kill oldest session
      const oldest = [...this.sessions.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
      if (oldest) this.kill(oldest.id);
    }

    const id = randomUUID().slice(0, 8);
    const shell = platform() === 'win32' ? 'cmd.exe' : (process.env.SHELL || '/bin/sh');

    const proc = spawn(shell, [], {
      cwd: this.projectRoot,
      env: { ...process.env, TERM: 'xterm-256color' },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });

    const session: TerminalSession = {
      id,
      process: proc,
      cwd: this.projectRoot,
      createdAt: Date.now(),
      listeners: new Set(),
      buffer: [],
    };

    const pushChunk = (stream: TerminalOutputChunk['stream'], data: string) => {
      const chunk: TerminalOutputChunk = { sessionId: id, stream, data, timestamp: Date.now() };
      session.buffer.push(chunk);
      if (session.buffer.length > MAX_BUFFER) {
        session.buffer.splice(0, session.buffer.length - MAX_BUFFER);
      }
      for (const listener of session.listeners) {
        listener(chunk);
      }
    };

    proc.stdout?.on('data', (buf: Buffer) => pushChunk('stdout', buf.toString('utf8')));
    proc.stderr?.on('data', (buf: Buffer) => pushChunk('stderr', buf.toString('utf8')));
    proc.on('exit', (code, signal) => {
      pushChunk('system', `\r\n[Process exited: code=${code ?? 'null'} signal=${signal ?? 'none'}]\r\n`);
      this.sessions.delete(id);
    });

    this.sessions.set(id, session);

    return { id, pid: proc.pid ?? null, alive: true, createdAt: session.createdAt, cwd: this.projectRoot };
  }

  write(sessionId: string, data: string): void {
    const session = this.getSession(sessionId);
    session.process.stdin?.write(data);
  }

  kill(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    try {
      session.process.kill('SIGTERM');
    } catch {
      // already dead
    }
    this.sessions.delete(sessionId);
  }

  subscribe(sessionId: string, listener: OutputListener): () => void {
    const session = this.getSession(sessionId);
    session.listeners.add(listener);
    // Replay buffer
    for (const chunk of session.buffer) {
      listener(chunk);
    }
    return () => { session.listeners.delete(listener); };
  }

  getInfo(sessionId: string): TerminalSessionInfo {
    const session = this.getSession(sessionId);
    const alive = session.process.exitCode === null && !session.process.killed;
    return { id: session.id, pid: session.process.pid ?? null, alive, createdAt: session.createdAt, cwd: session.cwd };
  }

  listSessions(): TerminalSessionInfo[] {
    return [...this.sessions.values()].map((s) => ({
      id: s.id,
      pid: s.process.pid ?? null,
      alive: s.process.exitCode === null && !s.process.killed,
      createdAt: s.createdAt,
      cwd: s.cwd,
    }));
  }

  dispose(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    for (const session of this.sessions.values()) {
      try { session.process.kill('SIGTERM'); } catch { /* ignore */ }
    }
    this.sessions.clear();
  }

  private getSession(sessionId: string): TerminalSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Terminal session not found: ${sessionId}`);
    return session;
  }

  private cleanupStale(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.createdAt > SESSION_TIMEOUT_MS) {
        this.kill(id);
      }
    }
  }
}
