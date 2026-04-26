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
import { notificationsCommand } from './commands/notifications.js';
import { activityCommand } from './commands/activity.js';
import { membersCommand } from './commands/members.js';
import { projectInfoCommand } from './commands/project-info.js';
import { orgCommand } from './commands/org.js';

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
  primaryCmd.addCommand(notificationsCommand);
  primaryCmd.addCommand(activityCommand);
  primaryCmd.addCommand(membersCommand);
  primaryCmd.addCommand(projectInfoCommand);
  primaryCmd.addCommand(orgCommand);

  program.addCommand(primaryCmd);

  // Short alias: `vf vt *` → `vf vibeteamz *`
  const vtCmd = new Command('vt')
    .description('Short alias for vibeteamz');
  vtCmd.allowUnknownOption(true);
  vtCmd.allowExcessArguments(true);
  vtCmd.action((_opts: unknown, cmd: Command) => {
    primaryCmd.parseAsync(['node', 'vf-vt', ...cmd.args]);
  });
  program.addCommand(vtCmd);

  // Top-level shortcut: `vf say "msg"` → `vf vibeteamz msg "msg"`
  const sayCmd = new Command('say')
    .description('Send a message to team chat (shortcut for vibeteamz msg)')
    .argument('<message>', 'Message to send')
    .option('--to <usernames...>', 'Mention users (auto-adds @ prefix)')
    .option('--reply <message-id>', 'Reply to a message')
    .action(async (message: string, opts: { to?: string[]; reply?: string }) => {
      // Re-use msgCommand's action by building the args
      const args = ['node', 'vf-say', message];
      if (opts.to?.length) { args.push('--to', ...opts.to); }
      if (opts.reply) { args.push('--reply', opts.reply); }
      await msgCommand.parseAsync(args);
    });
  program.addCommand(sayCmd);

  // Hidden alias so `vf cloud *` still works
  const aliasCmd = new Command('cloud')
    .description('Alias for vibeteamz (deprecated)');
  (aliasCmd as any).hidden = true;
  aliasCmd.allowUnknownOption(true);
  aliasCmd.allowExcessArguments(true);
  aliasCmd.action((_opts: unknown, cmd: Command) => {
    primaryCmd.parseAsync(['node', 'vf-cloud', ...cmd.args]);
  });
  program.addCommand(aliasCmd);
}
