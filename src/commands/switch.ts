import { Command } from 'commander';
import { readState, writeState } from '../core/state.js';
import { getTask, resolveActiveTask, updateTask, resolveWorker } from '../core/task.js';
import { evaluateSwitch } from '../core/guardian.js';
import { now } from '../utils/time.js';
import { success, error, printFocusCard, printGuardian, info } from '../ui/output.js';

export const switchCommand = new Command('switch')
  .description('Switch to a different task (Focus Guardian will push back!)')
  .argument('<id>', 'Target task ID')
  .option('--force', 'Override guardian pushback')
  .option('--yolo', 'Override even strong pushback')
  .option('--reason <reason>', 'Reason for switching')
  .option('--worker <name>', 'Switch within a specific worker/tab')
  .action((id, opts) => {
    let state = readState();
    const target = getTask(state, id);
    const worker = resolveWorker(opts);

    if (!target) {
      error(`Task ${id} not found.`);
      return;
    }

    if (target.status === 'done') {
      error(`Task ${id} is already done.`);
      return;
    }

    const active = resolveActiveTask(state, worker);

    if (!active) {
      info('No active task. Use "vf start" instead.');
      return;
    }

    if (active.id === id) {
      info(`Already working on ${id}.`);
      return;
    }

    // Guardian pushback
    if (!opts.force && !opts.yolo) {
      const response = evaluateSwitch(state, active, id);
      printGuardian(response);
      return;
    }

    const timestamp = now();

    // Switch away from current
    state = updateTask(state, active.id, {
      status: 'backlog',
      switchCount: active.switchCount + 1,
      worker: null,
    });

    // Start target
    state = updateTask(state, id, {
      status: 'active',
      startedAt: target.startedAt ?? timestamp,
      worker: worker ?? null,
    });

    // Update worker tracking
    const newWorkers = { ...state.activeWorkers };
    if (worker) {
      newWorkers[worker] = id;
    }

    state = {
      ...state,
      activeTaskId: worker ? state.activeTaskId : id,
      activeWorkers: newWorkers,
      currentSession: { taskId: id, startedAt: timestamp, endedAt: null },
      focusEvents: [
        ...state.focusEvents,
        { type: 'switch_away' as const, taskId: active.id, timestamp, details: opts.reason },
        { type: 'pushback_override' as const, taskId: active.id, timestamp },
        { type: 'switch_to' as const, taskId: id, timestamp },
      ],
    };

    writeState(state);

    success(`Switched from ${active.id} to ${id}` + (worker ? ` [worker: ${worker}]` : ''));
    if (opts.reason) {
      console.log(`  Reason: ${opts.reason}`);
    }

    const updated = state.tasks.find((t) => t.id === id)!;
    printFocusCard(updated);
  });
