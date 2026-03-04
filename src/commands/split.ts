import { execSync } from 'node:child_process';
import { Command } from 'commander';
import chalk from 'chalk';
import { info, warn, error } from '../ui/output.js';

export const splitCommand = new Command('split')
  .description('Open a tmux split pane with the live vf watch dashboard')
  .option('--right', 'Split to the right (default)')
  .option('--bottom', 'Split to the bottom')
  .option('--size <percent>', 'Pane size in percent', '30')
  .action((opts) => {
    // Check if we're inside tmux
    if (!process.env.TMUX) {
      console.log('');
      warn('Not inside a tmux session.');
      console.log('');
      console.log(chalk.dim('  Option 1: Start tmux first'));
      console.log(chalk.cyan('    tmux'));
      console.log(chalk.cyan('    vf split'));
      console.log('');
      console.log(chalk.dim('  Option 2: Run watch in a separate terminal tab'));
      console.log(chalk.cyan('    vf watch'));
      console.log('');
      return;
    }

    const size = parseInt(opts.size, 10) || 30;
    const direction = opts.bottom ? '-v' : '-h';
    const cwd = process.cwd();

    try {
      // Create a new tmux split pane running vf watch
      execSync(
        `tmux split-window ${direction} -l ${size}% -c "${cwd}" "vf watch"`,
        { stdio: 'inherit' }
      );
      info('Live dashboard opened in split pane.');
    } catch (e) {
      error('Failed to create tmux split. Is tmux available?');
    }
  });
