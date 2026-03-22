import os from 'node:os';
import { Command } from 'commander';
import { getStateDir } from '../../core/state.js';
import {
  createTeamDirs,
  updateGitignore,
  writeTeamConfig,
  writeLocalConfig,
  isTeamInitialized,
} from '../core/team-state.js';
import { validateUsername } from '../core/validation.js';
import type { TeamConfig, LocalConfig } from '../types.js';

export const initCommand = new Command('init')
  .description('Initialize team mode for this vibe-focus project')
  .requiredOption('--user <name>', 'Your username (only letters, numbers, hyphens, underscores)')
  .option('--team-name <name>', 'Team name', 'team')
  .action((opts) => {
    // Validate username before anything else
    try {
      validateUsername(opts.user);
    } catch (e: any) {
      console.error('Error: ' + e.message);
      process.exit(1);
    }

    // Verify vibe-focus is initialized
    try {
      getStateDir();
    } catch {
      console.error('Error: Not a vibe-focus project. Run "vf init" first.');
      process.exit(1);
    }

    if (isTeamInitialized()) {
      console.log('Team already initialized. Updating local config...');
    } else {
      // Create team directory structure
      createTeamDirs();

      // Write team config (shared, committed to git)
      const teamConfig: TeamConfig = {
        version: 1,
        teamName: opts.teamName,
        settings: {
          staleThresholdMinutes: 15,
          offlineThresholdMinutes: 60,
          syncIntervalSeconds: 60,
        },
      };
      writeTeamConfig(teamConfig);

      // Update .gitignore to track team/ but not state.json
      updateGitignore();

      console.log('Team directory created: .vibe-focus/team/');
      console.log('Updated .gitignore to track team files.');
    }

    // Write local config (per-machine, git-ignored)
    const localConfig: LocalConfig = {
      username: opts.user,
      machine: os.hostname(),
      autoSync: false,
    };
    writeLocalConfig(localConfig);

    console.log('');
    console.log(`  Username:  ${opts.user}`);
    console.log(`  Machine:   ${os.hostname()}`);
    console.log(`  Team:      ${opts.teamName}`);
    console.log('');
    console.log('Next steps:');
    console.log('  1. Commit the team config:  git add .vibe-focus/team/ && git commit -m "Init vibe-focus-team"');
    console.log('  2. Have your coworker run:  vf team init --user <their-name>');
    console.log('  3. Check team status:       vf team status');
  });
