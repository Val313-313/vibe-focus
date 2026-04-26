import { Command } from 'commander';
import chalk from 'chalk';
import { readCloudConfig } from '../core/cloud-state.js';
import { error, success, info } from '../../ui/output.js';

const d = chalk.dim;

type OrgRow = {
  id: string;
  name: string;
  description: string | null;
  owner?: { username: string; display_name: string | null } | null;
};

type OrgMemberRow = {
  user_id: string;
  role: string;
  joined_at: string;
  profile?: { username: string; avatar_url: string | null; display_name: string | null } | null;
};

function roleColor(role: string): (s: string) => string {
  switch (role) {
    case 'owner': return chalk.yellow;
    case 'admin': return chalk.cyan;
    case 'member': return chalk.white;
    default: return chalk.white;
  }
}

function getAuthToken(config: { apiKey: string | null; accessToken: string | null }): string | null {
  return config.apiKey ?? config.accessToken;
}

async function apiFetch(config: { apiUrl: string; apiKey: string | null; accessToken: string | null }, path: string, opts?: RequestInit): Promise<Response> {
  const token = getAuthToken(config);
  return fetch(`${config.apiUrl}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(opts?.headers ?? {}),
    },
    signal: AbortSignal.timeout(10_000),
  });
}

export const orgCommand = new Command('org')
  .description('Organization management commands');

// vf vibeteamz org list
orgCommand
  .command('list')
  .description('List your organizations')
  .action(async () => {
    let config;
    try {
      config = readCloudConfig();
    } catch {
      error('Cloud config is corrupted.');
      return;
    }

    if (!(config.accessToken || config.apiKey) || !config.userId) {
      error('Cloud not configured. Run "vf vibeteamz login".');
      return;
    }

    try {
      const res = await apiFetch(config, '/api/orgs');

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        error(`Failed to fetch orgs: ${(data as any).error ?? `HTTP ${res.status}`}`);
        return;
      }

      const orgs = await res.json() as OrgRow[];

      console.log('');

      if (orgs.length === 0) {
        console.log(d('  No organizations found.'));
        console.log('');
        return;
      }

      console.log(chalk.bold('  Organizations') + d(` (${orgs.length})`));
      console.log('');

      for (const org of orgs) {
        const owner = org.owner?.username ? d(` @${org.owner.username}`) : '';
        console.log(`  ${chalk.bold(org.name)}${owner}`);
        if (org.description) {
          console.log(`    ${d(org.description.slice(0, 60))}`);
        }
        console.log(`    ${d(org.id.slice(0, 8))}`);
      }

      console.log('');
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'TimeoutError') {
        error('Request timed out. Check your network.');
      } else {
        error('Failed to connect to vibeteamz.');
      }
    }
  });

// vf vibeteamz org members <org-id>
orgCommand
  .command('members <org-id>')
  .description('List members of an organization')
  .action(async (orgId: string) => {
    let config;
    try {
      config = readCloudConfig();
    } catch {
      error('Cloud config is corrupted.');
      return;
    }

    if (!(config.accessToken || config.apiKey) || !config.userId) {
      error('Cloud not configured. Run "vf vibeteamz login".');
      return;
    }

    try {
      const res = await apiFetch(config, `/api/orgs/${orgId}/members`);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        error(`Failed to fetch members: ${(data as any).error ?? `HTTP ${res.status}`}`);
        return;
      }

      const members = await res.json() as OrgMemberRow[];

      console.log('');

      if (members.length === 0) {
        console.log(d('  No members found.'));
        console.log('');
        return;
      }

      console.log(chalk.bold('  Org Members') + d(` (${members.length})`));
      console.log('');

      for (const m of members) {
        const name = m.profile?.display_name || m.profile?.username || m.user_id.slice(0, 8);
        const username = m.profile?.username ?? m.user_id.slice(0, 8);
        const role = roleColor(m.role)(m.role.padEnd(8));
        const isYou = m.user_id === config.userId ? chalk.dim(' (you)') : '';
        console.log(`  ${name.padEnd(24)}${role}  ${d(`@${username}`)}${isYou}`);
      }

      console.log('');
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'TimeoutError') {
        error('Request timed out. Check your network.');
      } else {
        error('Failed to connect to vibeteamz.');
      }
    }
  });

// vf vibeteamz org projects <org-id>
orgCommand
  .command('projects <org-id>')
  .description('List projects in an organization')
  .action(async (orgId: string) => {
    let config;
    try {
      config = readCloudConfig();
    } catch {
      error('Cloud config is corrupted.');
      return;
    }

    if (!(config.accessToken || config.apiKey) || !config.userId) {
      error('Cloud not configured. Run "vf vibeteamz login".');
      return;
    }

    try {
      const res = await apiFetch(config, `/api/orgs/${orgId}/projects`);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        error(`Failed to fetch projects: ${(data as any).error ?? `HTTP ${res.status}`}`);
        return;
      }

      const projects = await res.json() as Array<{ id: string; name: string; status: string; description: string | null }>;

      console.log('');

      if (projects.length === 0) {
        console.log(d('  No projects in this org.'));
        console.log('');
        return;
      }

      console.log(chalk.bold('  Org Projects') + d(` (${projects.length})`));
      console.log('');

      for (const p of projects) {
        const statusFn = p.status === 'recruiting' ? chalk.green : p.status === 'active' ? chalk.yellow : chalk.dim;
        console.log(`  ${chalk.bold(p.name.padEnd(28))}${statusFn(p.status.padEnd(12))}${d(p.id.slice(0, 8))}`);
      }

      console.log('');
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'TimeoutError') {
        error('Request timed out. Check your network.');
      } else {
        error('Failed to connect to vibeteamz.');
      }
    }
  });
