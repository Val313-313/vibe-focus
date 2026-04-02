import { Command } from 'commander';
import { runOnboarding } from './onboarding.js';

export const joinCommand = new Command('join')
  .description('Join an existing project (team member onboarding)')
  .option('--name <name>', 'Project name')
  .option('--agent <type>', 'AI agent type: claude, cursor, copilot, windsurf, generic')
  .option('--skip-login', 'Skip vibeteamz login')
  .option('--skip-guard', 'Skip focus guardian installation')
  .option('--skip-hook', 'Skip git hook installation')
  .action(async (opts) => {
    await runOnboarding({
      projectName: opts.name,
      agent: opts.agent,
      skipLogin: opts.skipLogin,
      skipGuard: opts.skipGuard,
      skipHook: opts.skipHook,
      isJoin: true,
    });
  });
