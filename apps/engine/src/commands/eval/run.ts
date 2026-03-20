import { defineCommand } from 'citty';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { runEval } from '@kal-ai/core';
import type { Fragment } from '@kal-ai/core';
import { getCliContext, setExitCode } from '../../cli-context';
import { formatArg } from '../_shared';
import { resolveFlowInfo, parseJsonArg, toStateValues, writePrettyRun } from './_helpers';

export default defineCommand({
  meta: {
    name: 'run',
    description: 'Execute eval runs for a prompt node',
  },
  args: {
    flow: {
      type: 'positional',
      description: 'Flow path or id',
      required: false,
    },
    node: {
      type: 'string',
      description: 'Node id',
    },
    variant: {
      type: 'string',
      description: 'Variant file path',
    },
    runs: {
      type: 'string',
      description: 'Number of runs',
      default: '5',
    },
    model: {
      type: 'string',
      description: 'Model override',
    },
    input: {
      type: 'string',
      description: 'Input JSON',
    },
    state: {
      type: 'string',
      description: 'State JSON',
    },
    project: {
      type: 'string',
      description: 'Project root when using a flow id',
    },
    format: formatArg,
  },
  async run({ args }) {
    const { cwd, io, createRuntime } = getCliContext();
    const format = args.format === 'pretty' ? 'pretty' : 'json';

    if (typeof args.flow !== 'string' || !args.flow) {
      io.stderr('Error: Missing flow path. Usage: kal eval run <flow> --node <id>\n');
      setExitCode(2);
      return;
    }
    if (typeof args.node !== 'string' || !args.node) {
      io.stderr('Error: Missing --node <id>\n');
      setExitCode(2);
      return;
    }

    const runsCount = parseInt(typeof args.runs === 'string' ? args.runs : '5', 10);
    if (!Number.isFinite(runsCount) || runsCount < 1) {
      io.stderr('Error: --runs must be a positive integer\n');
      setExitCode(2);
      return;
    }

    try {
      const { projectRoot, flowId } = resolveFlowInfo(
        args.flow,
        typeof args.project === 'string' ? args.project : undefined,
        cwd,
      );
      const runtime = await createRuntime(projectRoot);
      const project = runtime.getProject();
      const flow = runtime.getFlow(flowId);

      let variantFragments: Fragment[] | undefined;
      if (typeof args.variant === 'string') {
        const variantPath = resolve(cwd, args.variant);
        const variantContent = await readFile(variantPath, 'utf8');
        const variantDef = JSON.parse(variantContent);
        if (!variantDef.fragments || !Array.isArray(variantDef.fragments)) {
          io.stderr('Error: Variant file must contain {"fragments": [...]}\n');
          setExitCode(2);
          return;
        }
        variantFragments = variantDef.fragments;
      }

      let inputData: Record<string, any> | undefined;
      if (typeof args.input === 'string') {
        inputData = await parseJsonArg(args.input, cwd);
      }

      let stateOverrides: Record<string, import('@kal-ai/core').StateValue> | undefined;
      if (typeof args.state === 'string') {
        const stateObj = await parseJsonArg(args.state, cwd);
        stateOverrides = toStateValues(stateObj);
      }

      const core = runtime.getKalCore();
      const stateStore = core.state;

      const resolver = (id: string): string => {
        const raw = project.flowTextsById[id];
        if (!raw) throw new Error(`Unknown flow: ${id}`);
        return raw;
      };

      const result = await runEval(core, stateStore, {
        flow,
        flowId,
        nodeId: args.node,
        variantFragments,
        runs: runsCount,
        input: inputData,
        state: stateOverrides,
        resolver,
        variantLabel: typeof args.variant === 'string' ? args.variant : undefined,
        modelOverride: typeof args.model === 'string' ? args.model : undefined,
      });

      result.flowPath = args.flow;

      if (format === 'pretty') {
        writePrettyRun(io, result);
      } else {
        io.stdout(JSON.stringify(result, null, 2) + '\n');
      }
      setExitCode(0);
    } catch (error) {
      io.stderr(`Error: ${(error as Error).message}\n`);
      setExitCode(1);
    }
  },
});
