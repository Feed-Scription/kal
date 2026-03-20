import { defineCommand } from 'citty';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { getCliContext, setExitCode } from '../../cli-context';
import { formatArg } from '../_shared';
import { buildComparison, writePrettyCompare } from './_helpers';

export default defineCommand({
  meta: {
    name: 'compare',
    description: 'Compare two eval result files',
  },
  args: {
    fileA: {
      type: 'positional',
      description: 'First result file',
      required: false,
    },
    fileB: {
      type: 'positional',
      description: 'Second result file',
      required: false,
    },
    format: formatArg,
  },
  async run({ args }) {
    const { cwd, io } = getCliContext();
    const format = args.format === 'pretty' ? 'pretty' : 'json';

    if (typeof args.fileA !== 'string' || !args.fileA) {
      io.stderr('Error: Missing first result file\n');
      setExitCode(2);
      return;
    }
    if (typeof args.fileB !== 'string' || !args.fileB) {
      io.stderr('Error: Missing second result file\n');
      setExitCode(2);
      return;
    }

    try {
      const pathA = resolve(cwd, args.fileA);
      const pathB = resolve(cwd, args.fileB);

      const [dataA, dataB] = await Promise.all([
        readFile(pathA, 'utf8').then((c) => JSON.parse(c)),
        readFile(pathB, 'utf8').then((c) => JSON.parse(c)),
      ]);

      const comparison = buildComparison(dataA, dataB, args.fileA, args.fileB);

      if (format === 'pretty') {
        writePrettyCompare(io, comparison);
      } else {
        io.stdout(JSON.stringify(comparison, null, 2) + '\n');
      }
      setExitCode(0);
    } catch (error) {
      io.stderr(`Error reading result files: ${(error as Error).message}\n`);
      setExitCode(1);
    }
  },
});
