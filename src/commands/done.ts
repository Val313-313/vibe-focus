import { Command } from 'commander';
import { readState, writeState } from '../core/state.js';
import { getActiveTask, updateTask, criteriaProgress } from '../core/task.js';
import { calculateDailyScore, scoreLabel } from '../core/scoring.js';
import { now, elapsedMinutes, formatDuration } from '../utils/time.js';
import { success, error, warn, info } from '../ui/output.js';

export const doneCommand = new Command('done')
  .description('Complete the current active task')
  .option('--force', 'Skip criteria check')
  .action((opts) => {
    let state = readState();
    const task = getActiveTask(state);

    if (!task) {
      error('No active task. Use "vf start <id>" to begin one.');
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
      activeTaskId: null,
      currentSession: null,
      focusEvents: [
        ...state.focusEvents,
        { type: 'complete' as const, taskId: task.id, timestamp },
      ],
    };

    writeState(state);

    success(`Task ${task.id} completed: "${task.title}"`);
    if (total > 0) console.log(`  Criteria: ${total}/${total} met`);
    console.log(`  Time spent: ${formatDuration(elapsed)}`);

    const score = calculateDailyScore(state);
    console.log(`  Focus score: ${score} (${scoreLabel(score)})`);

    // Suggest next task
    const backlog = state.tasks.filter((t) => t.status === 'backlog');
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
