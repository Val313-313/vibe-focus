import { Command } from 'commander';
import { readCloudConfig, isValidUUID } from '../core/cloud-state.js';
import { success, error } from '../../ui/output.js';

export const noteCommand = new Command('note')
  .description('Post a note to project activity feed')
  .argument('<text>', 'Note text')
  .action(async (text: string) => {
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
      const res = await fetch(`${config.apiUrl}/api/activity/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey ?? config.accessToken}`,
        },
        body: JSON.stringify({
          project_id: config.projectId,
          type: 'note',
          message: text,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) {
        success('Note posted to activity feed.');
      } else {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        error(`Failed to post note: ${data.error ?? `HTTP ${res.status}`}`);
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'TimeoutError') {
        error('Request timed out. Check your network.');
      } else {
        error('Failed to connect to vibeteamz. Check your network.');
      }
    }
  });
