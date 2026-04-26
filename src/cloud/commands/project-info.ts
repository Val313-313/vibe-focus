import { Command } from 'commander';
import chalk from 'chalk';
import { readCloudConfig, isValidUUID } from '../core/cloud-state.js';
import { error } from '../../ui/output.js';

const d = chalk.dim;

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  tagline: string | null;
  status: string;
  category: string;
  tech_stack: string[];
  roles_needed: string[];
  repo_url: string | null;
  max_members: number;
  created_at: string;
  owner?: { username: string; display_name: string | null } | null;
};

function statusColor(status: string): (s: string) => string {
  switch (status) {
    case 'recruiting': return chalk.green;
    case 'active': return chalk.yellow;
    case 'completed': return chalk.dim;
    default: return chalk.white;
  }
}

function getAuthToken(config: { apiKey: string | null; accessToken: string | null }): string | null {
  return config.apiKey ?? config.accessToken;
}

export const projectInfoCommand = new Command('project')
  .description('View linked project details')
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
      const res = await fetch(`${config.apiUrl}/api/projects/${config.projectId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        error(`Failed to fetch project: ${(data as any).error ?? `HTTP ${res.status}`}`);
        return;
      }

      const project = await res.json() as ProjectRow;

      console.log('');
      console.log(chalk.bold(`  ${project.name}`) + '  ' + statusColor(project.status)(project.status));

      if (project.owner) {
        const ownerName = project.owner.display_name || project.owner.username;
        console.log(d(`  by @${project.owner.username}${ownerName !== project.owner.username ? ` (${ownerName})` : ''}`));
      }
      console.log('');

      if (project.tagline) {
        console.log(`  ${project.tagline}`);
        console.log('');
      }

      if (project.description) {
        // Truncate long descriptions for terminal readability
        const desc = project.description.length > 200
          ? project.description.slice(0, 197) + '...'
          : project.description;
        console.log(d(`  ${desc}`));
        console.log('');
      }

      // Details table
      const rows: Array<[string, string]> = [];
      rows.push(['Category', project.category]);
      rows.push(['Max Members', String(project.max_members)]);
      if (project.repo_url) rows.push(['Repo', project.repo_url]);
      rows.push(['ID', d(project.id)]);

      for (const [label, value] of rows) {
        console.log(`  ${d(label.padEnd(14))}${value}`);
      }

      if (project.tech_stack.length > 0) {
        console.log('');
        console.log(`  ${d('Tech Stack')}    ${project.tech_stack.map(t => chalk.cyan(t)).join(d(', '))}`);
      }

      if (project.roles_needed.length > 0) {
        console.log(`  ${d('Looking for')}   ${project.roles_needed.map(r => chalk.yellow(r)).join(d(', '))}`);
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
