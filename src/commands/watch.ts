import { Command } from 'commander';
import chalk from 'chalk';
import { readState, updateState } from '../core/state.js';
import { detectChanges, stampWorkerMeta } from '../core/sync.js';
import { resolveWorker } from '../core/task.js';
import { info } from '../ui/output.js';

export const watchCommand = new Command('watch')
  .description('Live-poll for cross-tab changes (long-running)')
  .option('--worker <name>', 'Identity for this watcher (default: __watcher__)')
  .option('--interval <ms>', 'Polling interval in ms (default: 2000, min: 500, max: 10000)', '2000')
  .action((opts) => {
    const worker = resolveWorker(opts) ?? '__watcher__';
    const interval = Math.max(500, Math.min(10000, parseInt(opts.interval, 10) || 2000));

    console.log(chalk.cyan(`Watching for cross-tab changes as "${worker}" (every ${interval}ms)`));
    console.log(chalk.dim('Press Ctrl+C to stop.\n'));

    // Stamp initial position so we only see new events from now
    updateState((s) => ({ ...s, workerMeta: stampWorkerMeta(s, worker) }));

    const timer = setInterval(() => {
      try {
        const state = readState();
        const changes = detectChanges(state, worker);

        if (changes.length > 0) {
          for (const c of changes) {
            const icon =
              c.type === 'start' ? chalk.greenBright('▶') :
              c.type === 'complete' ? chalk.cyanBright('✓') :
              c.type === 'abandon' ? chalk.red('✗') :
              c.type === 'switch_away' ? chalk.yellow('◀') :
              c.type === 'switch_to' ? chalk.green('▶') :
              c.type === 'pushback_override' ? chalk.red('!') :
              chalk.dim('·');
            const time = new Date(c.timestamp).toLocaleTimeString('de-DE', {
              hour: '2-digit', minute: '2-digit', second: '2-digit',
            });
            console.log(`  ${chalk.dim(time)} ${icon} ${chalk.bold(c.worker)}: ${c.description}`);
          }

          // Stamp after consuming
          updateState((s) => ({ ...s, workerMeta: stampWorkerMeta(s, worker) }));
        }
      } catch {
        // State file may be temporarily unavailable during writes; skip this tick
      }
    }, interval);

    const cleanup = () => {
      clearInterval(timer);
      console.log(chalk.dim('\nStopped watching.'));
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    // Keep the process alive
    info('Watching...');
  });
