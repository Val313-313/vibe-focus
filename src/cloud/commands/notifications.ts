import { Command } from 'commander';
import chalk from 'chalk';
import { readCloudConfig, isValidUUID } from '../core/cloud-state.js';
import { error, success, info } from '../../ui/output.js';

const d = chalk.dim;

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  related_type: string | null;
  read_at: string | null;
  created_at: string;
  actor?: { username: string; avatar_url: string | null; display_name: string | null };
};

function typeIcon(type: string): string {
  switch (type) {
    case 'mention': return chalk.cyan('@');
    case 'task_assigned': return chalk.yellow('→');
    case 'task_completed': return chalk.green('✓');
    case 'member_joined': return chalk.green('+');
    case 'milestone_completed': return chalk.magenta('★');
    default: return d('·');
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

export const notificationsCommand = new Command('notifications')
  .description('List your notifications')
  .option('--all', 'Include read notifications')
  .action(async (opts: { all?: boolean }) => {
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

    try {
      const token = getAuthToken(config);
      const res = await fetch(`${config.apiUrl}/api/notifications?project_id=${config.projectId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        error(`Failed to fetch notifications: ${(data as any).error ?? `HTTP ${res.status}`}`);
        return;
      }

      const { notifications, unread_count } = await res.json() as {
        notifications: NotificationRow[];
        unread_count: number;
      };

      console.log('');

      if (notifications.length === 0) {
        console.log(d('  No notifications.'));
        console.log('');
        return;
      }

      // Filter to unread only unless --all
      const filtered = opts.all ? notifications : notifications.filter(n => !n.read_at);

      if (filtered.length === 0) {
        console.log(d('  No unread notifications.'));
        if (!opts.all) info('Use --all to see read notifications.');
        console.log('');
        return;
      }

      for (const n of filtered) {
        const icon = typeIcon(n.type);
        const actor = n.actor?.display_name || n.actor?.username || 'someone';
        const unread = !n.read_at ? chalk.yellowBright(' ●') : '';
        const age = d(timeAgo(n.created_at));
        console.log(`  ${icon}${unread} ${chalk.bold(actor)} ${n.title}  ${age}`);
        if (n.body) {
          console.log(`    ${d(n.body.slice(0, 80))}`);
        }
      }

      console.log('');
      if (unread_count > 0) {
        console.log(`  ${chalk.yellowBright(unread_count)} unread`);
      } else {
        console.log(`  ${d('All caught up')}`);
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

// vf vibeteamz notifications read-all
export const readAllCommand = new Command('read-all')
  .description('Mark all notifications as read')
  .action(async () => {
    let config;
    try {
      config = readCloudConfig();
    } catch {
      error('Cloud config is corrupted.');
      return;
    }

    if (!(config.accessToken || config.apiKey) || !config.userId || !config.projectId) {
      error('Cloud not configured.');
      return;
    }

    try {
      const token = getAuthToken(config);
      const res = await fetch(`${config.apiUrl}/api/notifications/read-all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ project_id: config.projectId }),
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) {
        success('All notifications marked as read.');
      } else {
        const data = await res.json().catch(() => ({}));
        error(`Failed: ${(data as any).error ?? `HTTP ${res.status}`}`);
      }
    } catch {
      error('Failed to connect to vibeteamz.');
    }
  });

notificationsCommand.addCommand(readAllCommand);
