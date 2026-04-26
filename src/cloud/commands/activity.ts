import { Command } from 'commander';
import chalk from 'chalk';
import { readCloudConfig, isValidUUID } from '../core/cloud-state.js';
import { error, info } from '../../ui/output.js';

const d = chalk.dim;

type ActivityRow = {
  id: string;
  type: string;
  message: string;
  created_at: string;
  profiles?: { username: string } | null;
};

function typeIcon(type: string): string {
  switch (type) {
    case 'task_started': return chalk.cyan('\u25b6');
    case 'task_completed': return chalk.green('\u2713');
    case 'member_joined': return chalk.green('+');
    case 'member_left': return chalk.red('-');
    case 'session_started': return chalk.magenta('\u25cf');
    case 'commit': return chalk.yellow('\u2022');
    case 'note': return chalk.blue('\u2022');
    case 'review': return chalk.cyan('\u2022');
    default: return d('\u00b7');
  }
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getAuthToken(config: { apiKey: string | null; accessToken: string | null }): string | null {
  return config.apiKey ?? config.accessToken;
}

export const activityCommand = new Command('activity')
  .description('View project activity feed')
  .option('--limit <n>', 'Number of entries to show', '20')
  .action(async (opts: { limit?: string }) => {
    let config;
    try {
      config = readCloudConfig();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      error(`Cloud config error: ${msg}`);
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

    const limit = Math.min(parseInt(opts.limit || '20', 10) || 20, 50);

    try {
      const token = getAuthToken(config);
      const res = await fetch(`${config.apiUrl}/api/projects/${config.projectId}/activity?limit=${limit}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        error(`Failed to fetch activity: ${(data as any).error ?? `HTTP ${res.status}`}`);
        return;
      }

      const activities = await res.json() as ActivityRow[];

      console.log('');

      if (activities.length === 0) {
        console.log(d('  No activity yet.'));
        console.log('');
        return;
      }

      console.log(chalk.bold('  Activity Feed'));
      console.log('');

      for (const a of activities) {
        const icon = typeIcon(a.type);
        const who = a.profiles?.username ?? 'system';
        const age = d(timeAgo(a.created_at));
        console.log(`  ${icon} ${chalk.bold(who)} ${a.message}  ${age}`);
      }

      console.log('');
      console.log(d(`  ${activities.length} entries shown`));
      if (activities.length >= limit) {
        info(`Use --limit <n> to see more (max 50).`);
      }
      console.log('');
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'TimeoutError') {
        error('Request timed out. Check your network.');
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        error(`Failed to connect to vibeteamz: ${msg}`);
      }
    }
  });
