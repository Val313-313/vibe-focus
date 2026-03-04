import chalk from 'chalk';
import Table from 'cli-table3';
import { Command } from 'commander';
import { readState } from '../core/state.js';
import { criteriaProgress } from '../core/task.js';
import { elapsedMinutes, formatDuration } from '../utils/time.js';

export const listCommand = new Command('list')
  .description('List all tasks')
  .option('--status <status>', 'Filter by status')
  .option('--all', 'Include abandoned tasks')
  .option('--json', 'Output as JSON')
  .action((opts) => {
    const state = readState();
    let tasks = state.tasks;

    if (opts.status) {
      tasks = tasks.filter((t) => t.status === opts.status);
    } else if (!opts.all) {
      tasks = tasks.filter((t) => t.status !== 'abandoned');
    }

    if (opts.json) {
      console.log(JSON.stringify(tasks, null, 2));
      return;
    }

    if (tasks.length === 0) {
      console.log(chalk.dim('No tasks. Run "vf add" to create one.'));
      return;
    }

    // Group by status
    const groups: Record<string, typeof tasks> = {};
    for (const t of tasks) {
      (groups[t.status] ??= []).push(t);
    }

    const order = ['active', 'backlog', 'done', 'abandoned'];

    for (const status of order) {
      const group = groups[status];
      if (!group || group.length === 0) continue;

      const label =
        status === 'active' ? chalk.green.bold('Active') :
        status === 'backlog' ? chalk.yellow.bold('Backlog') :
        status === 'done' ? chalk.gray.bold('Done') :
        chalk.red.bold('Abandoned');

      console.log(`\n ${label}:`);

      for (const t of group) {
        const { met, total } = criteriaProgress(t);
        const prefix = t.id === state.activeTaskId ? chalk.green('>') : ' ';
        const id = chalk.dim(t.id);
        const criteria = total > 0 ? chalk.dim(` ${met}/${total}`) : '';
        let elapsed = '';
        if (t.status === 'active' && t.startedAt) {
          elapsed = chalk.dim(` ${formatDuration(elapsedMinutes(t.startedAt))}`);
        }
        const deps = t.dependencies.length > 0
          ? chalk.dim(` depends: ${t.dependencies.join(', ')}`)
          : '';

        console.log(`  ${prefix} ${id}  ${t.title}${criteria}${elapsed}${deps}`);
      }
    }

    const done = state.tasks.filter((t) => t.status === 'done').length;
    console.log(
      chalk.dim(`\n Total: ${state.tasks.length} tasks (${done} done, ${state.tasks.length - done} remaining)`)
    );
  });
