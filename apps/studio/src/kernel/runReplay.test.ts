import { describe, expect, it, vi } from 'vitest';
import type { RunInputRecord, RunView } from '@/types/project';
import { replayRunFromHistory } from './runReplay';

function createRunView(runId: string): RunView {
  return {
    run_id: runId,
    status: 'waiting_input',
    waiting_for: null,
    updated_at: 0,
    created_at: 0,
    active: true,
    cursor: {
      currentStepId: null,
      stepIndex: 0,
    },
    state_summary: {
      total_keys: 0,
      keys: [],
      changed: [],
      changed_values: {},
      preview: {},
    },
    recent_events: [],
    input_history: [],
  };
}

describe('replayRunFromHistory', () => {
  it('creates a fresh run and replays each prior input', async () => {
    const createRun = vi.fn().mockResolvedValue(createRunView('run-new'));
    const advanceRun = vi
      .fn()
      .mockResolvedValueOnce(createRunView('run-new'))
      .mockResolvedValueOnce(createRunView('run-new'));
    const inputHistory: RunInputRecord[] = [
      { step_id: 'intro', step_index: 0, input: 'open door', timestamp: 1 },
      { step_id: 'hallway', step_index: 1, input: 'light torch', timestamp: 2 },
    ];

    const result = await replayRunFromHistory({ createRun, advanceRun }, inputHistory);

    expect(createRun).toHaveBeenCalledWith(true, 'continue');
    expect(advanceRun).toHaveBeenNthCalledWith(1, 'run-new', 'open door', 'continue');
    expect(advanceRun).toHaveBeenNthCalledWith(2, 'run-new', 'light torch', 'continue');
    expect(result.run_id).toBe('run-new');
  });

  it('returns the fresh run immediately when there is no input history', async () => {
    const createRun = vi.fn().mockResolvedValue(createRunView('run-new'));
    const advanceRun = vi.fn();

    const result = await replayRunFromHistory({ createRun, advanceRun }, []);

    expect(createRun).toHaveBeenCalledWith(true, 'continue');
    expect(advanceRun).not.toHaveBeenCalled();
    expect(result.run_id).toBe('run-new');
  });
});
