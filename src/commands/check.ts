import { Command } from 'commander';
import chalk from 'chalk';
import { readState, writeState } from '../core/state.js';
import { resolveActiveTask, updateTask, resolveWorker } from '../core/task.js';
import { success, error, info, printChangeBanner } from '../ui/output.js';
import { detectChanges, stampWorkerMeta } from '../core/sync.js';
import { fireHeartbeat } from '../cloud/core/heartbeat.js';
import { fireCloudActivity } from '../cloud/core/api.js';

export const checkCommand = new Command('check')
  .description('Mark acceptance criteria as met on the active task')
  .argument('[criteria-ids...]', 'Criterion IDs to check (e.g. t1-c1 t1-c2)')
  .option('--all', 'Mark all criteria as met')
  .option('--worker <name>', 'Check criteria for a specific worker/tab')
  .action((criteriaIds: string[], opts) => {
    let state = readState();
    const worker = resolveWorker(opts);
    const workerKey = worker ?? '__default__';
    const task = resolveActiveTask(state, worker);

    // Show cross-tab changes
    const changes = detectChanges(state, workerKey);
    printChangeBanner(changes);

    if (!task) {
      error('No active task. Use "vf start <id>" first.');
      return;
    }

    if (task.acceptanceCriteria.length === 0) {
      info('This task has no acceptance criteria.');
      return;
    }

    if (opts.all) {
      criteriaIds = task.acceptanceCriteria.map((c) => c.id);
    }

    if (criteriaIds.length === 0) {
      // Show current criteria status
      console.log(chalk.bold(`Criteria for ${task.id}: "${task.title}"`));
      console.log('');
      for (const c of task.acceptanceCriteria) {
        const icon = c.met ? chalk.green('[✓]') : chalk.gray('[ ]');
        console.log(`  ${icon} ${chalk.dim(c.id)} ${c.text}`);
      }
      console.log('');
      info('Use "vf check <id>" to mark criteria as met.');
      info('Use "vf check --all" to mark all as met.');
      return;
    }

    const updatedCriteria = task.acceptanceCriteria.map((c) => ({
      ...c,
      met: criteriaIds.includes(c.id) ? true : c.met,
    }));

    state = updateTask(state, task.id, { acceptanceCriteria: updatedCriteria });
    state.workerMeta = stampWorkerMeta(state, workerKey);
    writeState(state);
    fireHeartbeat();

    const checked = criteriaIds.filter((id) =>
      task.acceptanceCriteria.some((c) => c.id === id)
    );
    const met = updatedCriteria.filter((c) => c.met).length;
    const total = updatedCriteria.length;

    fireCloudActivity({ type: 'criterion_checked', message: `Checked ${checked.length} criteria on ${task.id}` });

    success(`Checked ${checked.length} criteria (${met}/${total} total)`);

    if (met === total) {
      console.log('');
      info('All criteria met! Run "vf done" to complete the task.');
    }
  });
