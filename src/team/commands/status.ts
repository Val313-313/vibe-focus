import chalk from 'chalk';
import { Command } from 'commander';
import { readState } from '../../core/state.js';
import { resolveActiveTask, criteriaProgress } from '../../core/task.js';
import { readTeamConfig, getUsername } from '../core/team-state.js';
import { readAllPresence, getCoworkers, detectConflicts, writePresence } from '../core/presence.js';
import { getActiveFiles } from '../core/file-tracker.js';
import type { StalenessLevel } from '../types.js';

const g = chalk.green;
const gB = chalk.greenBright;
const gD = chalk.dim.green;
const c = chalk.cyan;
const cB = chalk.cyanBright;
const y = chalk.yellow;
const r = chalk.red;
const d = chalk.dim;
const b = chalk.bold;

function stalenessColor(level: StalenessLevel): (s: string) => string {
  switch (level) {
    case 'active': return gB;
    case 'idle': return y;
    case 'away': return r;
    case 'offline': return d;
  }
}

function stalenessIcon(level: StalenessLevel): string {
  switch (level) {
    case 'active': return gB('\u25cf');
    case 'idle': return y('\u25d0');
    case 'away': return r('\u25cb');
    case 'offline': return d('\u25cb');
  }
}

function formatAge(minutes: number): string {
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function hLine(char: string, width: number): string {
  return char.repeat(width);
}
function boxTop(w: number): string {
  return gD('\u2554' + hLine('\u2550', w - 2) + '\u2557');
}
function boxBot(w: number): string {
  return gD('\u255a' + hLine('\u2550', w - 2) + '\u255d');
}
function boxRow(content: string, w: number): string {
  const visible = content.replace(/\x1b\[[0-9;]*m/g, '');
  const pad = Math.max(0, w - 4 - visible.length);
  return gD('\u2551') + ' ' + content + ' '.repeat(pad) + ' ' + gD('\u2551');
}
function boxEmpty(w: number): string {
  return gD('\u2551') + ' '.repeat(w - 2) + gD('\u2551');
}
function sectionHeader(label: string, w: number): string {
  const remaining = w - 6 - label.length - 4;
  return gD('\u2560\u2500\u2500') + ' ' + gB(label) + ' ' + gD(hLine('\u2500', Math.max(1, remaining)) + '\u2563');
}

export const statusCommand = new Command('status')
  .description('Show team members and their current focus state')
  .option('--json', 'Output as JSON')
  .action((opts) => {
    // Bump own heartbeat
    try {
      writePresence();
    } catch {
      // Might not be initialized yet
    }

    let teamConfig;
    try {
      teamConfig = readTeamConfig();
    } catch (e: any) {
      console.error(e.message);
      return;
    }

    const username = getUsername();
    const allPresence = readAllPresence();
    const coworkers = getCoworkers(
      teamConfig.settings.staleThresholdMinutes,
      teamConfig.settings.offlineThresholdMinutes,
    );
    const myFiles = getActiveFiles();
    const conflicts = detectConflicts(myFiles, coworkers);

    if (opts.json) {
      console.log(JSON.stringify({ username, team: teamConfig, workers: allPresence, coworkers, conflicts }, null, 2));
      return;
    }

    const W = 68;
    const lines: string[] = [];

    lines.push('');
    lines.push(boxTop(W));
    lines.push(boxRow(
      gB('TEAM') + d('://') + c(teamConfig.teamName) + d(' > ') + cB('COWORKER AWARENESS'),
      W,
    ));

    // -- Team Members --
    lines.push(sectionHeader('TEAM MEMBERS', W));
    lines.push(boxEmpty(W));

    if (allPresence.length === 0) {
      lines.push(boxRow(d('   No team members found. Run: vf team init --user <name>'), W));
    } else {
      lines.push(boxRow(
        d('   USER          STATUS    TASK                  PROGRESS  HEARTBEAT'),
        W,
      ));
      lines.push(boxRow(d('   ' + hLine('\u2500', W - 8)), W));

      for (const presence of allPresence) {
        const isMe = presence.username === username;
        const cw = coworkers.find((c) => c.presence.username === presence.username);
        const staleness = cw?.staleness ?? 'active';
        const age = cw?.heartbeatAge ?? 0;

        const icon = stalenessIcon(isMe ? 'active' : staleness);
        const nameColor = isMe ? cB : stalenessColor(staleness);
        const nameStr = nameColor((presence.username + (isMe ? ' (you)' : '')).padEnd(14));

        const statusStr = presence.taskStatus === 'active'
          ? g('active'.padEnd(10))
          : d('idle'.padEnd(10));

        const taskStr = presence.taskId
          ? (b(presence.taskId) + ' ' + (presence.taskTitle ?? '').slice(0, 16)).padEnd(22)
          : d('\u2014'.padEnd(22));

        const pctStr = presence.taskId
          ? (presence.progress.percent + '%').padEnd(10)
          : d('\u2014'.padEnd(10));

        const ageStr = isMe ? g('now'.padEnd(9)) : stalenessColor(staleness)(formatAge(age).padEnd(9));

        lines.push(boxRow(
          '   ' + icon + ' ' + nameStr + statusStr + taskStr + pctStr + ageStr,
          W,
        ));
      }
    }

    // -- Conflicts --
    if (conflicts.length > 0) {
      lines.push(sectionHeader('CONFLICTS', W));
      lines.push(boxEmpty(W));

      for (const conflict of conflicts) {
        const severity = conflict.type === 'file_collision' ? r('FILE') : y('DIR');
        const who = conflict.coworkers.join(', ');
        lines.push(boxRow(
          '   ' + severity + d(' ') + r(conflict.files.join(', ').slice(0, 35)) +
          d(' \u2190 ') + c(who),
          W,
        ));
      }
    }

    // -- Active Files --
    if (myFiles.length > 0) {
      lines.push(sectionHeader('YOUR ACTIVE FILES', W));
      lines.push(boxEmpty(W));
      for (const file of myFiles.slice(0, 8)) {
        lines.push(boxRow('   ' + d(file), W));
      }
      if (myFiles.length > 8) {
        lines.push(boxRow('   ' + d(`... and ${myFiles.length - 8} more`), W));
      }
    }

    lines.push(boxEmpty(W));
    lines.push(boxBot(W));
    lines.push('');

    console.log(lines.join('\n'));
  });
