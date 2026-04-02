import chalk from 'chalk';
import { Command } from 'commander';
import { readState, updateState } from '../core/state.js';
import { getActiveTask, getAllActiveWorkers, criteriaProgress, resolveWorker } from '../core/task.js';
import { calculateDailyScore, scoreLabel } from '../core/scoring.js';
import { elapsedMinutes, formatDuration, getTodayStart } from '../utils/time.js';
import { detectChanges, stampWorkerMeta } from '../core/sync.js';
import { printChangeBanner } from '../ui/output.js';
import { isCloudLinked, readCloudConfig } from '../cloud/core/cloud-state.js';

const W = 62; // dashboard width

const g = chalk.green;       // matrix green
const gB = chalk.greenBright;
const gD = chalk.dim.green;
const c = chalk.cyan;
const cB = chalk.cyanBright;
const y = chalk.yellow;
const r = chalk.red;
const d = chalk.dim;
const b = chalk.bold;

// ── Box Drawing Helpers ──
function hLine(char: string, width: number): string {
  return char.repeat(width);
}

function boxTop(w: number): string {
  return gD('╔' + hLine('═', w - 2) + '╗');
}
function boxBot(w: number): string {
  return gD('╚' + hLine('═', w - 2) + '╝');
}
function boxMid(w: number): string {
  return gD('╠' + hLine('═', w - 2) + '╣');
}
function boxRow(content: string, w: number): string {
  // Strip ANSI to calculate visible length
  const visible = content.replace(/\x1b\[[0-9;]*m/g, '');
  const pad = Math.max(0, w - 4 - visible.length);
  return gD('║') + ' ' + content + ' '.repeat(pad) + ' ' + gD('║');
}
function boxEmpty(w: number): string {
  return gD('║') + ' '.repeat(w - 2) + gD('║');
}

function sectionHeader(label: string, w: number): string {
  const deco = hLine('─', 2);
  const visible = label.length;
  const remaining = w - 6 - visible - 4;
  return gD('╠──') + ' ' + gB(label) + ' ' + gD(hLine('─', Math.max(1, remaining)) + '╣');
}

function progressBar(percent: number, width: number = 20): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return g('[') + gB('█'.repeat(filled)) + gD('░'.repeat(empty)) + g(']');
}

function scoreGraph(score: number): string {
  const w = 20;
  const filled = Math.round((score / 100) * w);
  const empty = w - filled;
  const color = score >= 70 ? gB : score >= 50 ? y : r;
  return g('[') + color('▓'.repeat(filled)) + gD('░'.repeat(empty)) + g(']');
}

function sparkline(events: Array<{ type: string }>): string {
  // mini visualization of recent event types
  return events.slice(-20).map((e) => {
    switch (e.type) {
      case 'start': return gB('▲');
      case 'complete': return cB('●');
      case 'abandon': return r('✕');
      case 'switch_away': return y('◆');
      case 'pushback_override': return r('!');
      default: return d('·');
    }
  }).join('');
}

export const statusCommand = new Command('status')
  .description('Show the focus dashboard')
  .option('--json', 'Output as JSON')
  .option('--worker <name>', 'Identity for cross-tab sync')
  .action((opts) => {
    const state = readState();
    const worker = resolveWorker(opts);
    const workerKey = worker ?? '__default__';

    // Show cross-tab changes
    const changes = detectChanges(state, workerKey);
    printChangeBanner(changes);

    if (opts.json) {
      const active = getActiveTask(state);
      console.log(JSON.stringify({
        projectName: state.projectName,
        projectScope: state.projectScope,
        activeTask: active ? {
          id: active.id,
          title: active.title,
          ...criteriaProgress(active),
          elapsed: active.startedAt ? elapsedMinutes(active.startedAt) : 0,
        } : null,
        totalTasks: state.tasks.length,
        doneTasks: state.tasks.filter((t) => t.status === 'done').length,
        score: calculateDailyScore(state),
      }, null, 2));
      return;
    }

    const active = getActiveTask(state);
    const doneTasks = state.tasks.filter((t) => t.status === 'done');
    const backlogTasks = state.tasks.filter((t) => t.status === 'backlog');
    const abandonedCount = state.tasks.filter((t) => t.status === 'abandoned').length;
    const total = state.tasks.length;
    const score = calculateDailyScore(state);
    const now = new Date();
    const timeStr = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = now.toLocaleDateString('de-DE');

    const todayStart = getTodayStart();
    const todayEvents = state.focusEvents.filter(
      (e) => new Date(e.timestamp) >= todayStart
    );
    const todaySwitches = todayEvents.filter((e) => e.type === 'switch_away').length;
    const todayCompleted = todayEvents.filter((e) => e.type === 'complete').length;

    const lines: string[] = [];

    // ── ASCII Art Header ──
    lines.push('');
    lines.push(gB('  ██╗   ██╗██╗██████╗ ███████╗    ███████╗ ██████╗  ██████╗██╗   ██╗███████╗'));
    lines.push(gB('  ██║   ██║██║██╔══██╗██╔════╝    ██╔════╝██╔═══██╗██╔════╝██║   ██║██╔════╝'));
    lines.push(g( '  ██║   ██║██║██████╔╝█████╗      █████╗  ██║   ██║██║     ██║   ██║███████╗'));
    lines.push(gD('  ╚██╗ ██╔╝██║██╔══██╗██╔══╝      ██╔══╝  ██║   ██║██║     ██║   ██║╚════██║'));
    lines.push(gD('   ╚████╔╝ ██║██████╔╝███████╗    ██║     ╚██████╔╝╚██████╗╚██████╔╝███████║'));
    lines.push(gD('    ╚═══╝  ╚═╝╚═════╝ ╚══════╝    ╚═╝      ╚═════╝  ╚═════╝ ╚═════╝ ╚══════╝'));
    lines.push(d(`  ${hLine('─', 56)} v0.1.0`));
    lines.push('');

    // ── Main Frame ──
    lines.push(boxTop(W));
    lines.push(boxRow(
      gB('SYS') + d('://') + c(state.projectName) + d(' '.repeat(Math.max(0, 20 - state.projectName.length))) +
      d('│ ') + d(dateStr) + d(' ') + g(timeStr),
      W
    ));

    // ── Scope Section ──
    if (state.projectScope && state.projectScope.purpose) {
      lines.push(sectionHeader('PROJECT SCOPE', W));
      lines.push(boxEmpty(W));
      lines.push(boxRow(d('PURPOSE ') + c('> ') + state.projectScope.purpose, W));

      if (state.projectScope.inScope.length > 0) {
        lines.push(boxRow(d('IN      ') + state.projectScope.inScope.map(i => g('[') + gB('+') + g('] ') + i).join(d(' | ')), W));
      }
      if (state.projectScope.outOfScope.length > 0) {
        lines.push(boxRow(d('OUT     ') + state.projectScope.outOfScope.map(i => r('[') + r('x') + r('] ') + d(i)).join(d(' | ')), W));
      }
      if (state.projectScope.boundaries.length > 0) {
        lines.push(boxRow(d('BOUNDS  ') + state.projectScope.boundaries.map(i => y('~ ') + d(i)).join(d(' | ')), W));
      }
    }

    // ── Active Workers Section (multi-tab) ──
    const activeWorkers = getAllActiveWorkers(state);
    if (activeWorkers.length > 0) {
      lines.push(sectionHeader('ACTIVE WORKERS', W));
      lines.push(boxEmpty(W));
      for (const { worker, task: wTask } of activeWorkers) {
        const { met: wMet, total: wTotal } = criteriaProgress(wTask);
        const wPct = wTotal > 0 ? Math.round((wMet / wTotal) * 100) : 0;
        lines.push(boxRow(
          cB(worker.padEnd(12)) + d('→ ') + gB(wTask.id) + d(' ') + wTask.title.slice(0, 25) +
          d('  ') + g(`${wPct}%`),
          W
        ));
      }
    }

    // ── Active Task Section ──
    lines.push(sectionHeader('ACTIVE TASK', W));
    lines.push(boxEmpty(W));

    if (active) {
      const { met, total: critTotal } = criteriaProgress(active);
      const elapsed = active.startedAt ? elapsedMinutes(active.startedAt) : 0;
      const percent = critTotal > 0 ? Math.round((met / critTotal) * 100) : 0;
      const workerTag = active.worker ? d(` [${active.worker}]`) : '';

      lines.push(boxRow(gB('>> ') + b(active.id.toUpperCase()) + d(' :: ') + cB(active.title) + workerTag, W));
      lines.push(boxRow(
        d('   ELAPSED ') + g(formatDuration(elapsed).padEnd(8)) +
        d('SWITCHES ') + (active.switchCount > 0 ? r(String(active.switchCount)) : g('0')) +
        d('   STATUS ') + gB('RUNNING'),
        W
      ));

      if (critTotal > 0) {
        lines.push(boxEmpty(W));
        lines.push(boxRow(d('   CRITERIA ') + progressBar(percent, 25) + ' ' + gB(`${percent}%`) + d(` (${met}/${critTotal})`), W));
        for (const cr of active.acceptanceCriteria) {
          const icon = cr.met ? gB(' [PASS] ') : y(' [    ] ');
          const text = cr.met ? d(cr.text) : cr.text;
          lines.push(boxRow('  ' + icon + text, W));
        }
      }
    } else if (activeWorkers.length > 0) {
      lines.push(boxRow(d('>> ') + d('No default active task') + d('  |  ') + c('Workers active above'), W));
    } else {
      lines.push(boxRow(y('>> ') + d('NO ACTIVE TASK') + d('   |   ') + d('run ') + c('vf start <id>') + d(' to begin'), W));
    }

    // ── Task Pipeline ──
    lines.push(sectionHeader('TASK PIPELINE', W));
    lines.push(boxEmpty(W));

    if (total === 0) {
      lines.push(boxRow(d('   (empty) ') + d('run ') + c('vf add "..."') + d(' to create tasks'), W));
    } else {
      // Header row
      lines.push(boxRow(
        d('   ST  ID    TASK' + ' '.repeat(26) + 'CRIT    PROG'),
        W
      ));
      lines.push(boxRow(d('   ' + hLine('─', W - 8)), W));

      const visibleTasks = state.tasks.filter((t) => t.status !== 'abandoned');
      for (const t of visibleTasks) {
        const { met, total: ct } = criteriaProgress(t);
        const icon =
          t.status === 'active' ? gB('▶') :
          t.status === 'done' ? d('✓') :
          y('○');

        const idStr = (t.status === 'active' ? gB : t.status === 'done' ? d : y)(t.id.padEnd(6));
        const titleRaw = t.title.length > 27 ? t.title.slice(0, 24) + '...' : t.title;
        const titleStr =
          t.status === 'active' ? cB(titleRaw.padEnd(27)) :
          t.status === 'done' ? d(titleRaw.padEnd(27)) :
          titleRaw.padEnd(27);

        const critStr = ct > 0 ? `${met}/${ct}`.padEnd(8) : d('--'.padEnd(8));

        let progStr = '';
        if (ct > 0) {
          const pct = Math.round((met / ct) * 100);
          const mini = Math.round(pct / 10);
          progStr = g('▓'.repeat(mini)) + gD('░'.repeat(10 - mini));
        } else {
          progStr = d('──────────');
        }

        lines.push(boxRow(`   ${icon} ${idStr}${titleStr}${critStr}${progStr}`, W));
      }
    }

    // ── Focus Score ──
    lines.push(sectionHeader('FOCUS METRICS', W));
    lines.push(boxEmpty(W));

    const scoreText = scoreLabel(score).toUpperCase();
    const scoreColor = score >= 70 ? gB : score >= 50 ? y : r;
    lines.push(boxRow(
      d('   SCORE    ') + scoreGraph(score) + ' ' + scoreColor(b(String(score).padStart(3))) + d('/100') +
      '  ' + scoreColor(scoreText),
      W
    ));

    lines.push(boxRow(
      d('   TODAY    ') +
      g('▲') + d(' completed:') + gB(String(todayCompleted).padStart(2)) +
      d('   ') +
      y('◆') + d(' switches:') + (todaySwitches > 0 ? r : g)(String(todaySwitches).padStart(2)) +
      d('   ') +
      c('●') + d(' done:') + c(`${doneTasks.length}/${total}`),
      W
    ));

    // Sparkline of activity
    if (state.focusEvents.length > 0) {
      lines.push(boxRow(
        d('   ACTIVITY ') + sparkline(state.focusEvents) +
        d('  ') + d('▲start ') + cB('●done ') + y('◆switch') + r(' !force'),
        W
      ));
    }

    // ── Cloud Section ──
    lines.push(sectionHeader('CLOUD', W));
    lines.push(boxEmpty(W));

    try {
      if (isCloudLinked()) {
        const cloudCfg = readCloudConfig();
        const projectLabel = cloudCfg.projectId ? cloudCfg.projectId.slice(0, 8) + '...' : '?';
        lines.push(boxRow(
          d('   STATUS  ') + gB('♥') + g(' connected') +
          d('   PROJECT ') + c(projectLabel),
          W
        ));
      } else {
        lines.push(boxRow(
          d('   STATUS  ') + y('♥') + d(' not linked') +
          d('   run ') + c('vf setup') + d(' to connect'),
          W
        ));
      }
    } catch {
      lines.push(boxRow(d('   STATUS  ') + d('♥ unknown'), W));
    }

    // ── Recent Log ──
    const recent = state.focusEvents.slice(-5).reverse();
    if (recent.length > 0) {
      lines.push(sectionHeader('EVENT LOG', W));
      lines.push(boxEmpty(W));

      for (const e of recent) {
        const time = new Date(e.timestamp).toLocaleTimeString('de-DE', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        const icon =
          e.type === 'start' ? gB('>>>') :
          e.type === 'complete' ? cB('[+]') :
          e.type === 'abandon' ? r('[x]') :
          e.type === 'switch_away' ? y('[~]') :
          e.type === 'switch_to' ? c('[>]') :
          r('[!]');
        const label =
          e.type === 'start' ? 'STARTED' :
          e.type === 'complete' ? 'COMPLETED' :
          e.type === 'abandon' ? 'ABANDONED' :
          e.type === 'switch_away' ? 'SWITCH_OUT' :
          e.type === 'switch_to' ? 'SWITCH_IN' :
          'OVERRIDE';

        lines.push(boxRow(
          d('   ') + d(time) + ' ' + icon + ' ' + d(label.padEnd(12)) + c(e.taskId),
          W
        ));
      }
    }

    // ── Quick Commands ──
    lines.push(sectionHeader('COMMANDS', W));
    lines.push(boxEmpty(W));

    if (active) {
      lines.push(boxRow(d('   ') + g('$') + c(' vf check <id>') + d('  mark criteria as met'), W));
      lines.push(boxRow(d('   ') + g('$') + c(' vf done') + d('        complete current task'), W));
      lines.push(boxRow(d('   ') + g('$') + c(' vf prompt') + d('      generate focused prompt'), W));
      lines.push(boxRow(d('   ') + g('$') + c(' vf scope --rules') + d(' write .claude/rules/'), W));
    } else if (backlogTasks.length > 0) {
      const next = backlogTasks[0];
      lines.push(boxRow(d('   ') + g('$') + c(` vf start ${next.id}`) + d(`    start "${next.title}"`), W));
    } else {
      lines.push(boxRow(d('   ') + g('$') + c(' vf add "..."') + d('   add your first task'), W));
    }

    lines.push(boxEmpty(W));
    lines.push(boxBot(W));
    lines.push('');

    console.log(lines.join('\n'));

    // Stamp worker meta so we don't re-show the same changes
    updateState((s) => ({ ...s, workerMeta: stampWorkerMeta(s, workerKey) }));
  });
