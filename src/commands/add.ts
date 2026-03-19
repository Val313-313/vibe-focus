import { Command } from 'commander';
import { createInterface } from 'node:readline/promises';
import { readState, writeState } from '../core/state.js';
import { createTask, getActiveTask } from '../core/task.js';
import { evaluateAdd, evaluateScopeAlignment } from '../core/guardian.js';
import { success, printTask, printGuardian, info } from '../ui/output.js';
import chalk from 'chalk';

function promptCriteria(): Promise<string[]> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const criteria: string[] = [];
    let index = 1;

    console.log(chalk.cyan('\nEnter acceptance criteria (one per line, empty line to finish):'));
    process.stdout.write(chalk.gray(`  ${index}. `));

    rl.on('line', (line) => {
      if (line.trim() === '') {
        rl.close();
        return;
      }
      criteria.push(line.trim());
      index++;
      process.stdout.write(chalk.gray(`  ${index}. `));
    });

    rl.on('close', () => {
      resolve(criteria);
    });
  });
}

export const addCommand = new Command('add')
  .description('Add a new task to the backlog')
  .argument('<title>', 'Task title')
  .option('-d, --description <desc>', 'Task description')
  .option('-c, --criteria <criteria...>', 'Acceptance criteria')
  .option('-i, --interactive', 'Interactively enter acceptance criteria')
  .option('--depends <ids...>', 'Dependency task IDs')
  .option('--tag <tags...>', 'Tags')
  .option('--start', 'Immediately start the task')
  .option('--force', 'Skip guardian warnings')
  .action(async (title, opts) => {
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

    // Interactive criteria input
    let criteria = opts.criteria;
    if (opts.interactive && !criteria) {
      criteria = await promptCriteria();
      if (criteria.length === 0) {
        info('No criteria added. You can add them later with "vf check".');
      }
    }

    const result = createTask(state, title, {
      description: opts.description,
      criteria,
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
