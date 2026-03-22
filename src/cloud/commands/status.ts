import { Command } from 'commander';
import chalk from 'chalk';
import { readCloudConfig } from '../core/cloud-state.js';
import { buildHeartbeatPayload, sendHeartbeat } from '../core/heartbeat.js';
import { success, error, info } from '../../ui/output.js';

export const statusCommand = new Command('status')
  .description('Show cloud connection status')
  .option('--ping', 'Send a test heartbeat to verify connectivity')
  .action(async (opts) => {
    let config;
    try {
      config = readCloudConfig();
    } catch (e: unknown) {
      error('Cloud config is corrupted. Re-run "vf cloud login".');
      return;
    }

    console.log(chalk.bold('Cloud Status'));
    console.log('');
    console.log(`  API URL:      ${config.apiUrl}`);
    console.log(`  Supabase:     ${config.supabaseUrl ?? chalk.dim('not set')}`);
    console.log(`  Logged in:    ${config.userId ? chalk.green('yes') : chalk.red('no')}`);
    console.log(`  Project:      ${config.projectId ?? chalk.dim('not linked')}`);
    if (config.linkedAt) {
      console.log(`  Linked at:    ${config.linkedAt}`);
    }

    if (opts.ping) {
      console.log('');

      if (!config.accessToken || !config.userId || !config.projectId) {
        error('Cannot ping: not fully configured (need login + link).');
        return;
      }

      const payload = buildHeartbeatPayload();
      if (!payload) {
        error('Could not build heartbeat payload.');
        return;
      }

      info('Sending test heartbeat...');

      try {
        const result = await sendHeartbeat(payload);
        if (result.ok) {
          success('Heartbeat received by vibeteamz!');
        } else {
          error(`Heartbeat failed: ${result.error ?? 'unknown error'}`);
        }
      } catch {
        error('Heartbeat request failed. Check your network.');
      }
    }
  });
