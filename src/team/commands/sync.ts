import { execFileSync, execSync } from 'node:child_process';
import { Command } from 'commander';
import { writePresence } from '../core/presence.js';
import { getUsername } from '../core/team-state.js';

export const syncCommand = new Command('sync')
  .description('Sync team presence files via Git (commit + pull + push)')
  .option('--quiet', 'Suppress output')
  .action((opts) => {
    const username = getUsername();
    const log = opts.quiet ? (() => {}) : console.log;

    // 1. Update own presence file
    try {
      writePresence();
      log('  Updated presence file.');
    } catch (e: any) {
      log(`  Warning: Could not update presence: ${e.message}`);
    }

    // 2. Stage team files (hardcoded paths, no user input)
    try {
      execFileSync('git', ['add', '.vibe-focus/team/workers/', '.vibe-focus/team/config.json'], {
        stdio: 'pipe',
        encoding: 'utf-8',
      });
    } catch {
      // Nothing to stage is fine
    }

    // 3. Commit - use execFileSync to avoid shell injection via username
    try {
      const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
      execFileSync('git', ['commit', '--no-verify', '-m', `vft: heartbeat ${username} ${time}`], {
        stdio: 'pipe',
        encoding: 'utf-8',
      });
      log('  Committed presence update.');
    } catch {
      // Nothing to commit is fine
      log('  No changes to commit.');
    }

    // 4. Pull (rebase to avoid merge commits)
    try {
      const result = execFileSync('git', ['pull', '--rebase'], {
        stdio: 'pipe',
        encoding: 'utf-8',
      });
      log('  Pulled latest: ' + result.trim().split('\n')[0]);
    } catch (e: any) {
      // Abort failed rebase to keep repo in clean state
      try {
        execFileSync('git', ['rebase', '--abort'], { stdio: 'pipe' });
      } catch { /* not in rebase state */ }
      log('  Warning: Pull failed (rebase aborted): ' + (e.stderr || e.message).split('\n')[0]);
    }

    // 5. Push
    try {
      execFileSync('git', ['push'], {
        stdio: 'pipe',
        encoding: 'utf-8',
      });
      log('  Pushed to remote.');
    } catch (e: any) {
      log('  Warning: Push failed: ' + (e.stderr || e.message).split('\n')[0]);
      // Retry once
      try {
        execFileSync('git', ['pull', '--rebase'], { stdio: 'pipe', encoding: 'utf-8' });
        execFileSync('git', ['push'], { stdio: 'pipe', encoding: 'utf-8' });
        log('  Retry succeeded.');
      } catch {
        // Abort any stuck rebase
        try { execFileSync('git', ['rebase', '--abort'], { stdio: 'pipe' }); } catch {}
        log('  Sync incomplete - will retry next time.');
      }
    }

    log('');
    log('  Sync complete.');
  });
