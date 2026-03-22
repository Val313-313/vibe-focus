import { Command } from 'commander';
import { readCloudConfig, writeCloudConfig } from '../core/cloud-state.js';
import { success, info } from '../../ui/output.js';

export const unlinkCommand = new Command('unlink')
  .description('Remove the vibeteamz project link (stops heartbeats)')
  .action(() => {
    const config = readCloudConfig();

    if (!config.projectId) {
      info('No project linked.');
      return;
    }

    config.projectId = null;
    config.linkedAt = null;
    writeCloudConfig(config);

    success('Project unlinked. Heartbeats will no longer be sent.');
  });
