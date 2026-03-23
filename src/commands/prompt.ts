import { execSync } from 'node:child_process';
import { Command } from 'commander';
import { readState } from '../core/state.js';
import { getActiveTask } from '../core/task.js';
import { generatePrompt } from '../generators/prompt-template.js';
import { resolveAgent } from '../agents/resolve.js';
import { AGENT_CONFIGS } from '../agents/types.js';
import { success, error, info } from '../ui/output.js';

function copyToClipboard(text: string): boolean {
  const commands = ['pbcopy', 'xclip -selection clipboard', 'xsel --clipboard --input', 'clip.exe'];
  for (const cmd of commands) {
    try {
      execSync(cmd.split(' ')[0]!, { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

export const promptCommand = new Command('prompt')
  .description('Generate a focused AI agent prompt for the current task')
  .option('--style <style>', 'Prompt style: concise, detailed, checklist', 'detailed')
  .option('--agent <type>', 'AI agent type: claude, copilot, cursor, generic')
  .action((opts) => {
    const state = readState();
    const task = getActiveTask(state);
    const agent = resolveAgent(opts.agent);
    const config = AGENT_CONFIGS[agent];

    if (!task) {
      error('No active task. Use "vf start <id>" first.');
      return;
    }

    const prompt = generatePrompt(state, task, opts.style);

    console.log('');
    info(`Generated prompt for: ${task.id} - ${task.title}`);
    info(`Agent: ${config.displayName}`);
    console.log('');
    console.log('\u2500'.repeat(50));
    console.log(prompt);
    console.log('\u2500'.repeat(50));
    console.log('');

    if (copyToClipboard(prompt)) {
      success('Copied to clipboard.');
    } else {
      info(`Copy the prompt above into your ${config.displayName} session.`);
    }
  });
