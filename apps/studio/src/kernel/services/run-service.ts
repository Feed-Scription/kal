import { engineApi } from '@/api/engine-client';
import type { RunStreamEvent } from '@/types/project';
import { useStudioStore } from '@/store/studioStore';

export interface RunService {
  subscribe(runId: string, onEvent: (event: RunStreamEvent) => void): () => void;
}

export const runService: RunService = {
  subscribe(runId, onEvent) {
    return engineApi.subscribeRun(runId, (event) => {
      const eventType =
        event.type === 'run.created' ||
        event.type === 'run.updated' ||
        event.type === 'run.ended' ||
        event.type === 'run.cancelled'
          ? event.type
          : 'run.updated';

      useStudioStore.getState().recordKernelEvent({
        type: eventType,
        message: `Run ${event.run.run_id} 收到 ${event.type} 事件`,
        runId: event.run.run_id,
        data: {
          status: event.run.status,
          active: event.run.active,
          recentEvents: event.run.recent_events.length,
        },
      });
      onEvent(event);
    });
  },
};
