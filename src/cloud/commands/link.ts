import { Command } from 'commander';
import { readCloudConfig, writeCloudConfig, isValidUUID } from '../core/cloud-state.js';
import { now } from '../../utils/time.js';
import { success, error, info } from '../../ui/output.js';

export const linkCommand = new Command('link')
  .description('Link this project to a vibeteamz project')
  .argument('<project-id>', 'vibeteamz project UUID')
  .action(async (projectId: string) => {
    const id = String(projectId).trim().toLowerCase();

    if (!isValidUUID(id)) {
      error('Invalid project ID. Must be a valid UUID v4.');
      info('Find your project ID on the vibeteamz dashboard.');
      return;
    }

    const config = readCloudConfig();

    if (!config.accessToken || !config.userId) {
      error('Not logged in. Run "vf cloud login" first.');
      return;
    }

    // Request a project-scoped API key from the server
    let apiKey: string | null = null;
    let projectName: string | null = null;
    try {
      const res = await fetch(`${config.apiUrl}/api/auth/api-key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.accessToken}`,
        },
        body: JSON.stringify({ project_id: id }),
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) {
        const data = await res.json() as { api_key: string; key_prefix: string; project_name: string | null };
        apiKey = data.api_key;
        projectName = data.project_name;
        info(`API key generated (${data.key_prefix}…). Heartbeats will use project-scoped auth.`);
      } else {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error: string };
        error(`Failed to generate API key: ${body.error}`);
        info('Falling back to session token for heartbeats.');
      }
    } catch {
      info('Could not reach server for API key. Falling back to session token.');
    }

    config.projectId = id;
    config.linkedAt = now();
    config.apiKey = apiKey;
    writeCloudConfig(config);

    const label = projectName ? `${projectName} (${id})` : id;
    success(`Linked to project ${label}`);
    info('Heartbeats will now be sent with vf start, done, check, and team sync.');
  });
