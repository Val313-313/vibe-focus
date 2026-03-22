import chalk from 'chalk';
import { Command } from 'commander';
import { readState } from '../core/state.js';
import { getDailyHistory, getStreak, getAverageScore } from '../core/history.js';
import { scoreLabel } from '../core/scoring.js';

const g = chalk.green;
const gB = chalk.greenBright;
const gD = chalk.dim.green;
const c = chalk.cyan;
const cB = chalk.cyanBright;
const y = chalk.yellow;
const r = chalk.red;
const d = chalk.dim;
const b = chalk.bold;

function hLine(char: string, width: number): string {
  return char.repeat(width);
}

function boxTop(w: number): string {
  return gD('╔' + hLine('═', w - 2) + '╗');
}
function boxBot(w: number): string {
  return gD('╚' + hLine('═', w - 2) + '╝');
}
function boxRow(content: string, w: number): string {
  const visible = content.replace(/\x1b\[[0-9;]*m/g, '');
  const pad = Math.max(0, w - 4 - visible.length);
  return gD('║') + ' ' + content + ' '.repeat(pad) + ' ' + gD('║');
}
function boxEmpty(w: number): string {
  return gD('║') + ' '.repeat(w - 2) + gD('║');
}
function sectionHeader(label: string, w: number): string {
  const remaining = w - 6 - label.length - 4;
  return gD('╠──') + ' ' + gB(label) + ' ' + gD(hLine('─', Math.max(1, remaining)) + '╣');
}

function scoreColor(score: number): (s: string) => string {
  return score >= 70 ? gB : score >= 50 ? y : r;
}

function miniBar(score: number, width: number = 15): string {
  const filled = Math.round((score / 100) * width);
  const color = scoreColor(score);
  return g('[') + color('▓'.repeat(filled)) + gD('░'.repeat(width - filled)) + g(']');
}

function trendArrow(history: { score: number }[]): string {
  if (history.length < 2) return d('—');
  const last = history[history.length - 1].score;
  const prev = history[history.length - 2].score;
  const diff = last - prev;
  if (diff > 5) return gB('▲ +' + diff);
  if (diff < -5) return r('▼ ' + diff);
  return y('► ' + (diff >= 0 ? '+' : '') + diff);
}

function formatDate(dateStr: string): string {
  const [, month, day] = dateStr.split('-');
  const weekday = new Date(dateStr + 'T12:00:00Z').toLocaleDateString('de-DE', { weekday: 'short' });
  return `${weekday} ${day}.${month}`;
}

export const historyCommand = new Command('history')
  .description('Show focus history and trends')
  .option('-n, --days <n>', 'Number of days to show', '14')
  .option('--json', 'Output as JSON')
  .action((opts) => {
    const state = readState();
    const maxDays = parseInt(opts.days, 10) || 14;
    const history = getDailyHistory(state, maxDays);

    if (opts.json) {
      console.log(JSON.stringify({
        history,
        averageScore: getAverageScore(history),
        streak: getStreak(history),
      }, null, 2));
      return;
    }

    const W = 62;
    const lines: string[] = [];

    lines.push('');
    lines.push(boxTop(W));
    lines.push(boxRow(gB('SYS') + d('://') + c(state.projectName) + d(' > ') + cB('FOCUS HISTORY'), W));

    if (history.length === 0) {
      lines.push(sectionHeader('NO DATA', W));
      lines.push(boxEmpty(W));
      lines.push(boxRow(d('   Noch keine Focus-Events. Starte mit ') + c('vf start <id>'), W));
      lines.push(boxEmpty(W));
      lines.push(boxBot(W));
      console.log(lines.join('\n'));
      return;
    }

    // ── Summary ──
    const avg = getAverageScore(history);
    const streak = getStreak(history);
    const totalCompleted = history.reduce((s, h) => s + h.tasksCompleted, 0);
    const totalSwitches = history.reduce((s, h) => s + h.tasksSwitched, 0);

    lines.push(sectionHeader('SUMMARY', W));
    lines.push(boxEmpty(W));
    lines.push(boxRow(
      d('   AVG SCORE  ') + miniBar(avg, 12) + ' ' + scoreColor(avg)(b(String(avg))) +
      d('   STREAK ') + (streak > 0 ? gB(b(streak + 'd')) : r('0d')) +
      d('   TREND ') + trendArrow(history),
      W
    ));
    lines.push(boxRow(
      d('   COMPLETED  ') + gB(String(totalCompleted)) +
      d('   SWITCHES ') + (totalSwitches > 0 ? r(String(totalSwitches)) : g('0')) +
      d('   DAYS ') + c(String(history.length)),
      W
    ));

    // ── Daily Chart ──
    lines.push(sectionHeader('DAILY SCORES', W));
    lines.push(boxEmpty(W));

    // Sparkline overview
    const sparkline = history.map(h => {
      const char = h.score >= 70 ? '█' : h.score >= 50 ? '▓' : h.score >= 25 ? '▒' : '░';
      return scoreColor(h.score)(char);
    }).join('');
    lines.push(boxRow(d('   TREND ') + sparkline + d('  (' + history.length + ' days)'), W));
    lines.push(boxEmpty(W));

    // Table header
    lines.push(boxRow(
      d('   DATE        SCORE  BAR              DONE  SW  ABN'),
      W
    ));
    lines.push(boxRow(d('   ' + hLine('─', W - 8)), W));

    // Daily rows
    for (const day of history) {
      const dateStr = formatDate(day.date);
      const sc = scoreColor(day.score);
      const bar = miniBar(day.score, 10);
      const doneStr = day.tasksCompleted > 0 ? gB(String(day.tasksCompleted).padStart(3)) : d('  0');
      const swStr = day.tasksSwitched > 0 ? r(String(day.tasksSwitched).padStart(3)) : d('  0');
      const abnStr = day.tasksAbandoned > 0 ? r(String(day.tasksAbandoned).padStart(3)) : d('  0');

      lines.push(boxRow(
        d('   ') + c(dateStr.padEnd(11)) +
        sc(String(day.score).padStart(4)) + d('  ') +
        bar + '  ' +
        doneStr + swStr + abnStr,
        W
      ));
    }

    // ── Score Legend ──
    lines.push(boxEmpty(W));
    lines.push(boxRow(
      d('   ') + gB('90-100') + d(' Deep Focus  ') +
      g('70-89') + d(' Good  ') +
      y('50-69') + d(' Moderate  ') +
      r('<50') + d(' Collapse'),
      W
    ));

    lines.push(boxEmpty(W));
    lines.push(boxBot(W));
    lines.push('');

    console.log(lines.join('\n'));
  });
