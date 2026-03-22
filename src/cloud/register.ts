import { Command } from 'commander';
import { loginCommand } from './commands/login.js';
import { linkCommand } from './commands/link.js';
import { unlinkCommand } from './commands/unlink.js';
import { statusCommand } from './commands/status.js';
import { teamCommand } from './commands/team.js';
import { pullCommand } from './commands/pull.js';
import { pushCommand } from './commands/push.js';

/**
 * Register cloud commands as a subcommand group under `vf cloud`.
 */
export function registerCloud(program: Command): void {
  const cloudCmd = new Command('cloud')
    .description('vibeteamz cloud integration commands');

  cloudCmd.addCommand(loginCommand);
  cloudCmd.addCommand(linkCommand);
  cloudCmd.addCommand(unlinkCommand);
  cloudCmd.addCommand(statusCommand);
  cloudCmd.addCommand(teamCommand);
  cloudCmd.addCommand(pullCommand);
  cloudCmd.addCommand(pushCommand);

  program.addCommand(cloudCmd);
}
