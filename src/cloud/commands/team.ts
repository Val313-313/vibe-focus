import { Command } from 'commander';
import chalk from 'chalk';
import { readCloudConfig, isValidUUID } from '../core/cloud-state.js';
import { supabaseQuery } from '../core/api.js';
import { readCloudCache } from '../core/cloud-cache.js';
import { error, info } from '../../ui/output.js';
import type { CloudPresenceRow, HeartbeatSuggestion } from '../types.js';

const g = chalk.green;
const gB = chalk.greenBright;
const y = chalk.yellow;
const r = chalk.red;
const d = chalk.dim;

type PresenceStatus = 'active' | 'idle' | 'away';

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

function classifyPresence(lastHeartbeat: string): PresenceStatus | 'offline' {
  const ageMs = Date.now() - new Date(lastHeartbeat).getTime();
  const minutes = ageMs / 60_000;
  if (minutes < 5) return 'active';
  if (minutes < 15) return 'idle';
  if (minutes < 60) return 'away';
  return 'offline';
}

function formatAge(lastHeartbeat: string): string {
  const ageMs = Date.now() - new Date(lastHeartbeat).getTime();
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export const teamCommand = new Command('team')
  .description('Show who is online in your vibeteamz project')
  .action(async () => {
    let config;
    try {
      config = readCloudConfig();
    } catch {
      error('Cloud config is corrupted. Re-run "vf cloud login".');
      return;
    }

    if (!(config.accessToken || config.apiKey) || !config.userId || !config.projectId) {
      error('Cloud not configured. Run "vf vibeteamz login" then "vf vibeteamz link <id>".');
      return;
    }

    if (!isValidUUID(config.projectId)) {
      error('Invalid project ID in cloud config.');
      return;
    }

    const result = await supabaseQuery<CloudPresenceRow>(
      'presence',
      `project_id=eq.${config.projectId}&select=user_id,task_id,task_title,progress_met,progress_total,focus_score,status,last_heartbeat,profiles(username,display_name)`,
    );

    if (!result.success) {
      error(`Failed to fetch team data: ${result.error}`);
      return;
    }

    // Filter out offline (>60min) and sort by status
    const online: Array<CloudPresenceRow & { presence: PresenceStatus }> = [];
    for (const row of result.data) {
      const status = classifyPresence(row.last_heartbeat);
      if (status !== 'offline') {
        online.push({ ...row, presence: status });
      }
    }

    // Sort: active first, then idle, then away
    const order: Record<PresenceStatus, number> = { active: 0, idle: 1, away: 2 };
    online.sort((a, b) => order[a.presence] - order[b.presence]);

    console.log('');
    if (online.length === 0) {
      console.log(d('  No teammates online.'));
      console.log('');
      info('Use "vf cloud pull" for the full project dashboard.');
      return;
    }

    console.log(gB('  ONLINE') + d(' (vibeteamz)'));

    for (const row of online) {
      const username = row.profiles?.username ?? row.user_id.slice(0, 8);
      const icon = presenceIcon(row.presence);
      const color = presenceColor(row.presence);
      const nameStr = color(username.padEnd(12));
      const statusStr = color(row.presence.padEnd(8));
      const taskStr = row.task_id
        ? (chalk.bold(row.task_id) + ': ' + (row.task_title ?? '').slice(0, 20)).padEnd(28)
        : d('\u2014'.padEnd(28));
      const pctStr = row.progress_total > 0
        ? `${Math.round((row.progress_met / row.progress_total) * 100)}%`.padEnd(6)
        : d('\u2014'.padEnd(6));
      const ageStr = formatAge(row.last_heartbeat);

      console.log(`  ${icon} ${nameStr}${statusStr}${taskStr}${pctStr}${d(ageStr)}`);
    }

    const counts = { active: 0, idle: 0, away: 0 };
    for (const row of online) counts[row.presence]++;
    const parts: string[] = [];
    if (counts.active > 0) parts.push(`${counts.active} ${g('active')}`);
    if (counts.idle > 0) parts.push(`${counts.idle} ${y('idle')}`);
    if (counts.away > 0) parts.push(`${counts.away} ${r('away')}`);

    console.log('');
    console.log(`  ${parts.join(', ')}`);

    // Show work suggestions from cloud cache
    const cache = readCloudCache();
    const suggestions = cache?.suggestions;
    if (suggestions && suggestions.length > 0) {
      console.log('');
      console.log(d('  SUGGESTIONS'));
      for (const s of suggestions) {
        const icon = s.urgency === 'high' ? r('\u25cf') : s.urgency === 'medium' ? y('\u25cf') : g('\u25cf');
        console.log(`  ${icon} ${s.message}`);
      }
    }

    console.log('');
  });
