import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { readState, updateState } from '../core/state.js';
import { detectChanges, stampWorkerMeta } from '../core/sync.js';
import { resolveWorker } from '../core/task.js';
import { info, success } from '../ui/output.js';
import { buildHeartbeatPayload, sendHeartbeat } from '../cloud/core/heartbeat.js';
import type { HeartbeatSuggestion, HeartbeatNotification } from '../cloud/types.js';

/** Heartbeat throttle — max once per 30 seconds */
const HEARTBEAT_INTERVAL_MS = 30_000;

/** Directories/patterns to ignore during file watching */
const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.vibe-focus', 'dist', 'build',
  '.next', '.nuxt', '.cache', '__pycache__', '.tox',
  'coverage', '.nyc_output', '.turbo', '.vercel',
]);

const IGNORE_EXTENSIONS = new Set([
  '.log', '.lock', '.tmp', '.swp', '.swo',
]);

function shouldIgnore(filePath: string): boolean {
  const parts = filePath.split(path.sep);
  if (parts.some((p) => IGNORE_DIRS.has(p))) return true;
  const ext = path.extname(filePath).toLowerCase();
  if (IGNORE_EXTENSIONS.has(ext)) return true;
  if (parts.some((p) => p.startsWith('.'))) return true;
  return false;
}

export const watchCommand = new Command('watch')
  .description('Watch for file changes + cross-tab sync, auto-send heartbeats')
  .option('--worker <name>', 'Identity for this watcher (default: __watcher__)')
  .option('--interval <ms>', 'Polling interval in ms (default: 2000, min: 500, max: 10000)', '2000')
  .option('--no-heartbeat', 'Disable auto-heartbeat on file changes')
  .action((opts) => {
    const worker = resolveWorker(opts) ?? '__watcher__';
    const interval = Math.max(500, Math.min(10000, parseInt(opts.interval, 10) || 2000));
    const heartbeatEnabled = opts.heartbeat !== false;

    console.log(chalk.cyan(`\n  vf watch — file monitor + cloud sync`));
    console.log(chalk.dim(`  worker: ${worker} | poll: ${interval}ms | heartbeat: ${heartbeatEnabled ? 'on' : 'off'}`));
    console.log(chalk.dim('  Press Ctrl+C to stop.\n'));

    // Stamp initial position so we only see new events from now
    updateState((s) => ({ ...s, workerMeta: stampWorkerMeta(s, worker) }));

    // --- Cross-tab sync polling (existing) ---
    const syncTimer = setInterval(() => {
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
              c.type === 'message' ? chalk.magentaBright('💬') :
              chalk.dim('·');
            const time = new Date(c.timestamp).toLocaleTimeString('de-DE', {
              hour: '2-digit', minute: '2-digit', second: '2-digit',
            });
            console.log(`  ${chalk.dim(time)} ${icon} ${chalk.bold(c.worker)}: ${c.description}`);
          }
          updateState((s) => ({ ...s, workerMeta: stampWorkerMeta(s, worker) }));
        }
      } catch {
        // State file may be temporarily unavailable during writes
      }
    }, interval);

    // --- File watcher + auto-heartbeat ---
    let lastHeartbeatAt = 0;
    let lastSuggestionAt = 0;
    const SUGGESTION_DEBOUNCE_MS = 10 * 60 * 1000; // 10 minutes
    let recentFiles: string[] = [];
    let pendingHeartbeat: ReturnType<typeof setTimeout> | null = null;
    let watcher: fs.FSWatcher | null = null;

    const seenNotificationIds = new Set<string>();

    function showNotifications(notifications?: HeartbeatNotification[]) {
      if (!notifications || notifications.length === 0) return;
      const time = new Date().toLocaleTimeString('de-DE', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
      for (const n of notifications) {
        if (seenNotificationIds.has(n.id)) continue;
        seenNotificationIds.add(n.id);
        const typeIcon =
          n.type === 'mention' ? chalk.cyan('@') :
          n.type === 'task_assigned' ? chalk.yellow('→') :
          n.type === 'task_completed' ? chalk.green('✓') :
          n.type === 'member_joined' ? chalk.green('+') :
          chalk.magenta('★');
        const actor = n.actor?.username ? chalk.bold(n.actor.username) : 'someone';
        console.log(`  ${chalk.dim(time)} ${typeIcon} ${chalk.yellowBright('🔔')} ${actor} ${n.title}${n.body ? chalk.dim(` — ${n.body.slice(0, 60)}`) : ''}`);
      }
    }

    function showSuggestions(suggestions?: HeartbeatSuggestion[]) {
      if (!suggestions || suggestions.length === 0) return;
      const now = Date.now();
      if (now - lastSuggestionAt < SUGGESTION_DEBOUNCE_MS) return;
      lastSuggestionAt = now;

      const time = new Date().toLocaleTimeString('de-DE', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
      const top = suggestions[0];
      const icon = top.urgency === 'high' ? chalk.red('\u25cf') : top.urgency === 'medium' ? chalk.yellow('\u25cf') : chalk.green('\u25cf');
      console.log(`  ${chalk.dim(time)} ${icon} ${chalk.cyan('suggestion:')} ${top.message}`);
    }

    function throttledHeartbeat() {
      if (!heartbeatEnabled) return;

      const now = Date.now();
      if (now - lastHeartbeatAt < HEARTBEAT_INTERVAL_MS) {
        // Schedule for later if not already pending
        if (!pendingHeartbeat) {
          const delay = HEARTBEAT_INTERVAL_MS - (now - lastHeartbeatAt) + 100;
          pendingHeartbeat = setTimeout(() => {
            pendingHeartbeat = null;
            throttledHeartbeat();
          }, delay);
        }
        return;
      }

      lastHeartbeatAt = now;
      const filesToSend = [...new Set(recentFiles)].slice(0, 20);
      recentFiles = [];

      const payload = buildHeartbeatPayload();
      if (!payload) return;

      // Merge watched files into active_files
      if (filesToSend.length > 0) {
        const combined = new Set([...filesToSend, ...payload.active_files]);
        payload.active_files = [...combined].slice(0, 50);
      }

      const time = new Date().toLocaleTimeString('de-DE', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });

      sendHeartbeat(payload)
        .then((result) => {
          if (result.ok) {
            console.log(`  ${chalk.dim(time)} ${chalk.magenta('♥')} heartbeat sent (${filesToSend.length} files)`);
            showSuggestions(result.suggestions);
            showNotifications(result.notifications);
          }
        })
        .catch(() => {});
    }

    try {
      const cwd = process.cwd();
      watcher = fs.watch(cwd, { recursive: true }, (_event, filename) => {
        if (!filename || shouldIgnore(filename)) return;
        recentFiles.push(filename);
        throttledHeartbeat();
      });

      watcher.on('error', () => {
        // fs.watch can emit errors on some platforms; ignore
      });

      success('Watching file changes...');

      // Send initial heartbeat
      if (heartbeatEnabled) {
        const payload = buildHeartbeatPayload();
        if (payload) {
          sendHeartbeat(payload)
            .then((r) => {
              if (r.ok) {
                const time = new Date().toLocaleTimeString('de-DE', {
                  hour: '2-digit', minute: '2-digit', second: '2-digit',
                });
                console.log(`  ${chalk.dim(time)} ${chalk.magenta('♥')} initial heartbeat sent`);
                showSuggestions(r.suggestions);
                showNotifications(r.notifications);
              }
            })
            .catch(() => {});
          lastHeartbeatAt = Date.now();
        }
      }
    } catch (e) {
      info(`File watching unavailable (${(e as Error).message}). Cross-tab sync still active.`);
    }

    // --- Periodic keep-alive heartbeat (every 2 min even without file changes) ---
    let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
    if (heartbeatEnabled) {
      keepAliveTimer = setInterval(() => {
        const now = Date.now();
        if (now - lastHeartbeatAt >= 120_000) {
          const payload = buildHeartbeatPayload({ status: 'idle' });
          if (payload) {
            lastHeartbeatAt = now;
            sendHeartbeat(payload).catch(() => {});
          }
        }
      }, 60_000);
    }

    // --- Cleanup ---
    const cleanup = () => {
      clearInterval(syncTimer);
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      if (pendingHeartbeat) clearTimeout(pendingHeartbeat);
      if (watcher) watcher.close();

      // Send offline heartbeat
      if (heartbeatEnabled) {
        const payload = buildHeartbeatPayload({ status: 'offline' });
        if (payload) {
          sendHeartbeat(payload).catch(() => {});
        }
      }

      console.log(chalk.dim('\nStopped watching.'));
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    info('Watching...');
  });
