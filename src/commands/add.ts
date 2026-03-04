import { Command } from 'commander';
import { readState, writeState } from '../core/state.js';
import { createTask, getActiveTask } from '../core/task.js';
import { evaluateAdd, evaluateScopeAlignment } from '../core/guardian.js';
import { success, printTask, printGuardian, info } from '../ui/output.js';

export const addCommand = new Command('add')
  .description('Add a new task to the backlog')
  .argument('<title>', 'Task title')
  .option('-d, --description <desc>', 'Task description')
  .option('-c, --criteria <criteria...>', 'Acceptance criteria')
  .option('--depends <ids...>', 'Dependency task IDs')
  .option('--tag <tags...>', 'Tags')
  .option('--start', 'Immediately start the task')
  .option('--force', 'Skip guardian warnings')
  .action((title, opts) => {
    let state = readState();

    // Check scope alignment
    if (!opts.force) {
      const scopeCheck = evaluateScopeAlignment(state, title);
      if (scopeCheck && !scopeCheck.allowed) {
        printGuardian(scopeCheck);
        return;
      }
    }

    // Guardian info if active task
    const active = getActiveTask(state);
    if (active) {
      const response = evaluateAdd(active);
      printGuardian(response);
    }

    const result = createTask(state, title, {
      description: opts.description,
      criteria: opts.criteria,
      dependencies: opts.depends,
      tags: opts.tag,
    });

    state = result.state;

    if (opts.start && !active) {
      state = {
        ...state,
        activeTaskId: result.task.id,
        tasks: state.tasks.map((t) =>
          t.id === result.task.id
            ? { ...t, status: 'active' as const, startedAt: new Date().toISOString() }
            : t
        ),
        currentSession: {
          taskId: result.task.id,
          startedAt: new Date().toISOString(),
          endedAt: null,
        },
        focusEvents: [
          ...state.focusEvents,
          { type: 'start' as const, taskId: result.task.id, timestamp: new Date().toISOString() },
        ],
      };
    }

    writeState(state);
    success(`Added task ${result.task.id}: "${title}"`);
    printTask(result.task);

    if (opts.start && active) {
      info('Cannot auto-start: another task is active. Use "vf switch" first.');
    }
  });
