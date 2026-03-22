import { Command } from 'commander';
import { readCloudConfig, isValidUUID } from '../core/cloud-state.js';
import { supabaseInsert } from '../core/api.js';
import { success, error } from '../../ui/output.js';
import type { ActivityPayload } from '../types.js';

export const pushCommand = new Command('push')
  .description('Post a manual activity message to vibeteamz')
  .argument('<message>', 'Activity message to post')
  .action(async (message: string) => {
    let config;
    try {
      config = readCloudConfig();
    } catch {
      error('Cloud config is corrupted. Re-run "vf cloud login".');
      return;
    }

    if (!config.accessToken || !config.userId || !config.projectId) {
      error('Cloud not configured. Run "vf cloud login" then "vf cloud link <id>".');
      return;
    }

    if (!isValidUUID(config.projectId) || !isValidUUID(config.userId)) {
      error('Invalid IDs in cloud config.');
      return;
    }

    const payload: ActivityPayload = {
      project_id: config.projectId,
      user_id: config.userId,
      type: 'manual',
      message,
    };

    const result = await supabaseInsert('activity', payload as unknown as Record<string, unknown>);

    if (result.success) {
      success('Activity posted to vibeteamz.');
    } else {
      error(`Failed to post activity: ${result.error}`);
    }
  });
