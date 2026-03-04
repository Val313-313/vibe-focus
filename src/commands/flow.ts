import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { success, info, warn, error } from '../ui/output.js';

const FLOW_MARKER = '__vibe_focus_flow';

// Safe tools that don't need confirmation during focused work
const DEFAULT_ALLOWED_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'NotebookEdit',
  'WebFetch',
  'WebSearch',
  'Task',
  'Bash(npm run *)',
  'Bash(npm test *)',
  'Bash(npx *)',
  'Bash(node *)',
  'Bash(git status*)',
  'Bash(git diff*)',
  'Bash(git log*)',
  'Bash(git add *)',
  'Bash(git commit *)',
  'Bash(ls *)',
  'Bash(cat *)',
  'Bash(wc *)',
  'Bash(which *)',
  'Bash(tsc *)',
  'Bash(python *)',
  'Bash(pip *)',
  'Bash(cargo *)',
  'Bash(go *)',
  'Bash(make *)',
  'Bash(mkdir *)',
  'Bash(cp *)',
  'Bash(mv *)',
];

function getSettingsPath(): string {
  return path.join(process.cwd(), '.claude', 'settings.json');
}

function readSettings(): any {
  const settingsPath = getSettingsPath();
  if (fs.existsSync(settingsPath)) {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  }
  return {};
}

function writeSettings(settings: any): void {
  const dir = path.dirname(getSettingsPath());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2));
}

function enableFlow(extras: string[]): void {
  const settings = readSettings();

  // Build the allowed tools list
  let allowedTools = [...DEFAULT_ALLOWED_TOOLS];

  // Add any extra patterns
  for (const extra of extras) {
    const pattern = extra.includes('(') ? extra : `Bash(${extra})`;
    if (!allowedTools.includes(pattern)) {
      allowedTools.push(pattern);
    }
  }

  // Merge with existing allowedTools (don't remove user's custom entries)
  if (settings.allowedTools && Array.isArray(settings.allowedTools)) {
    for (const existing of settings.allowedTools) {
      if (!allowedTools.includes(existing)) {
        allowedTools.push(existing);
      }
    }
  }

  settings.allowedTools = allowedTools;

  // Store marker so we know flow mode is active
  if (!settings._vibeFocus) settings._vibeFocus = {};
  settings._vibeFocus.flowActive = true;
  settings._vibeFocus.flowEnabledAt = new Date().toISOString();
  settings._vibeFocus.flowToolCount = allowedTools.length;

  writeSettings(settings);

  console.log('');
  console.log(chalk.greenBright('  ╔═══════════════════════════════════════════╗'));
  console.log(chalk.greenBright('  ║') + chalk.bold.green('   FLOW MODE ACTIVATED                  ') + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ╠═══════════════════════════════════════════╣'));
  console.log(chalk.greenBright('  ║') + '                                           ' + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ║') + chalk.dim('  Claude Code will now auto-approve:       ') + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ║') + '                                           ' + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ║') + chalk.cyan('  [✓]') + chalk.dim(' Read, Write, Edit files           ') + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ║') + chalk.cyan('  [✓]') + chalk.dim(' Search (Glob, Grep)               ') + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ║') + chalk.cyan('  [✓]') + chalk.dim(' Build & test commands              ') + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ║') + chalk.cyan('  [✓]') + chalk.dim(' Git operations (status/diff/add)   ') + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ║') + chalk.cyan('  [✓]') + chalk.dim(' Common dev tools (node, tsc, etc)  ') + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ║') + '                                           ' + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ║') + chalk.dim(`  ${allowedTools.length} tool patterns whitelisted`) + '          ' + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ║') + '                                           ' + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ║') + chalk.yellow('  Restart Claude Code to activate.        ') + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ║') + '                                           ' + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ╚═══════════════════════════════════════════╝'));
  console.log('');
  info('No more "yes" clicking. Stay in flow.');
  info('Disable with: vf flow --off');
}

function disableFlow(): void {
  const settings = readSettings();

  if (!settings._vibeFocus?.flowActive) {
    warn('Flow mode is not active.');
    return;
  }

  // Remove the tools we added
  delete settings.allowedTools;
  delete settings._vibeFocus;

  // Clean up empty objects
  if (settings._vibeFocus && Object.keys(settings._vibeFocus).length === 0) {
    delete settings._vibeFocus;
  }

  writeSettings(settings);

  success('Flow mode disabled.');
  info('Claude Code will ask for permission again.');
  info('Restart Claude Code to apply changes.');
}

function showStatus(): void {
  const settings = readSettings();
  const isActive = settings._vibeFocus?.flowActive === true;

  console.log('');
  console.log(chalk.bold('Flow Mode Status:'));
  console.log('');

  if (isActive) {
    const toolCount = settings.allowedTools?.length || 0;
    const enabledAt = settings._vibeFocus?.flowEnabledAt;

    console.log(`  Status:    ${chalk.green('ACTIVE')}`);
    console.log(`  Tools:     ${chalk.cyan(toolCount + ' patterns')} whitelisted`);
    if (enabledAt) {
      console.log(`  Since:     ${chalk.dim(new Date(enabledAt).toLocaleString())}`);
    }
    console.log('');

    if (settings.allowedTools) {
      console.log(chalk.dim('  Whitelisted patterns:'));
      for (const tool of settings.allowedTools) {
        console.log(chalk.dim(`    ${chalk.green('•')} ${tool}`));
      }
    }
  } else {
    console.log(`  Status:    ${chalk.yellow('INACTIVE')}`);
    console.log('');
    info('Enable with: vf flow --on');
  }
  console.log('');
}

export const flowCommand = new Command('flow')
  .description('Enable/disable auto-approve for Claude Code tool permissions (no more "yes" clicking)')
  .option('--on', 'Enable flow mode (auto-approve safe operations)')
  .option('--off', 'Disable flow mode (restore permission prompts)')
  .option('--status', 'Check if flow mode is active')
  .option('--add <patterns...>', 'Add extra Bash patterns to whitelist (e.g. "docker *" "pytest *")')
  .action((opts) => {
    if (opts.off) {
      disableFlow();
    } else if (opts.on || (!opts.off && !opts.status)) {
      enableFlow(opts.add || []);
    } else {
      showStatus();
    }
  });
