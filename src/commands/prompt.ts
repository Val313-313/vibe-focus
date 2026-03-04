import { execSync } from 'node:child_process';
import { Command } from 'commander';
import { readState } from '../core/state.js';
import { getActiveTask } from '../core/task.js';
import { generatePrompt } from '../generators/prompt-template.js';
import { success, error, info } from '../ui/output.js';

export const promptCommand = new Command('prompt')
  .description('Generate a focused Claude Code prompt for the current task')
  .option('--style <style>', 'Prompt style: concise, detailed, checklist', 'detailed')
  .action((opts) => {
    const state = readState();
    const task = getActiveTask(state);

    if (!task) {
      error('No active task. Use "vf start <id>" first.');
      return;
    }

    const prompt = generatePrompt(state, task, opts.style);

    console.log('');
    info(`Generated prompt for: ${task.id} - ${task.title}`);
    console.log('');
    console.log('\u2500'.repeat(50));
    console.log(prompt);
    console.log('\u2500'.repeat(50));
    console.log('');

    // Try to copy to clipboard
    try {
      execSync('pbcopy', { input: prompt });
      success('Copied to clipboard.');
    } catch {
      info('Copy the prompt above into your Claude Code session.');
    }
  });
