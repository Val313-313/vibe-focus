import { Command } from 'commander';
import { readCloudConfig, isValidUUID } from '../core/cloud-state.js';
import { success, error } from '../../ui/output.js';

export const msgCommand = new Command('msg')
  .description('Send a message to your project team chat')
  .argument('<message>', 'Message to send')
  .action(async (message: string) => {
    let config;
    try {
      config = readCloudConfig();
    } catch {
      error('Cloud config is corrupted. Re-run "vf vibeteamz login".');
      return;
    }

    if (!config.accessToken || !config.userId || !config.projectId) {
      error('Cloud not configured. Run "vf vibeteamz login" then "vf vibeteamz link <id>".');
      return;
    }

    if (!isValidUUID(config.projectId) || !isValidUUID(config.userId)) {
      error('Invalid IDs in cloud config.');
      return;
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.accessToken}`,
        },
        body: JSON.stringify({
          project_id: config.projectId,
          user_id: config.userId,
          body: message,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) {
        success('Message sent to team chat.');
      } else {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        error(`Failed to send message: ${data.error ?? `HTTP ${res.status}`}`);
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'TimeoutError') {
        error('Request timed out. Check your network.');
      } else {
        error('Failed to connect to vibeteamz. Check your network.');
      }
    }
  });
