import { Command } from 'commander';
import chalk from 'chalk';
import { readCloudConfig, isValidUUID } from '../core/cloud-state.js';
import { supabaseQuery } from '../core/api.js';
import { error } from '../../ui/output.js';
import type {
  CloudPresenceRow,
  CloudMemberRow,
  CloudActivityRow,
  CloudSessionRow,
} from '../types.js';

const g = chalk.green;
const gB = chalk.greenBright;
const gD = chalk.dim.green;
const c = chalk.cyan;
const cB = chalk.cyanBright;
const y = chalk.yellow;
const r = chalk.red;
const d = chalk.dim;
const b = chalk.bold;

type PresenceStatus = 'active' | 'idle' | 'away';

function classifyPresence(lastHeartbeat: string): PresenceStatus | 'offline' {
  const ageMs = Date.now() - new Date(lastHeartbeat).getTime();
  const minutes = ageMs / 60_000;
  if (minutes < 5) return 'active';
  if (minutes < 15) return 'idle';
  if (minutes < 60) return 'away';
  return 'offline';
}

function presenceIcon(status: PresenceStatus): string {
  switch (status) {
    case 'active': return gB('\u25cf');
    case 'idle': return y('\u25d0');
    case 'away': return r('\u25cb');
  }
}

function presenceColor(status: PresenceStatus): (s: string) => string {
  switch (status) {
    case 'active': return gB;
    case 'idle': return y;
    case 'away': return r;
  }
}

function formatAge(isoStr: string): string {
  const ageMs = Date.now() - new Date(isoStr).getTime();
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Box drawing helpers (matching team status style)
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

export const pullCommand = new Command('pull')
  .description('Show full project dashboard from vibeteamz')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    let config;
    try {
      config = readCloudConfig();
    } catch {
      error('Cloud config is corrupted. Re-run "vf cloud login".');
      return;
    }

    if (!config.accessToken || !config.userId || !config.projectId) {
      error('Cloud not configured. Run "vf cloud login" then "vf cloud link <id>".');
      return;
    }

    if (!isValidUUID(config.projectId)) {
      error('Invalid project ID in cloud config.');
      return;
    }

    const pid = config.projectId;

    // Fetch all 4 queries in parallel
    const [membersResult, presenceResult, activityResult, sessionsResult] = await Promise.all([
      supabaseQuery<CloudMemberRow>(
        'members',
        `project_id=eq.${pid}&select=user_id,role,joined_at,profiles(username,display_name,availability,score,streak_days)&order=joined_at.asc`,
      ),
      supabaseQuery<CloudPresenceRow>(
        'presence',
        `project_id=eq.${pid}&select=user_id,task_id,task_title,progress_met,progress_total,focus_score,status,last_heartbeat,profiles(username,display_name)`,
      ),
      supabaseQuery<CloudActivityRow>(
        'activity',
        `project_id=eq.${pid}&select=id,type,message,created_at,profiles(username)&order=created_at.desc&limit=10`,
      ),
      supabaseQuery<CloudSessionRow>(
        'sessions',
        `project_id=eq.${pid}&select=id,started_by,started_at,ended_at,participants&order=started_at.desc&limit=5`,
      ),
    ]);

    if (opts.json) {
      console.log(JSON.stringify({
        members: membersResult.success ? membersResult.data : [],
        presence: presenceResult.success ? presenceResult.data : [],
        activity: activityResult.success ? activityResult.data : [],
        sessions: sessionsResult.success ? sessionsResult.data : [],
      }, null, 2));
      return;
    }

    const W = 68;
    const lines: string[] = [];

    lines.push('');
    lines.push(boxTop(W));
    lines.push(boxRow(
      gB('CLOUD') + d('://') + c('vibeteamz') + d(' > ') + cB('PROJECT DASHBOARD'),
      W,
    ));

    // -- TEAM MEMBERS --
    lines.push(sectionHeader('TEAM MEMBERS', W));
    lines.push(boxEmpty(W));

    if (membersResult.success && membersResult.data.length > 0) {
      for (const m of membersResult.data) {
        const username = m.profiles?.username ?? m.user_id.slice(0, 8);
        const role = d(m.role.padEnd(8));
        const avail = m.profiles?.availability ?? 'unknown';
        const availColor = avail === 'available' ? g : avail === 'busy' ? y : d;
        const availStr = availColor(avail.padEnd(14));
        const score = String(m.profiles?.score ?? 0).padEnd(7);
        const streak = m.profiles?.streak_days ? `${m.profiles.streak_days}d streak` : '';

        lines.push(boxRow(
          '   ' + gB('\u25cf') + ' ' + cB(username.padEnd(12)) + role + availStr + score + d(streak),
          W,
        ));
      }
    } else {
      lines.push(boxRow(d('   No members found.'), W));
    }

    // -- ONLINE NOW --
    lines.push(sectionHeader('ONLINE NOW', W));
    lines.push(boxEmpty(W));

    if (presenceResult.success && presenceResult.data.length > 0) {
      const onlineRows: Array<CloudPresenceRow & { ps: PresenceStatus }> = [];
      for (const p of presenceResult.data) {
        const status = classifyPresence(p.last_heartbeat);
        if (status !== 'offline') {
          onlineRows.push({ ...p, ps: status });
        }
      }

      if (onlineRows.length > 0) {
        const order: Record<PresenceStatus, number> = { active: 0, idle: 1, away: 2 };
        onlineRows.sort((a, b) => order[a.ps] - order[b.ps]);

        for (const row of onlineRows) {
          const username = row.profiles?.username ?? row.user_id.slice(0, 8);
          const icon = presenceIcon(row.ps);
          const color = presenceColor(row.ps);
          const nameStr = color(username.padEnd(12));
          const statusStr = color(row.ps.padEnd(8));
          const taskStr = row.task_id
            ? (b(row.task_id) + ': ' + (row.task_title ?? '').slice(0, 16)).padEnd(24)
            : d('\u2014'.padEnd(24));
          const pctStr = row.progress_total > 0
            ? `${Math.round((row.progress_met / row.progress_total) * 100)}%`.padEnd(6)
            : d('\u2014'.padEnd(6));
          const ageStr = formatAge(row.last_heartbeat);

          lines.push(boxRow(
            '   ' + icon + ' ' + nameStr + statusStr + taskStr + pctStr + d(ageStr),
            W,
          ));
        }
      } else {
        lines.push(boxRow(d('   No teammates online.'), W));
      }
    } else {
      lines.push(boxRow(d('   No presence data.'), W));
    }

    // -- RECENT ACTIVITY --
    lines.push(sectionHeader('RECENT ACTIVITY', W));
    lines.push(boxEmpty(W));

    if (activityResult.success && activityResult.data.length > 0) {
      for (const a of activityResult.data.slice(0, 8)) {
        const username = a.profiles?.username ?? '???';
        const msg = a.message ?? a.type;
        const age = formatAge(a.created_at);
        const msgTrimmed = msg.length > 38 ? msg.slice(0, 35) + '...' : msg;

        lines.push(boxRow(
          '   ' + cB(username.padEnd(8)) + d(msgTrimmed.padEnd(40)) + d(age),
          W,
        ));
      }
    } else {
      lines.push(boxRow(d('   No recent activity.'), W));
    }

    // -- SESSIONS --
    if (sessionsResult.success && sessionsResult.data.length > 0) {
      const activeSessions = sessionsResult.data.filter(s => !s.ended_at);
      if (activeSessions.length > 0) {
        lines.push(sectionHeader('ACTIVE SESSIONS', W));
        lines.push(boxEmpty(W));

        for (const s of activeSessions) {
          const started = formatAge(s.started_at);
          const participants = Array.isArray(s.participants) ? s.participants.length : 0;
          lines.push(boxRow(
            '   ' + g('\u25b6') + d(` Started ${started}`) + d(` \u00b7 ${participants} participant${participants !== 1 ? 's' : ''}`),
            W,
          ));
        }
      }
    }

    lines.push(boxEmpty(W));
    lines.push(boxBot(W));
    lines.push('');

    console.log(lines.join('\n'));
  });
