import path from 'node:path';
import { Command } from 'commander';
import { initProject } from '../core/state.js';
import { success, error, info } from '../ui/output.js';

export const initCommand = new Command('init')
  .description('Initialize vibe-focus in the current project')
  .option('--name <name>', 'Project name')
  .action((opts) => {
    const projectName = opts.name ?? path.basename(process.cwd());
    try {
      initProject(projectName);
      success(`vibe-focus initialized for "${projectName}"`);
      console.log('');
      info('Next steps:');
      console.log('  vf add "Your first task"    Add a task');
      console.log('  vf start t1                 Start working on it');
      console.log('  vf scope --define           Define project scope');
    } catch (e: any) {
      error(e.message);
    }
  });
