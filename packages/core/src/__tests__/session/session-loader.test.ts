import { describe, it, expect } from 'vitest';
import { validateSessionDefinition, validateSessionDefinitionDetailed } from '../../session/session-loader';

describe('validateSessionDefinition', () => {
  const flowIds = ['intro', 'main', 'outro-death', 'outro-win', 'save-race'];

  it('accepts a valid session definition', () => {
    const errors = validateSessionDefinition({
      schemaVersion: '1.0.0',
      steps: [
        { id: 'intro', type: 'RunFlow', flowRef: 'intro', next: 'turn' },
        { id: 'turn', type: 'Prompt', flowRef: 'main', inputChannel: 'playerInput', next: 'check' },
        { id: 'check', type: 'Branch', conditions: [
          { when: 'state.health <= 0', next: 'death' },
        ], default: 'turn' },
        { id: 'death', type: 'RunFlow', flowRef: 'outro-death', next: 'end' },
        { id: 'end', type: 'End' },
      ],
    }, flowIds);

    expect(errors).toEqual([]);
  });

  it('rejects non-object input', () => {
    const errors = validateSessionDefinition(null, flowIds);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('must be an object');
  });

  it('rejects missing schemaVersion', () => {
    const errors = validateSessionDefinition({
      steps: [{ id: 'end', type: 'End' }],
    }, flowIds);
    expect(errors.some((e) => e.path === 'schemaVersion')).toBe(true);
  });

  it('rejects empty steps', () => {
    const errors = validateSessionDefinition({
      schemaVersion: '1.0.0',
      steps: [],
    }, flowIds);
    expect(errors.some((e) => e.path === 'steps')).toBe(true);
  });

  it('rejects unknown flowRef', () => {
    const errors = validateSessionDefinition({
      schemaVersion: '1.0.0',
      steps: [
        { id: 'intro', type: 'RunFlow', flowRef: 'nonexistent', next: 'end' },
        { id: 'end', type: 'End' },
      ],
    }, flowIds);
    expect(errors.some((e) => e.message.includes('nonexistent'))).toBe(true);
  });

  it('can skip missing flowRef checks while editing a session skeleton', () => {
    const errors = validateSessionDefinition({
      schemaVersion: '1.0.0',
      steps: [
        { id: 'intro', type: 'RunFlow', flowRef: 'future-flow', next: 'end' },
        { id: 'end', type: 'End' },
      ],
    }, flowIds, { skipFlowRefChecks: true });

    expect(errors).toEqual([]);
  });

  it('can downgrade missing flowRef checks to warnings', () => {
    const result = validateSessionDefinitionDetailed({
      schemaVersion: '1.0.0',
      steps: [
        { id: 'intro', type: 'RunFlow', flowRef: 'future-flow', next: 'end' },
        { id: 'end', type: 'End' },
      ],
    }, flowIds, { flowValidationMode: 'warn' });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.message).toContain('future-flow');
  });

  it('can ignore missing flowRef checks entirely', () => {
    const result = validateSessionDefinitionDetailed({
      schemaVersion: '1.0.0',
      steps: [
        { id: 'intro', type: 'RunFlow', flowRef: 'future-flow', next: 'end' },
        { id: 'end', type: 'End' },
      ],
    }, flowIds, { flowValidationMode: 'ignore' });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('still rejects structural errors even when flow validation is ignored', () => {
    const result = validateSessionDefinitionDetailed({
      schemaVersion: '1.0.0',
      steps: [
        { id: 'intro', type: 'RunFlow', flowRef: 'future-flow', next: 'missing' },
        { id: 'end', type: 'End' },
      ],
    }, flowIds, { flowValidationMode: 'ignore' });

    expect(result.errors.some((error) => error.path.endsWith('.next'))).toBe(true);
  });

  it('rejects unknown next step reference', () => {
    const errors = validateSessionDefinition({
      schemaVersion: '1.0.0',
      steps: [
        { id: 'intro', type: 'RunFlow', flowRef: 'intro', next: 'missing' },
        { id: 'end', type: 'End' },
      ],
    }, flowIds);
    expect(errors.some((e) => e.message.includes('missing'))).toBe(true);
  });

  it('rejects session without End step', () => {
    const errors = validateSessionDefinition({
      schemaVersion: '1.0.0',
      steps: [
        { id: 'intro', type: 'RunFlow', flowRef: 'intro', next: 'intro' },
      ],
    }, flowIds);
    expect(errors.some((e) => e.message.includes('End step'))).toBe(true);
  });

  it('rejects invalid step type', () => {
    const errors = validateSessionDefinition({
      schemaVersion: '1.0.0',
      steps: [
        { id: 'bad', type: 'Unknown', flowRef: 'intro', next: 'end' },
        { id: 'end', type: 'End' },
      ],
    }, flowIds);
    expect(errors.some((e) => e.message.includes('Invalid step type'))).toBe(true);
  });

  it('rejects Prompt step without inputChannel', () => {
    const errors = validateSessionDefinition({
      schemaVersion: '1.0.0',
      steps: [
        { id: 'turn', type: 'Prompt', flowRef: 'main', next: 'end' },
        { id: 'end', type: 'End' },
      ],
    }, flowIds);
    expect(errors.some((e) => e.message.includes('inputChannel'))).toBe(true);
  });

  it('accepts Prompt step that only writes state', () => {
    const errors = validateSessionDefinition({
      schemaVersion: '1.0.0',
      steps: [
        { id: 'name', type: 'Prompt', stateKey: 'playerName', promptText: '输入名字', next: 'end' },
        { id: 'end', type: 'End' },
      ],
    }, flowIds);
    expect(errors).toEqual([]);
  });

  it('rejects Prompt step without flowRef and stateKey', () => {
    const errors = validateSessionDefinition({
      schemaVersion: '1.0.0',
      steps: [
        { id: 'turn', type: 'Prompt', promptText: '输入', next: 'end' },
        { id: 'end', type: 'End' },
      ],
    }, flowIds);
    expect(errors.some((e) => e.message.includes('flowRef or stateKey'))).toBe(true);
  });

  it('rejects Branch with invalid condition expression', () => {
    const errors = validateSessionDefinition({
      schemaVersion: '1.0.0',
      steps: [
        { id: 'check', type: 'Branch', conditions: [
          { when: 'invalid expression', next: 'end' },
        ], default: 'end' },
        { id: 'end', type: 'End' },
      ],
    }, flowIds);
    expect(errors.some((e) => e.path.includes('conditions'))).toBe(true);
  });

  it('rejects Branch with unknown condition next', () => {
    const errors = validateSessionDefinition({
      schemaVersion: '1.0.0',
      steps: [
        { id: 'check', type: 'Branch', conditions: [
          { when: 'state.health <= 0', next: 'nowhere' },
        ], default: 'end' },
        { id: 'end', type: 'End' },
      ],
    }, flowIds);
    expect(errors.some((e) => e.message.includes('nowhere'))).toBe(true);
  });

  it('rejects Branch with unknown default', () => {
    const errors = validateSessionDefinition({
      schemaVersion: '1.0.0',
      steps: [
        { id: 'check', type: 'Branch', conditions: [
          { when: 'state.health <= 0', next: 'end' },
        ], default: 'nowhere' },
        { id: 'end', type: 'End' },
      ],
    }, flowIds);
    expect(errors.some((e) => e.message.includes('nowhere'))).toBe(true);
  });

  it('rejects invalid entryStep', () => {
    const errors = validateSessionDefinition({
      schemaVersion: '1.0.0',
      entryStep: 'nonexistent',
      steps: [
        { id: 'end', type: 'End' },
      ],
    }, flowIds);
    expect(errors.some((e) => e.path === 'entryStep')).toBe(true);
  });

  it('accepts a valid Choice step', () => {
    const errors = validateSessionDefinition({
      schemaVersion: '1.0.0',
      steps: [
        {
          id: 'choose',
          type: 'Choice',
          promptText: '选择种族',
          options: [
            { label: '人类', value: 'human' },
            { label: '精灵', value: 'elf' },
          ],
          flowRef: 'save-race',
          inputChannel: 'race',
          next: 'end',
        },
        { id: 'end', type: 'End' },
      ],
    }, flowIds);
    expect(errors).toEqual([]);
  });

  it('rejects Choice step without promptText', () => {
    const errors = validateSessionDefinition({
      schemaVersion: '1.0.0',
      steps: [
        {
          id: 'choose',
          type: 'Choice',
          options: [{ label: '人类', value: 'human' }],
          flowRef: 'save-race',
          inputChannel: 'race',
          next: 'end',
        },
        { id: 'end', type: 'End' },
      ],
    }, flowIds);
    expect(errors.some((e) => e.message.includes('promptText'))).toBe(true);
  });

  it('rejects Choice step with empty options', () => {
    const errors = validateSessionDefinition({
      schemaVersion: '1.0.0',
      steps: [
        {
          id: 'choose',
          type: 'Choice',
          promptText: '选择种族',
          options: [],
          flowRef: 'save-race',
          inputChannel: 'race',
          next: 'end',
        },
        { id: 'end', type: 'End' },
      ],
    }, flowIds);
    expect(errors.some((e) => e.message.includes('options'))).toBe(true);
  });

  it('rejects Choice step with invalid option (missing label)', () => {
    const errors = validateSessionDefinition({
      schemaVersion: '1.0.0',
      steps: [
        {
          id: 'choose',
          type: 'Choice',
          promptText: '选择种族',
          options: [{ value: 'human' }],
          flowRef: 'save-race',
          inputChannel: 'race',
          next: 'end',
        },
        { id: 'end', type: 'End' },
      ],
    }, flowIds);
    expect(errors.some((e) => e.message.includes('label'))).toBe(true);
  });

  it('rejects Choice step without inputChannel', () => {
    const errors = validateSessionDefinition({
      schemaVersion: '1.0.0',
      steps: [
        {
          id: 'choose',
          type: 'Choice',
          promptText: '选择种族',
          options: [{ label: '人类', value: 'human' }],
          flowRef: 'save-race',
          next: 'end',
        },
        { id: 'end', type: 'End' },
      ],
    }, flowIds);
    expect(errors.some((e) => e.message.includes('inputChannel'))).toBe(true);
  });

  it('accepts Choice step that only writes state', () => {
    const errors = validateSessionDefinition({
      schemaVersion: '1.0.0',
      steps: [
        {
          id: 'choose',
          type: 'Choice',
          promptText: '选择种族',
          options: [{ label: '人类', value: 'human' }],
          stateKey: 'race',
          next: 'end',
        },
        { id: 'end', type: 'End' },
      ],
    }, flowIds);
    expect(errors).toEqual([]);
  });
});
