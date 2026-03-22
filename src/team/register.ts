import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { statusCommand } from './commands/status.js';
import { syncCommand } from './commands/sync.js';
import { whoCommand } from './commands/who.js';
import { offlineCommand } from './commands/offline.js';

/**
 * Register team commands as a subcommand group under `vf team`.
 */
export function register(program: Command): void {
  const teamCmd = new Command('team')
    .description('Team collaboration commands');

  teamCmd.addCommand(initCommand);
  teamCmd.addCommand(statusCommand);
  teamCmd.addCommand(syncCommand);
  teamCmd.addCommand(whoCommand);
  teamCmd.addCommand(offlineCommand);

  program.addCommand(teamCmd);
}
