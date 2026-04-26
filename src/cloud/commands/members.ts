import { Command } from 'commander';
import chalk from 'chalk';
import { readCloudConfig, isValidUUID } from '../core/cloud-state.js';
import { error } from '../../ui/output.js';

const d = chalk.dim;

type MemberRow = {
  user_id: string;
  role: string;
  joined_at: string;
  profiles?: {
    username: string;
    display_name: string | null;
    availability: string | null;
  } | null;
};

function roleColor(role: string): (s: string) => string {
  switch (role) {
    case 'owner': return chalk.yellow;
    case 'admin': return chalk.cyan;
    case 'member': return chalk.white;
    case 'viewer': return chalk.dim;
    case 'pending': return chalk.dim;
    default: return chalk.white;
  }
}

function availIcon(avail: string | null): string {
  switch (avail) {
    case 'available': return chalk.green('\u25cf');
    case 'busy': return chalk.red('\u25cf');
    case 'looking': return chalk.yellow('\u25cf');
    default: return d('\u25cb');
  }
}

function getAuthToken(config: { apiKey: string | null; accessToken: string | null }): string | null {
  return config.apiKey ?? config.accessToken;
}

export const membersCommand = new Command('members')
  .description('List project members')
  .action(async () => {
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
      const res = await fetch(`${config.apiUrl}/api/projects/${config.projectId}/members`, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        error(`Failed to fetch members: ${(data as any).error ?? `HTTP ${res.status}`}`);
        return;
      }

      const members = await res.json() as MemberRow[];

      console.log('');

      if (members.length === 0) {
        console.log(d('  No members found.'));
        console.log('');
        return;
      }

      // Separate active and pending
      const active = members.filter(m => m.role !== 'pending');
      const pending = members.filter(m => m.role === 'pending');

      console.log(chalk.bold('  Team Members') + d(` (${active.length})`));
      console.log('');

      for (const m of active) {
        const name = m.profiles?.display_name || m.profiles?.username || m.user_id.slice(0, 8);
        const username = m.profiles?.username ?? m.user_id.slice(0, 8);
        const avail = availIcon(m.profiles?.availability ?? null);
        const role = roleColor(m.role)(m.role.padEnd(8));
        const isYou = m.user_id === config.userId ? chalk.dim(' (you)') : '';
        const nameStr = name === username ? username : `${name} ${d(`@${username}`)}`;
        console.log(`  ${avail} ${nameStr.padEnd(28)}${role}${isYou}`);
      }

      if (pending.length > 0) {
        console.log('');
        console.log(chalk.yellow('  Pending Requests') + d(` (${pending.length})`));
        for (const m of pending) {
          const name = m.profiles?.display_name || m.profiles?.username || m.user_id.slice(0, 8);
          console.log(`  ${d('\u25cb')} ${d(name)}`);
        }
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
