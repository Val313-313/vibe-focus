import { Command } from 'commander';
import { readCloudConfig, isValidUUID } from '../core/cloud-state.js';
import { success, error } from '../../ui/output.js';

export const milestoneCommand = new Command('milestone')
  .description('Create a milestone in your project')
  .argument('<title>', 'Milestone title')
  .option('--description <text>', 'Milestone description')
  .option('--due <date>', 'Due date (YYYY-MM-DD)')
  .action(async (title: string, opts: { description?: string; due?: string }) => {
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

    if (!isValidUUID(config.projectId) || !isValidUUID(config.userId)) {
      error('Invalid IDs in cloud config.');
      return;
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/projects/${config.projectId}/milestones`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey ?? config.accessToken}`,
        },
        body: JSON.stringify({
          title,
          description: opts.description || null,
          due_date: opts.due || null,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) {
        const data = await res.json();
        success(`Milestone created: "${data.title}"`);
      } else {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        error(`Failed to create milestone: ${data.error ?? `HTTP ${res.status}`}`);
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'TimeoutError') {
        error('Request timed out. Check your network.');
      } else {
        error('Failed to connect to vibeteamz. Check your network.');
      }
    }
  });
