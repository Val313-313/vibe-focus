import { Command } from 'commander';
import chalk from 'chalk';
import { readCloudConfig, isValidUUID } from '../core/cloud-state.js';
import { error } from '../../ui/output.js';

interface MilestoneRow {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  tasks: Array<{ id: string; title: string; status: string }>;
}

function progressBar(pct: number, width: number = 20): string {
  const filled = Math.round((pct / 100) * width);
  const empty = width - filled;
  const color = pct >= 100 ? chalk.greenBright : pct >= 50 ? chalk.yellow : chalk.red;
  return color('\u2593'.repeat(filled)) + chalk.dim('\u2591'.repeat(empty));
}

export const milestonesCommand = new Command('milestones')
  .description('List milestones with progress')
  .action(async () => {
    let config;
    try {
      config = readCloudConfig();
    } catch {
      error('Cloud config is corrupted. Re-run "vf vibeteamz login".');
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

    const token = config.apiKey ?? config.accessToken;

    try {
      const res = await fetch(`${config.apiUrl}/api/projects/${config.projectId}/milestones`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        error(`Failed to fetch milestones: ${data.error ?? `HTTP ${res.status}`}`);
        return;
      }

      const { milestones } = await res.json() as { milestones: MilestoneRow[] };

      if (milestones.length === 0) {
        console.log(chalk.dim('  No milestones yet. Create one: vf vibeteamz milestone "Title"'));
        return;
      }

      console.log('');

      for (const ms of milestones) {
        const total = ms.tasks.length;
        const done = ms.tasks.filter(t => t.status === 'done').length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;

        const statusIcon = ms.status === 'completed' ? chalk.green('✓') :
          ms.status === 'in_progress' ? chalk.cyan('▶') : chalk.dim('○');

        const dueStr = ms.due_date ? chalk.dim(` due ${ms.due_date}`) : '';

        console.log(`  ${statusIcon} ${chalk.bold(ms.title)}${dueStr}`);
        console.log(`    ${progressBar(pct)} ${pct}%  ${chalk.dim(`${done}/${total} tasks`)}  ${chalk.dim(ms.id.slice(0, 8))}`);
        console.log('');
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'TimeoutError') {
        error('Request timed out. Check your network.');
      } else {
        error('Failed to connect to vibeteamz.');
      }
    }
  });
