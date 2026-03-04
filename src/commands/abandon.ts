import { Command } from 'commander';
import { readState, writeState } from '../core/state.js';
import { getActiveTask, updateTask } from '../core/task.js';
import { now } from '../utils/time.js';
import { success, error, info } from '../ui/output.js';

export const abandonCommand = new Command('abandon')
  .description('Abandon the current active task')
  .option('--reason <reason>', 'Reason for abandoning')
  .option('--backlog', 'Move back to backlog instead of abandoning')
  .action((opts) => {
    let state = readState();
    const task = getActiveTask(state);

    if (!task) {
      error('No active task to abandon.');
      return;
    }

    const timestamp = now();
    const newStatus = opts.backlog ? 'backlog' as const : 'abandoned' as const;

    state = updateTask(state, task.id, {
      status: newStatus,
      abandonedAt: opts.backlog ? null : timestamp,
      abandonReason: opts.reason ?? null,
    });

    state = {
      ...state,
      activeTaskId: null,
      currentSession: null,
      focusEvents: [
        ...state.focusEvents,
        {
          type: 'abandon' as const,
          taskId: task.id,
          timestamp,
          details: opts.reason,
        },
      ],
    };

    writeState(state);

    if (opts.backlog) {
      success(`Task ${task.id} moved back to backlog: "${task.title}"`);
    } else {
      success(`Abandoned ${task.id}: "${task.title}"`);
      if (opts.reason) console.log(`  Reason: ${opts.reason}`);
    }

    const backlog = state.tasks.filter((t) => t.status === 'backlog');
    if (backlog.length > 0) {
      console.log('');
      info(`Next up: ${backlog[0].id} - ${backlog[0].title}`);
      info(`Run "vf start ${backlog[0].id}" to continue.`);
    }
  });
