import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { addCommand } from './commands/add.js';
import { startCommand } from './commands/start.js';
import { doneCommand } from './commands/done.js';
import { statusCommand } from './commands/status.js';
import { listCommand } from './commands/list.js';
import { switchCommand } from './commands/switch.js';
import { abandonCommand } from './commands/abandon.js';
import { checkCommand } from './commands/check.js';
import { scopeCommand } from './commands/scope.js';
import { promptCommand } from './commands/prompt.js';
import { dashCommand } from './commands/dash.js';
import { guardCommand } from './commands/guard.js';
import { flowCommand, superflowCommand } from './commands/flow.js';
import { noteCommand } from './commands/note.js';

const program = new Command();

program
  .name('vf')
  .description('Vibe Focus - Focus Guardian for vibe coding sessions')
  .version('0.1.0');

program.addCommand(initCommand);
program.addCommand(addCommand);
program.addCommand(startCommand);
program.addCommand(doneCommand);
program.addCommand(statusCommand);
program.addCommand(listCommand);
program.addCommand(switchCommand);
program.addCommand(abandonCommand);
program.addCommand(checkCommand);
program.addCommand(scopeCommand);
program.addCommand(promptCommand);
program.addCommand(dashCommand);
program.addCommand(guardCommand);
program.addCommand(flowCommand);
program.addCommand(superflowCommand);
program.addCommand(noteCommand);
// Default to status when no command given
program.action(() => {
  try {
    statusCommand.parse(process.argv);
  } catch {
    program.help();
  }
});

program.parse();
