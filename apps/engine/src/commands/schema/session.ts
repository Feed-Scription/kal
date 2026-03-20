import { defineCommand } from 'citty';
import { getCliContext, setExitCode } from '../../cli-context';
import { formatArg } from '../_shared';

const VALID_SESSION_STEP_TYPES = [
  {
    type: 'RunFlow',
    fields: ['id', 'type', 'flowRef', 'next'],
    required: ['id', 'type', 'flowRef', 'next'],
  },
  {
    type: 'Prompt',
    fields: ['id', 'type', 'flowRef', 'inputChannel', 'stateKey', 'promptText', 'next'],
    required: ['id', 'type', 'next'],
    notes: 'Requires flowRef or stateKey. inputChannel required when flowRef is set.',
  },
  {
    type: 'Choice',
    fields: ['id', 'type', 'promptText', 'options', 'flowRef', 'inputChannel', 'stateKey', 'next'],
    required: ['id', 'type', 'promptText', 'options', 'next'],
    notes: 'options: Array<{ label: string, value: string }>. Requires flowRef or stateKey.',
  },
  {
    type: 'DynamicChoice',
    fields: ['id', 'type', 'promptText', 'options', 'flowRef', 'inputChannel', 'stateKey', 'next'],
    required: ['id', 'type', 'promptText', 'options', 'next'],
    notes: 'options: Array<{ label, value, when? }>. Options filtered by "when" conditions at runtime.',
  },
  {
    type: 'Branch',
    fields: ['id', 'type', 'conditions', 'default', 'defaultSetState'],
    required: ['id', 'type', 'conditions', 'default'],
    notes: 'conditions: Array<{ when: string, next: string, setState? }>',
  },
  {
    type: 'End',
    fields: ['id', 'type', 'message'],
    required: ['id', 'type'],
  },
];

export default defineCommand({
  meta: {
    name: 'session',
    description: 'Show session step schemas',
  },
  args: {
    format: formatArg,
  },
  async run({ args }) {
    const { io } = getCliContext();
    const format = args.format === 'pretty' ? 'pretty' : 'json';

    if (format === 'pretty') {
      io.stdout('Session step types:\n\n');
      for (const step of VALID_SESSION_STEP_TYPES) {
        io.stdout(`  ${step.type}\n`);
        io.stdout(`    fields:   ${step.fields.join(', ')}\n`);
        io.stdout(`    required: ${step.required.join(', ')}\n`);
        if (step.notes) {
          io.stdout(`    notes:    ${step.notes}\n`);
        }
      }
    } else {
      io.stdout(JSON.stringify({ stepTypes: VALID_SESSION_STEP_TYPES }, null, 2) + '\n');
    }
    setExitCode(0);
  },
});
