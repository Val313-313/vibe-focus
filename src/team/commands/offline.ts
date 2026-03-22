import chalk from 'chalk';
import { Command } from 'commander';
import { goOffline } from '../core/presence.js';
import { getUsername } from '../core/team-state.js';

export const offlineCommand = new Command('offline')
  .description('Mark yourself as offline (removes your presence file)')
  .action(() => {
    const username = getUsername();
    goOffline();
    console.log(chalk.dim(`  ${username} marked as offline. Presence file removed.`));
  });
