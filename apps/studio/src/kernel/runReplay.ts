import type { RunAdvanceMode } from '@/api/engine-client';
import type { RunInputRecord, RunView } from '@/types/project';

type ReplayRunApi = {
  createRun: (forceNew?: boolean, mode?: RunAdvanceMode) => Promise<RunView>;
  advanceRun: (runId: string, input?: string, mode?: RunAdvanceMode) => Promise<RunView>;
};

type ReplayRunCallbacks = {
  onRunCreated?: (run: RunView) => void;
  onInputReplayed?: (params: {
    run: RunView;
    input: RunInputRecord;
    index: number;
    total: number;
  }) => void;
};

export async function replayRunFromHistory(
  api: ReplayRunApi,
  inputHistory: readonly RunInputRecord[],
  callbacks: ReplayRunCallbacks = {},
): Promise<RunView> {
  let currentRun = await api.createRun(true, 'continue');
  callbacks.onRunCreated?.(currentRun);

  for (let index = 0; index < inputHistory.length; index += 1) {
    const input = inputHistory[index]!;
    currentRun = await api.advanceRun(currentRun.run_id, input.input, 'continue');
    callbacks.onInputReplayed?.({
      run: currentRun,
      input,
      index,
      total: inputHistory.length,
    });
  }

  return currentRun;
}
