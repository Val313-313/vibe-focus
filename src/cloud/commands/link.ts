import { Command } from 'commander';
import { readCloudConfig, writeCloudConfig, isValidUUID } from '../core/cloud-state.js';
import { now } from '../../utils/time.js';
import { success, error, info } from '../../ui/output.js';

export const linkCommand = new Command('link')
  .description('Link this project to a vibeteamz project')
  .argument('<project-id>', 'vibeteamz project UUID')
  .action((projectId: string) => {
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

    config.projectId = id;
    config.linkedAt = now();
    writeCloudConfig(config);

    success(`Linked to project ${id}`);
    info('Heartbeats will now be sent with vf start, done, check, and team sync.');
  });
