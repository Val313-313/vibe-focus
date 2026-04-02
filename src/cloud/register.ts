import { Command } from 'commander';
import { loginCommand } from './commands/login.js';
import { linkCommand } from './commands/link.js';
import { unlinkCommand } from './commands/unlink.js';
import { statusCommand } from './commands/status.js';
import { teamCommand } from './commands/team.js';
import { pullCommand } from './commands/pull.js';
import { pushCommand } from './commands/push.js';
import { msgCommand } from './commands/msg.js';
import { milestoneCommand } from './commands/milestone.js';
import { milestonesCommand } from './commands/milestones.js';
import { noteCommand as cloudNoteCommand } from './commands/note.js';
import { tasksCommand, taskCommand } from './commands/tasks.js';

/**
 * Register cloud commands under `vf vibeteamz` (primary) and `vf cloud` (hidden alias).
 */
export function registerCloud(program: Command): void {
  const primaryCmd = new Command('vibeteamz')
    .description('vibeteamz cloud integration commands');

  primaryCmd.addCommand(loginCommand);
  primaryCmd.addCommand(linkCommand);
  primaryCmd.addCommand(unlinkCommand);
  primaryCmd.addCommand(statusCommand);
  primaryCmd.addCommand(teamCommand);
  primaryCmd.addCommand(pullCommand);
  primaryCmd.addCommand(pushCommand);
  primaryCmd.addCommand(msgCommand);
  primaryCmd.addCommand(milestoneCommand);
  primaryCmd.addCommand(milestonesCommand);
  primaryCmd.addCommand(cloudNoteCommand);
  primaryCmd.addCommand(tasksCommand);
  primaryCmd.addCommand(taskCommand);

  program.addCommand(primaryCmd);

  // Hidden alias so `vf cloud *` still works
  const aliasCmd = new Command('cloud')
    .description('Alias for vibeteamz (deprecated)');
  (aliasCmd as any).hidden = true;

  // Forward all args to the primary command
  aliasCmd.allowUnknownOption(true);
  aliasCmd.allowExcessArguments(true);
  aliasCmd.action((_opts: unknown, cmd: Command) => {
    const args = cmd.args;
    primaryCmd.parseAsync(['node', 'vf-vibeteamz', ...args]);
  });

  program.addCommand(aliasCmd);
}
