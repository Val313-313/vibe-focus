import { Command } from 'commander';
import { readState, writeState } from '../core/state.js';
import { getTask, resolveActiveTask, updateTask, unmetDependencies, resolveWorker } from '../core/task.js';
import { evaluateSwitch } from '../core/guardian.js';
import { now } from '../utils/time.js';
import { success, error, printFocusCard, printGuardian, info, printChangeBanner } from '../ui/output.js';
import { detectChanges, stampWorkerMeta } from '../core/sync.js';
import { fireHeartbeat } from '../cloud/core/heartbeat.js';
import { fireCloudActivity } from '../cloud/core/api.js';

export const startCommand = new Command('start')
  .description('Start working on a task')
  .argument('<id>', 'Task ID (e.g. t1)')
  .option('--force', 'Force start even if another task is active')
  .option('--worker <name>', 'Assign to a named worker/tab (multi-tab support)')
  .action((id, opts) => {
    let state = readState();
    const task = getTask(state, id);
    const worker = resolveWorker(opts);
    const workerKey = worker ?? '__default__';

    // Show cross-tab changes
    const changes = detectChanges(state, workerKey);
    printChangeBanner(changes);

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

    // Guardian check: scope to worker if specified
    const active = resolveActiveTask(state, worker);

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
        worker: null,
      });
      state = {
        ...state,
        focusEvents: [
          ...state.focusEvents,
          { type: 'switch_away' as const, taskId: active.id, timestamp: now(), worker: workerKey },
          { type: 'pushback_override' as const, taskId: active.id, timestamp: now(), worker: workerKey },
        ],
      };
    }

    // Start the task
    const timestamp = now();
    state = updateTask(state, id, {
      status: 'active',
      startedAt: task.startedAt ?? timestamp,
      worker: worker ?? null,
    });

    // Update active tracking
    const newWorkers = { ...state.activeWorkers };
    if (worker) {
      newWorkers[worker] = id;
    }

    state = {
      ...state,
      activeTaskId: worker ? state.activeTaskId : id, // only set default if no worker
      activeWorkers: newWorkers,
      currentSession: { taskId: id, startedAt: timestamp, endedAt: null },
      focusEvents: [
        ...state.focusEvents,
        { type: 'start' as const, taskId: id, timestamp, worker: workerKey },
      ],
    };
    state.workerMeta = stampWorkerMeta(state, workerKey);

    writeState(state);
    fireHeartbeat();
    fireCloudActivity({ type: 'task_started', message: `Started ${id}: "${task.title}"` });

    const updated = state.tasks.find((t) => t.id === id)!;
    success(`Started task ${id}` + (worker ? ` [worker: ${worker}]` : ''));
    printFocusCard(updated);
    console.log('');
    if (worker) {
      info(`Worker "${worker}" is now focused on this task.`);
      info(`Set VF_WORKER=${worker} in your shell for guard hook enforcement.`);
    }
    info('Run "vf prompt" to get a focused Claude Code prompt.');
    info('Run "vf done"' + (worker ? ` --worker ${worker}` : '') + ' when all criteria are met.');
  });
