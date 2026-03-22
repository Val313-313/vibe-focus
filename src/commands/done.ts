import { Command } from 'commander';
import chalk from 'chalk';
import { readState, writeState } from '../core/state.js';
import { resolveActiveTask, cleanupWorkers, updateTask, criteriaProgress } from '../core/task.js';
import { calculateDailyScore, scoreLabel } from '../core/scoring.js';
import { now, elapsedMinutes, formatDuration } from '../utils/time.js';
import { success, error, warn, info } from '../ui/output.js';
import { getFlowMode, disableFlowSilent } from './flow.js';
import { saveContext } from './context.js';
import type { StructuredContextFields } from './context.js';

export const doneCommand = new Command('done')
  .description('Complete the current active task')
  .option('--force', 'Skip criteria check')
  .option('--worker <name>', 'Complete the task for a specific worker/tab')
  .action((opts) => {
    let state = readState();
    const worker: string | undefined = opts.worker ?? process.env.VF_WORKER;
    const task = resolveActiveTask(state, worker);

    if (!task) {
      error(worker
        ? `No active task for worker "${worker}". Use "vf start <id> --worker ${worker}" to begin one.`
        : 'No active task. Use "vf start <id>" to begin one.'
      );
      return;
    }

    const { met, total } = criteriaProgress(task);

    // Check if all criteria met
    if (total > 0 && met < total && !opts.force) {
      warn(`Not all criteria met (${met}/${total}).`);
      for (const c of task.acceptanceCriteria) {
        const icon = c.met ? '  [✓]' : '  [ ]';
        console.log(`${icon} ${c.text}`);
      }
      console.log('');
      info('Use --force to complete anyway, or check criteria with "vf check".');
      return;
    }

    const timestamp = now();
    const elapsed = task.startedAt ? elapsedMinutes(task.startedAt) : 0;

    state = updateTask(state, task.id, {
      status: 'done',
      completedAt: timestamp,
      acceptanceCriteria: task.acceptanceCriteria.map((c) => ({ ...c, met: true })),
    });

    state = {
      ...state,
      ...cleanupWorkers(state, task.id, worker),
      currentSession: null,
      focusEvents: [
        ...state.focusEvents,
        { type: 'complete' as const, taskId: task.id, timestamp },
      ],
    };

    writeState(state);

    // Auto-save session context
    const lastCtx = state.sessionContexts.length > 0
      ? state.sessionContexts[state.sessionContexts.length - 1]
      : null;

    const carried: StructuredContextFields = {};
    if (lastCtx?.projectState) carried.projectState = lastCtx.projectState;
    if (lastCtx?.techStack?.length) carried.techStack = lastCtx.techStack;

    const completedCriteria = task.acceptanceCriteria.filter(c => c.met).map(c => c.text);
    if (completedCriteria.length > 0) {
      carried.decisions = completedCriteria.map(c => `Done: ${c}`);
    }

    saveContext(
      `Completed ${task.id}: "${task.title}"`,
      carried,
      task.id,
      true,
    );

    success(`Task ${task.id} completed: "${task.title}"`);
    if (total > 0) console.log(`  Criteria: ${total}/${total} met`);
    console.log(`  Time spent: ${formatDuration(elapsed)}`);

    const score = calculateDailyScore(state);
    console.log(`  Focus score: ${score} (${scoreLabel(score)})`);

    // Check flow mode
    const flowMode = getFlowMode();
    const backlog = state.tasks.filter((t) => t.status === 'backlog');

    if (flowMode === 'task') {
      // Task-scoped flow: auto-disable
      disableFlowSilent();
      console.log('');
      console.log(chalk.yellow('  Flow mode auto-disabled (task completed).'));
      info('Restart Claude Code to apply. Re-enable with: vf flow --on');
    } else if (flowMode === 'super') {
      // Superflow: check if all tasks are done
      if (backlog.length === 0) {
        disableFlowSilent();
        console.log('');
        console.log(chalk.cyanBright('  Superflow auto-disabled (all tasks done).'));
        info('Restart Claude Code to apply.');
      } else {
        console.log('');
        console.log(chalk.cyan(`  Superflow active: ${backlog.length} task${backlog.length > 1 ? 's' : ''} remaining.`));
      }
    }

    // Suggest next task
    if (backlog.length > 0) {
      console.log('');
      info('Next up in backlog:');
      for (const t of backlog.slice(0, 3)) {
        console.log(`  ${t.id}  ${t.title}`);
      }
      console.log('');
      info(`Run "vf start ${backlog[0].id}" to continue.`);
    }
  });
