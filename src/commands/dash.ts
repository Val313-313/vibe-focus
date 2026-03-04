import { execSync } from 'node:child_process';
import chalk from 'chalk';
import { Command } from 'commander';
import { readState, writeState } from '../core/state.js';
import { getActiveTask, getTask, updateTask, criteriaProgress } from '../core/task.js';
import { evaluateSwitch } from '../core/guardian.js';
import { calculateDailyScore, scoreLabel } from '../core/scoring.js';
import { generatePrompt } from '../generators/prompt-template.js';
import { elapsedMinutes, formatDuration, now } from '../utils/time.js';
import type { VibeFocusState, Task } from '../types/index.js';

function generatePromptSync(state: VibeFocusState, task: Task): string {
  return generatePrompt(state, task, 'detailed');
}

const g = chalk.green;
const gB = chalk.greenBright;
const gD = chalk.dim.green;
const c = chalk.cyan;
const cB = chalk.cyanBright;
const y = chalk.yellow;
const rr = chalk.red;
const dd = chalk.dim;
const bb = chalk.bold;

// ── Rendering Helpers ──

function stripAnsi(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}

function pad(content: string, w: number): string {
  const vis = stripAnsi(content);
  return content + ' '.repeat(Math.max(0, w - vis));
}

function boxTop(w: number): string {
  return gD('╔' + '═'.repeat(w - 2) + '╗');
}
function boxBot(w: number): string {
  return gD('╚' + '═'.repeat(w - 2) + '╝');
}
function boxRow(content: string, w: number): string {
  const vis = stripAnsi(content);
  const p = Math.max(0, w - 4 - vis);
  return gD('║') + ' ' + content + ' '.repeat(p) + ' ' + gD('║');
}
function boxEmpty(w: number): string {
  return gD('║') + ' '.repeat(w - 2) + gD('║');
}
function section(label: string, w: number): string {
  const rem = w - 6 - label.length - 4;
  return gD('╠──') + ' ' + gB(label) + ' ' + gD('─'.repeat(Math.max(1, rem)) + '╣');
}

function progressBar(pct: number, w: number = 20): string {
  const f = Math.round((pct / 100) * w);
  return g('[') + gB('█'.repeat(f)) + gD('░'.repeat(w - f)) + g(']');
}

function scoreGraph(score: number): string {
  const w = 15;
  const f = Math.round((score / 100) * w);
  const color = score >= 70 ? gB : score >= 50 ? y : rr;
  return g('[') + color('▓'.repeat(f)) + gD('░'.repeat(w - f)) + g(']');
}

// ── Panel Types ──

type Panel = 'tasks' | 'criteria';

interface DashState {
  panel: Panel;
  taskCursor: number;
  critCursor: number;
  message: string;
  messageColor: (s: string) => string;
  messageTimeout: ReturnType<typeof setTimeout> | null;
}

// ── Main Render ──

function render(state: VibeFocusState, ds: DashState): string {
  const W = Math.min(72, process.stdout.columns || 72);
  const lines: string[] = [];
  const active = getActiveTask(state);
  const visibleTasks = state.tasks.filter((t) => t.status !== 'abandoned');
  const score = calculateDailyScore(state);
  const nowDate = new Date();
  const timeStr = nowDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // ── Header ──
  lines.push(gB('  ┌─┐┌─┐┌─┐┌─┐  ┌─┐┌─┐┌─┐┌─┐┌─┐'));
  lines.push(gB('  └┐┘├─┤├┤ ├┤   ├┤ │ ││  │ ││└─'));
  lines.push(gD('   └ └─┘└─┘└─┘  └  └─┘└─┘└─┘└──┘') + dd('  ' + timeStr));
  lines.push('');

  // ── Main Box ──
  lines.push(boxTop(W));

  // SYS line
  lines.push(boxRow(
    gB('SYS') + dd('://') + c(state.projectName) +
    dd(' '.repeat(Math.max(1, W - 30 - state.projectName.length))) +
    dd('SCORE ') + scoreGraph(score) + ' ' + (score >= 70 ? gB : score >= 50 ? y : rr)(bb(String(score))),
    W
  ));

  // ── Active Task ──
  lines.push(section('ACTIVE TASK', W));

  if (active) {
    const { met, total } = criteriaProgress(active);
    const elapsed = active.startedAt ? elapsedMinutes(active.startedAt) : 0;
    const pct = total > 0 ? Math.round((met / total) * 100) : 0;

    lines.push(boxRow(gB('>> ') + bb(active.id.toUpperCase()) + dd(' :: ') + cB(active.title), W));
    lines.push(boxRow(
      dd('   ELAPSED ') + g(formatDuration(elapsed).padEnd(6)) +
      dd(' SWITCHES ') + (active.switchCount > 0 ? rr(String(active.switchCount)) : g('0')) +
      dd('  ') + progressBar(pct, 15) + ' ' + gB(`${pct}%`),
      W
    ));

    // Criteria with cursor
    if (total > 0 && ds.panel === 'criteria') {
      lines.push(boxEmpty(W));
      active.acceptanceCriteria.forEach((cr, i) => {
        const sel = (ds.critCursor === i) ? cB('> ') : '  ';
        const icon = cr.met ? gB('[PASS]') : y('[    ]');
        const text = cr.met ? dd(cr.text) : cr.text;
        const highlight = (ds.critCursor === i && ds.panel === 'criteria') ? chalk.bgGray : (s: string) => s;
        lines.push(boxRow(highlight(sel + icon + ' ' + text), W));
      });
    } else if (total > 0) {
      lines.push(boxRow(
        dd('   ') + active.acceptanceCriteria.map(cr =>
          cr.met ? gB('[✓]') : dd('[ ]')
        ).join(' ') + dd(` ${met}/${total}`),
        W
      ));
    }
  } else {
    lines.push(boxRow(y('>>') + dd(' NO ACTIVE TASK  ') + dd('press ') + c('ENTER') + dd(' on a task to start'), W));
  }

  // ── Task Pipeline ──
  lines.push(section(ds.panel === 'tasks' ? 'TASK PIPELINE  [navigate]' : 'TASK PIPELINE', W));
  lines.push(boxEmpty(W));

  if (visibleTasks.length === 0) {
    lines.push(boxRow(dd('   (empty)'), W));
  } else {
    visibleTasks.forEach((t, i) => {
      const { met, total: ct } = criteriaProgress(t);
      const isSelected = (ds.panel === 'tasks' && ds.taskCursor === i);

      const cursor = isSelected ? cB('> ') : '  ';
      const icon =
        t.status === 'active' ? gB('▶') :
        t.status === 'done' ? dd('✓') :
        y('○');

      const idStr = (t.status === 'active' ? gB : t.status === 'done' ? dd : y)(t.id.padEnd(5));
      const maxTitle = W - 30;
      const titleRaw = t.title.length > maxTitle ? t.title.slice(0, maxTitle - 3) + '...' : t.title;
      const titleStr =
        t.status === 'active' ? cB(titleRaw.padEnd(maxTitle)) :
        t.status === 'done' ? chalk.strikethrough.dim(titleRaw.padEnd(maxTitle)) :
        titleRaw.padEnd(maxTitle);

      const critStr = ct > 0 ? dd(`${met}/${ct}`) : dd('--');

      let miniBar = '';
      if (ct > 0) {
        const p = Math.round((met / ct) * 5);
        miniBar = g('▓'.repeat(p)) + gD('░'.repeat(5 - p));
      }

      const highlight = isSelected ? chalk.bgGray : (s: string) => s;
      lines.push(boxRow(highlight(cursor + icon + ' ' + idStr + titleStr + critStr + ' ' + miniBar), W));
    });
  }

  // ── Keybindings ──
  lines.push(section('KEYS', W));
  lines.push(boxRow(
    dd('  ') +
    g('↑↓') + dd(' navigate  ') +
    g('ENTER') + dd(' start/select  ') +
    g('SPACE') + dd(' check  ') +
    g('d') + dd(' done  ') +
    g('q') + dd(' quit'),
    W
  ));
  lines.push(boxRow(
    dd('  ') +
    g('TAB') + dd(' switch panel  ') +
    g('a') + dd(' abandon  ') +
    g('p') + dd(' prompt  ') +
    g('r') + dd(' refresh'),
    W
  ));

  // ── Message Bar ──
  if (ds.message) {
    lines.push(section('', W));
    lines.push(boxRow(dd('  ') + ds.messageColor(ds.message), W));
  }

  lines.push(boxBot(W));

  return lines.join('\n');
}

// ── Interactive Loop ──

function startInteractive(): void {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    console.log(chalk.red('Interactive dashboard requires a TTY terminal.'));
    console.log(chalk.dim('Use "vf status" for non-interactive view.'));
    process.exit(1);
  }

  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');

  let appState = readState();
  const visibleTasks = () => appState.tasks.filter(t => t.status !== 'abandoned');

  const ds: DashState = {
    panel: 'tasks',
    taskCursor: 0,
    critCursor: 0,
    message: '',
    messageColor: dd,
    messageTimeout: null,
  };

  function flash(msg: string, color: (s: string) => string = g, duration = 3000): void {
    ds.message = msg;
    ds.messageColor = color;
    if (ds.messageTimeout) clearTimeout(ds.messageTimeout);
    ds.messageTimeout = setTimeout(() => {
      ds.message = '';
      draw();
    }, duration);
  }

  function draw(): void {
    appState = readState(); // re-read for fresh data
    const output = render(appState, ds);
    process.stdout.write('\x1b[2J\x1b[H'); // clear screen + cursor home
    process.stdout.write(output + '\n');
  }

  // Auto-refresh every 30s for elapsed time updates
  const refreshTimer = setInterval(draw, 30000);

  function cleanup(): void {
    clearInterval(refreshTimer);
    if (ds.messageTimeout) clearTimeout(ds.messageTimeout);
    stdin.setRawMode(false);
    stdin.pause();
    process.stdout.write('\x1b[?25h'); // show cursor
    console.log(gD('\nvibe-focus dashboard closed.\n'));
  }

  process.stdout.write('\x1b[?25l'); // hide cursor

  stdin.on('data', (key: string) => {
    const tasks = visibleTasks();
    const active = getActiveTask(appState);

    // Ctrl+C or q = quit
    if (key === '\u0003' || key === 'q' || key === 'Q') {
      cleanup();
      process.exit(0);
    }

    // Tab = switch panel
    if (key === '\t') {
      if (active && active.acceptanceCriteria.length > 0) {
        ds.panel = ds.panel === 'tasks' ? 'criteria' : 'tasks';
        ds.critCursor = 0;
        flash(ds.panel === 'criteria' ? 'PANEL: Criteria' : 'PANEL: Tasks', c);
      }
      draw();
      return;
    }

    // Arrow up
    if (key === '\x1b[A') {
      if (ds.panel === 'tasks' && ds.taskCursor > 0) {
        ds.taskCursor--;
      } else if (ds.panel === 'criteria' && ds.critCursor > 0) {
        ds.critCursor--;
      }
      draw();
      return;
    }

    // Arrow down
    if (key === '\x1b[B') {
      if (ds.panel === 'tasks' && ds.taskCursor < tasks.length - 1) {
        ds.taskCursor++;
      } else if (ds.panel === 'criteria' && active) {
        if (ds.critCursor < active.acceptanceCriteria.length - 1) {
          ds.critCursor++;
        }
      }
      draw();
      return;
    }

    // Enter = start task / select
    if (key === '\r' || key === '\n') {
      if (ds.panel === 'tasks' && tasks.length > 0) {
        const target = tasks[ds.taskCursor];
        if (!target) { draw(); return; }

        if (target.status === 'done') {
          flash('Task already done.', y);
          draw();
          return;
        }

        if (active && active.id === target.id) {
          // Already active, switch to criteria panel
          if (active.acceptanceCriteria.length > 0) {
            ds.panel = 'criteria';
            ds.critCursor = 0;
            flash('PANEL: Criteria - use SPACE to check', c);
          }
          draw();
          return;
        }

        if (active && active.id !== target.id) {
          // Guardian pushback
          const response = evaluateSwitch(appState, active, target.id);
          flash(`GUARDIAN: ${response.message}`, rr, 5000);
          draw();
          return;
        }

        // No active task, start this one
        const timestamp = now();
        appState = updateTask(appState, target.id, {
          status: 'active',
          startedAt: target.startedAt ?? timestamp,
        });
        appState = {
          ...appState,
          activeTaskId: target.id,
          currentSession: { taskId: target.id, startedAt: timestamp, endedAt: null },
          focusEvents: [
            ...appState.focusEvents,
            { type: 'start', taskId: target.id, timestamp },
          ],
        };
        writeState(appState);
        flash(`STARTED: ${target.title}`, gB);
      }
      draw();
      return;
    }

    // Space = toggle criterion
    if (key === ' ') {
      if (ds.panel === 'criteria' && active) {
        const cr = active.acceptanceCriteria[ds.critCursor];
        if (cr) {
          const updated = active.acceptanceCriteria.map((c, i) =>
            i === ds.critCursor ? { ...c, met: !c.met } : c
          );
          appState = updateTask(appState, active.id, { acceptanceCriteria: updated });
          writeState(appState);
          const newMet = updated.filter(c => c.met).length;
          flash(`${cr.met ? 'UNCHECKED' : 'CHECKED'}: ${cr.text} (${newMet}/${updated.length})`, cr.met ? y : gB);
        }
      } else if (ds.panel === 'tasks') {
        flash('Switch to criteria panel with TAB first', y);
      }
      draw();
      return;
    }

    // d = mark done
    if (key === 'd' || key === 'D') {
      if (active) {
        const { met, total } = criteriaProgress(active);
        if (total > 0 && met < total) {
          flash(`NOT ALL CRITERIA MET (${met}/${total}). Check remaining criteria first.`, rr);
          draw();
          return;
        }
        const timestamp = now();
        appState = updateTask(appState, active.id, {
          status: 'done',
          completedAt: timestamp,
          acceptanceCriteria: active.acceptanceCriteria.map(c => ({ ...c, met: true })),
        });
        appState = {
          ...appState,
          activeTaskId: null,
          currentSession: null,
          focusEvents: [
            ...appState.focusEvents,
            { type: 'complete', taskId: active.id, timestamp },
          ],
        };
        writeState(appState);
        ds.panel = 'tasks';
        const s = calculateDailyScore(appState);
        flash(`COMPLETED: ${active.title} | Score: ${s} (${scoreLabel(s)})`, gB, 5000);
      } else {
        flash('No active task.', y);
      }
      draw();
      return;
    }

    // a = abandon
    if (key === 'a' || key === 'A') {
      if (active) {
        const timestamp = now();
        appState = updateTask(appState, active.id, {
          status: 'backlog',
        });
        appState = {
          ...appState,
          activeTaskId: null,
          currentSession: null,
          focusEvents: [
            ...appState.focusEvents,
            { type: 'abandon', taskId: active.id, timestamp },
          ],
        };
        writeState(appState);
        ds.panel = 'tasks';
        flash(`MOVED TO BACKLOG: ${active.title}`, y);
      } else {
        flash('No active task.', y);
      }
      draw();
      return;
    }

    // p = generate prompt (copy to clipboard)
    if (key === 'p' || key === 'P') {
      if (active) {
        try {
          const prompt = generatePromptSync(appState, active);
          execSync('pbcopy', { input: prompt });
          flash('PROMPT COPIED TO CLIPBOARD', gB);
        } catch {
          flash('Could not copy prompt.', rr);
        }
      } else {
        flash('No active task.', y);
      }
      draw();
      return;
    }

    // r = refresh
    if (key === 'r' || key === 'R') {
      flash('REFRESHED', c);
      draw();
      return;
    }

    // f = force switch (when guardian blocked)
    if (key === 'f' || key === 'F') {
      if (ds.panel === 'tasks' && active && tasks.length > 0) {
        const target = tasks[ds.taskCursor];
        if (target && target.id !== active.id && target.status !== 'done') {
          const timestamp = now();
          // Switch away
          appState = updateTask(appState, active.id, {
            status: 'backlog',
            switchCount: active.switchCount + 1,
          });
          // Start target
          appState = updateTask(appState, target.id, {
            status: 'active',
            startedAt: target.startedAt ?? timestamp,
          });
          appState = {
            ...appState,
            activeTaskId: target.id,
            currentSession: { taskId: target.id, startedAt: timestamp, endedAt: null },
            focusEvents: [
              ...appState.focusEvents,
              { type: 'switch_away', taskId: active.id, timestamp },
              { type: 'pushback_override', taskId: active.id, timestamp },
              { type: 'switch_to', taskId: target.id, timestamp },
            ],
          };
          writeState(appState);
          ds.panel = 'tasks';
          flash(`FORCE SWITCH: ${active.id} -> ${target.id} (score impacted!)`, rr, 5000);
        }
      }
      draw();
      return;
    }
  });

  // Initial draw
  draw();
}

export const dashCommand = new Command('dash')
  .description('Interactive focus dashboard (TUI)')
  .action(() => {
    startInteractive();
  });
