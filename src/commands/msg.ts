import { Command } from 'commander';
import { readState, writeState } from '../core/state.js';
import { resolveWorker } from '../core/task.js';
import { detectChanges, stampWorkerMeta } from '../core/sync.js';
import { now } from '../utils/time.js';
import { success, printChangeBanner } from '../ui/output.js';
import { fireCloudActivity } from '../cloud/core/api.js';

export const msgCommand = new Command('msg')
  .description('Send a message to other tabs/workers')
  .argument('<message>', 'Message text')
  .option('--worker <name>', 'Your worker identity')
  .action((message: string, opts) => {
    let state = readState();
    const worker = resolveWorker(opts);
    const workerKey = worker ?? '__default__';

    // Show any pending changes first
    const changes = detectChanges(state, workerKey);
    printChangeBanner(changes);

    // Add message event
    state = {
      ...state,
      focusEvents: [
        ...state.focusEvents,
        {
          type: 'message' as const,
          taskId: '',
          timestamp: now(),
          details: message,
          worker: workerKey,
        },
      ],
    };
    state.workerMeta = stampWorkerMeta(state, workerKey);

    writeState(state);
    fireCloudActivity({ type: 'message', message: `${workerKey}: ${message}` });

    success(`Message sent: "${message}"`);
  });
