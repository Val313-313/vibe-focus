import path from 'node:path';
import { Command } from 'commander';
import { initProject } from '../core/state.js';
import { resolveAgent, isValidAgent } from '../agents/resolve.js';
import { AGENT_CONFIGS } from '../agents/types.js';
import { updateConfig } from '../core/config.js';
import { success, error, info } from '../ui/output.js';

export const initCommand = new Command('init')
  .description('Initialize vibe-focus in the current project')
  .option('--name <name>', 'Project name')
  .option('--agent <type>', 'AI agent type: claude, cursor, copilot, windsurf, generic')
  .action((opts) => {
    const projectName = opts.name ?? path.basename(process.cwd());
    try {
      const { importedCount } = initProject(projectName);

      // Save agent to config if specified
      if (opts.agent) {
        if (!isValidAgent(opts.agent)) {
          error(`Unknown agent "${opts.agent}". Valid: claude, cursor, copilot, windsurf, generic`);
          return;
        }
        updateConfig({ agent: opts.agent });
      }

      const agent = opts.agent ? resolveAgent(opts.agent) : undefined;
      const agentName = agent ? AGENT_CONFIGS[agent].displayName : undefined;

      success(`vibe-focus initialized for "${projectName}"`);
      if (importedCount > 0) {
        info(`Imported ${importedCount} task${importedCount === 1 ? '' : 's'} from tasks.json`);
      }
      if (agentName) {
        info(`Agent: ${agentName}`);
      }
      console.log('');
      info('Next steps:');
      console.log('  vf add "Your first task"    Add a task');
      console.log('  vf start t1                 Start working on it');
      console.log('  vf scope --define           Define project scope');
      if (agent) {
        console.log(`  vf guard --install          Install guard for ${agentName}`);
      } else {
        console.log('  vf guard --install          Install focus guard');
      }
    } catch (e: any) {
      error(e.message);
    }
  });
