import fs from 'node:fs';
import { Command } from 'commander';
import chalk from 'chalk';
import { readState, getStatePath } from '../core/state.js';
import { getActiveTask, criteriaProgress } from '../core/task.js';
import { calculateDailyScore, scoreLabel } from '../core/scoring.js';
import { elapsedMinutes, formatDuration } from '../utils/time.js';
import type { VibeFocusState } from '../types/index.js';

const g = chalk.green;
const gB = chalk.greenBright;
const gD = chalk.dim.green;
const c = chalk.cyan;
const cB = chalk.cyanBright;
const y = chalk.yellow;
const r = chalk.red;
const d = chalk.dim;
const b = chalk.bold;

function getTermWidth(): number {
  return Math.min(process.stdout.columns || 50, 60);
}

function hLine(ch: string, w: number): string {
  return ch.repeat(Math.max(0, w));
}

function pad(content: string, w: number): string {
  const visible = content.replace(/\x1b\[[0-9;]*m/g, '');
  const p = Math.max(0, w - 2 - visible.length);
  return gD('│') + content + ' '.repeat(p) + gD('│');
}

function render(state: VibeFocusState): string {
  const W = getTermWidth();
  const inner = W - 2;
  const lines: string[] = [];
  const active = getActiveTask(state);
  const score = calculateDailyScore(state);
  const noteCount = (state.notes || []).filter(n => !n.promoted).length;
  const now = new Date();
  const time = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEvents = state.focusEvents.filter(e => new Date(e.timestamp) >= todayStart);
  const todaySwitches = todayEvents.filter(e => e.type === 'switch_away').length;
  const todayCompleted = todayEvents.filter(e => e.type === 'complete').length;

  // ── Header ──
  lines.push(gD('┌' + hLine('─', inner) + '┐'));
  lines.push(pad(' ' + gB('VIBE FOCUS') + d(' ◈ ') + c(state.projectName) + d(' '.repeat(Math.max(0, inner - 18 - state.projectName.length - time.length))) + d(time), W));
  lines.push(gD('├' + hLine('─', inner) + '┤'));

  // ── Active Task ──
  if (active) {
    const { met, total } = criteriaProgress(active);
    const pct = total > 0 ? Math.round((met / total) * 100) : 0;
    const elapsed = active.startedAt ? elapsedMinutes(active.startedAt) : 0;
    const barW = Math.max(8, inner - 30);
    const filled = Math.round((pct / 100) * barW);
    const empty = barW - filled;
    const bar = gB('█'.repeat(filled)) + gD('░'.repeat(empty));

    lines.push(pad(' ' + gB('▶ ') + b(active.id.toUpperCase()) + d(' ') + cB(active.title.slice(0, inner - 10)), W));
    lines.push(pad(' ' + d('  ') + bar + ' ' + gB(`${pct}%`) + d(` ${met}/${total}`) + d('  ⏱ ') + g(formatDuration(elapsed)), W));

    // Criteria
    if (total > 0) {
      lines.push(gD('├' + hLine('╌', inner) + '┤'));
      for (const cr of active.acceptanceCriteria) {
        const icon = cr.met ? gB('✓') : y('○');
        const txt = cr.met ? d(cr.text) : cr.text;
        lines.push(pad(' ' + icon + ' ' + txt.slice(0, inner - 6), W));
      }
    }
  } else {
    lines.push(pad(' ' + y('◇') + d(' NO ACTIVE TASK') + d('  →  ') + c('vf start <id>'), W));
  }

  // ── Notes (Parking Lot) ──
  if (noteCount > 0) {
    lines.push(gD('├' + hLine('─', inner) + '┤'));
    lines.push(pad(' ' + y('⚑ ') + b('PARKED') + d(` ${noteCount} note${noteCount > 1 ? 's' : ''}`) + d('  →  ') + c('vf note --list'), W));

    const recentNotes = (state.notes || []).filter(n => !n.promoted).slice(-3);
    for (const note of recentNotes) {
      lines.push(pad(' ' + d('  ') + d(note.id) + ' ' + y(note.text.slice(0, inner - 10)), W));
    }
  }

  // ── Backlog ──
  const backlog = state.tasks.filter(t => t.status === 'backlog');
  const done = state.tasks.filter(t => t.status === 'done');
  if (backlog.length > 0 || done.length > 0) {
    lines.push(gD('├' + hLine('─', inner) + '┤'));
    for (const t of backlog.slice(0, 4)) {
      const { met, total } = criteriaProgress(t);
      const critInfo = total > 0 ? d(` ${met}/${total}`) : '';
      lines.push(pad(' ' + d('○ ') + d(t.id) + ' ' + t.title.slice(0, inner - 14) + critInfo, W));
    }
    if (backlog.length > 4) {
      lines.push(pad(' ' + d(`  +${backlog.length - 4} more in backlog`), W));
    }
    if (done.length > 0) {
      lines.push(pad(' ' + d(`  ✓ ${done.length} task${done.length > 1 ? 's' : ''} completed`), W));
    }
  }

  // ── Focus Score ──
  lines.push(gD('├' + hLine('─', inner) + '┤'));
  const scoreColor = score >= 70 ? gB : score >= 50 ? y : r;
  const sLabel = scoreLabel(score).toUpperCase();
  const miniBar = Math.round(score / 5);
  const scoreBar = scoreColor('▓'.repeat(miniBar)) + gD('░'.repeat(20 - miniBar));

  lines.push(pad(
    ' ' + d('SCORE ') + scoreBar + ' ' + scoreColor(b(String(score))) +
    d(' │ ') + g('▲') + gB(String(todayCompleted)) +
    d(' ') + y('◆') + (todaySwitches > 0 ? r : g)(String(todaySwitches)) +
    d(' ') + y('⚑') + y(String(noteCount)) +
    d('  ') + scoreColor(sLabel),
    W
  ));

  // ── Footer ──
  lines.push(gD('└' + hLine('─', inner) + '┘'));

  return lines.join('\n');
}

function clearScreen(): void {
  process.stdout.write('\x1b[2J\x1b[H');
}

export const watchCommand = new Command('watch')
  .description('Live mini-dashboard that auto-updates (run in a tmux split pane)')
  .option('--interval <ms>', 'Refresh interval in ms (default: watch for changes)', '0')
  .action((opts) => {
    if (!process.stdout.isTTY) {
      console.error(chalk.red('vf watch requires a TTY terminal.'));
      console.error(chalk.dim('Run in a separate terminal pane, not inside Claude Code.'));
      process.exit(1);
    }

    let statePath: string;
    try {
      statePath = getStatePath();
    } catch {
      console.error(chalk.red('Not a vibe-focus project. Run "vf init" first.'));
      process.exit(1);
    }

    const draw = () => {
      try {
        const state = readState();
        clearScreen();
        console.log(render(state));
        console.log(d('  watching for changes... (ctrl+c to quit)'));
      } catch {
        // State file might be mid-write, skip this frame
      }
    };

    // Initial draw
    draw();

    const interval = parseInt(opts.interval, 10);

    if (interval > 0) {
      // Poll mode
      setInterval(draw, interval);
    } else {
      // File watch mode (more responsive)
      let debounce: ReturnType<typeof setTimeout> | null = null;
      fs.watch(statePath, () => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(draw, 100);
      });

      // Also refresh every 30s for elapsed time updates
      setInterval(draw, 30000);
    }

    // Handle graceful exit
    process.on('SIGINT', () => {
      clearScreen();
      console.log(gB('  vibe-focus watch stopped.'));
      process.exit(0);
    });
  });
