import { execFile } from 'node:child_process';

export interface GitStatusResult {
  available: boolean;
  branch: string;
  clean: boolean;
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

export interface GitCommitEntry {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export interface GitLogResult {
  available: boolean;
  commits: GitCommitEntry[];
}

function git(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout: 5000 }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await git(['rev-parse', '--is-inside-work-tree'], cwd);
    return true;
  } catch {
    return false;
  }
}

export async function getGitStatus(cwd: string): Promise<GitStatusResult> {
  if (!(await isGitRepo(cwd))) {
    return { available: false, branch: '', clean: true, staged: [], unstaged: [], untracked: [] };
  }

  const [branchOut, statusOut] = await Promise.all([
    git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd),
    git(['status', '--porcelain'], cwd),
  ]);

  const branch = branchOut.trim();
  const lines = statusOut.split('\n').filter(Boolean);
  const staged: string[] = [];
  const unstaged: string[] = [];
  const untracked: string[] = [];

  for (const line of lines) {
    const x = line[0]!;
    const y = line[1]!;
    const file = line.slice(3);
    if (x === '?' && y === '?') {
      untracked.push(file);
    } else {
      if (x !== ' ' && x !== '?') staged.push(file);
      if (y !== ' ' && y !== '?') unstaged.push(file);
    }
  }

  return {
    available: true,
    branch,
    clean: lines.length === 0,
    staged,
    unstaged,
    untracked,
  };
}

export async function getGitLog(cwd: string, limit = 20): Promise<GitLogResult> {
  if (!(await isGitRepo(cwd))) {
    return { available: false, commits: [] };
  }

  const SEP = '---GIT-SEP---';
  const format = `%H${SEP}%s${SEP}%an${SEP}%aI`;
  const out = await git(['log', `--format=${format}`, `-n`, String(limit)], cwd);
  const commits: GitCommitEntry[] = out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, message, author, date] = line.split(SEP);
      return { hash: hash!, message: message!, author: author!, date: date! };
    });

  return { available: true, commits };
}
