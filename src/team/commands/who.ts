import chalk from 'chalk';
import { Command } from 'commander';
import { getCoworkers, writePresence } from '../core/presence.js';
import { getUsername } from '../core/team-state.js';
import { getActiveFiles } from '../core/file-tracker.js';

export const whoCommand = new Command('who')
  .description('Check who is working on a specific file or directory')
  .argument('<path>', 'File or directory path to check')
  .action((targetPath) => {
    try { writePresence(); } catch {}

    const username = getUsername();
    const myFiles = getActiveFiles();
    const coworkers = getCoworkers();

    const iAmTouching = myFiles.some(
      (f) => f === targetPath || f.startsWith(targetPath),
    );

    const touching: string[] = [];

    if (iAmTouching) {
      touching.push(`${chalk.cyanBright(username)} (you)`);
    }

    for (const cw of coworkers) {
      if (cw.staleness === 'offline') continue;
      const match = cw.presence.activeFiles.some(
        (f) => f === targetPath || f.startsWith(targetPath),
      );
      if (match) {
        touching.push(chalk.yellow(cw.presence.username));
      }
    }

    if (touching.length === 0) {
      console.log(chalk.dim(`  No one is currently working on ${targetPath}`));
    } else {
      console.log(`  ${chalk.bold(targetPath)}: ${touching.join(', ')}`);
      if (touching.length > 1) {
        console.log(chalk.red('  \u26a0 Multiple people touching this path - coordinate!'));
      }
    }
  });
