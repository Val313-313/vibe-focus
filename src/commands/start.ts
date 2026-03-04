import { Command } from 'commander';
import { readState, writeState } from '../core/state.js';
import { getTask, getActiveTask, updateTask, unmetDependencies } from '../core/task.js';
import { evaluateSwitch } from '../core/guardian.js';
import { now } from '../utils/time.js';
import { success, error, printFocusCard, printGuardian, info } from '../ui/output.js';

export const startCommand = new Command('start')
  .description('Start working on a task')
  .argument('<id>', 'Task ID (e.g. t1)')
  .option('--force', 'Force start even if another task is active')
  .action((id, opts) => {
    let state = readState();
    const task = getTask(state, id);

    if (!task) {
      error(`Task ${id} not found.`);
      return;
    }

    if (task.status === 'done') {
      error(`Task ${id} is already done.`);
      return;
    }

    if (task.status === 'active') {
      info(`Task ${id} is already active.`);
      printFocusCard(task);
      return;
    }

    // Check dependencies
    const unmet = unmetDependencies(state, task);
    if (unmet.length > 0) {
      error(`Task ${id} has unmet dependencies: ${unmet.join(', ')}`);
      info('Complete those tasks first.');
      return;
    }

    // Guardian check if another task is active
    const active = getActiveTask(state);
    if (active && active.id !== id) {
      if (!opts.force) {
        const response = evaluateSwitch(state, active, id);
        printGuardian(response);
        return;
      }

      // Force: switch away from current task
      state = updateTask(state, active.id, {
        status: 'backlog',
        switchCount: active.switchCount + 1,
      });
      state = {
        ...state,
        focusEvents: [
          ...state.focusEvents,
          { type: 'switch_away' as const, taskId: active.id, timestamp: now() },
          { type: 'pushback_override' as const, taskId: active.id, timestamp: now() },
        ],
      };
    }

    // Start the task
    const timestamp = now();
    state = updateTask(state, id, {
      status: 'active',
      startedAt: task.startedAt ?? timestamp,
    });
    state = {
      ...state,
      activeTaskId: id,
      currentSession: { taskId: id, startedAt: timestamp, endedAt: null },
      focusEvents: [
        ...state.focusEvents,
        { type: 'start' as const, taskId: id, timestamp },
      ],
    };

    writeState(state);

    const updated = state.tasks.find((t) => t.id === id)!;
    success(`Started task ${id}`);
    printFocusCard(updated);
    console.log('');
    info('Run "vf prompt" to get a focused Claude Code prompt.');
    info('Run "vf done" when all criteria are met.');
  });
