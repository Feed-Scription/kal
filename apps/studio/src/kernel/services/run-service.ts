import { engineApi } from '@/api/engine-client';
import type { RunService } from './types';
import { getKernelEventRecorder } from './kernel-services';

export type { RunService };

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

      getKernelEventRecorder()({
        type: eventType,
        message: `Run ${event.run.run_id} received ${event.type} event`,
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
