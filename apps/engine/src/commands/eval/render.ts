import { defineCommand } from 'citty';
import { renderPrompt, findPromptBuildNode } from '@kal-ai/core';
import type { Fragment } from '@kal-ai/core';
import { getCliContext, setExitCode } from '../../cli-context';
import { formatArg } from '../_shared';
import { resolveFlowInfo, parseJsonArg, toStateValues, writePrettyRender } from './_helpers';

export default defineCommand({
  meta: {
    name: 'render',
    description: 'Render a prompt node',
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
    state: {
      type: 'string',
      description: 'State JSON',
    },
    input: {
      type: 'string',
      description: 'Input JSON',
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
      io.stderr('Error: Missing flow path. Usage: kal eval render <flow> --node <id>\n');
      setExitCode(2);
      return;
    }
    if (typeof args.node !== 'string' || !args.node) {
      io.stderr('Error: Missing --node <id>\n');
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
      const flow = runtime.getFlow(flowId);
      const node = findPromptBuildNode(flow, args.node);

      if (node.type === 'GenerateText') {
        const inputEdges = flow.data.edges.filter((e) => e.target === node.id);
        const sources = inputEdges.map((e) => {
          const sourceNode = flow.data.nodes.find((n) => n.id === e.source);
          return {
            targetHandle: e.targetHandle,
            sourceNode: e.source,
            sourceType: sourceNode?.type ?? 'unknown',
            sourceHandle: e.sourceHandle,
          };
        });

        const result = {
          nodeId: args.node,
          nodeType: 'GenerateText',
          config: node.config ?? {},
          inputSources: sources,
        };

        if (format === 'pretty') {
          io.stdout(`Node: ${result.nodeId} [${result.nodeType}]\n`);
          io.stdout('---\n');
          io.stdout('Input Sources:\n');
          for (const s of sources) {
            io.stdout(`  ${s.targetHandle} <- ${s.sourceNode} [${s.sourceType}].${s.sourceHandle}\n`);
          }
          io.stdout('---\n');
          io.stdout(`Config: ${JSON.stringify(result.config, null, 2)}\n`);
        } else {
          io.stdout(JSON.stringify(result, null, 2) + '\n');
        }
        setExitCode(0);
        return;
      }

      const fragments: Fragment[] = (node.config?.fragments as Fragment[]) ?? [];
      let state = runtime.getState();
      if (typeof args.state === 'string') {
        const stateOverrides = await parseJsonArg(args.state, cwd);
        const overrideValues = toStateValues(stateOverrides);
        state = { ...state, ...overrideValues };
      }

      let data: Record<string, any> = {};
      if (typeof args.input === 'string') {
        data = await parseJsonArg(args.input, cwd);
      }

      const result = renderPrompt(args.node, fragments, state, data);

      if (format === 'pretty') {
        writePrettyRender(io, result);
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
