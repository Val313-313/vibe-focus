import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { success, info, warn } from '../ui/output.js';

export type FlowMode = 'task' | 'super' | false;

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

export function readFlowSettings(): any {
  const settingsPath = getSettingsPath();
  if (fs.existsSync(settingsPath)) {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  }
  return {};
}

export function writeFlowSettings(settings: any): void {
  const dir = path.dirname(getSettingsPath());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2));
}

export function getFlowMode(): FlowMode {
  const settings = readFlowSettings();
  if (!settings._vibeFocus?.flowActive) return false;
  return settings._vibeFocus.flowMode || 'task';
}

export function disableFlowSilent(): boolean {
  const settings = readFlowSettings();
  if (!settings._vibeFocus?.flowActive) return false;

  delete settings.allowedTools;
  delete settings._vibeFocus;
  writeFlowSettings(settings);
  return true;
}

function enableFlow(mode: 'task' | 'super', extras: string[]): void {
  const settings = readFlowSettings();
  let allowedTools = [...DEFAULT_ALLOWED_TOOLS];

  for (const extra of extras) {
    const pattern = extra.includes('(') ? extra : `Bash(${extra})`;
    if (!allowedTools.includes(pattern)) {
      allowedTools.push(pattern);
    }
  }

  if (settings.allowedTools && Array.isArray(settings.allowedTools)) {
    for (const existing of settings.allowedTools) {
      if (!allowedTools.includes(existing)) {
        allowedTools.push(existing);
      }
    }
  }

  settings.allowedTools = allowedTools;

  if (!settings._vibeFocus) settings._vibeFocus = {};
  settings._vibeFocus.flowActive = true;
  settings._vibeFocus.flowMode = mode;
  settings._vibeFocus.flowEnabledAt = new Date().toISOString();
  settings._vibeFocus.flowToolCount = allowedTools.length;

  writeFlowSettings(settings);

  const isSuper = mode === 'super';
  const title = isSuper ? 'SUPERFLOW ACTIVATED' : 'FLOW MODE ACTIVATED';
  const scope = isSuper
    ? 'Active until ALL tasks are done.'
    : 'Active until current task is done.';
  const color = isSuper ? chalk.cyanBright : chalk.greenBright;
  const colorB = isSuper ? chalk.bold.cyan : chalk.bold.green;

  console.log('');
  console.log(color('  ╔═══════════════════════════════════════════╗'));
  console.log(color('  ║') + colorB(`   ${title}`.padEnd(43)) + color('║'));
  console.log(color('  ╠═══════════════════════════════════════════╣'));
  console.log(color('  ║') + '                                           ' + color('║'));
  console.log(color('  ║') + chalk.dim('  Claude Code will now auto-approve:       ') + color('║'));
  console.log(color('  ║') + '                                           ' + color('║'));
  console.log(color('  ║') + chalk.cyan('  [✓]') + chalk.dim(' Read, Write, Edit files           ') + color('║'));
  console.log(color('  ║') + chalk.cyan('  [✓]') + chalk.dim(' Search (Glob, Grep)               ') + color('║'));
  console.log(color('  ║') + chalk.cyan('  [✓]') + chalk.dim(' Build & test commands              ') + color('║'));
  console.log(color('  ║') + chalk.cyan('  [✓]') + chalk.dim(' Git operations (status/diff/add)   ') + color('║'));
  console.log(color('  ║') + chalk.cyan('  [✓]') + chalk.dim(' Common dev tools (node, tsc, etc)  ') + color('║'));
  console.log(color('  ║') + '                                           ' + color('║'));
  console.log(color('  ║') + chalk.dim(`  ${allowedTools.length} tool patterns whitelisted`) + '          ' + color('║'));
  console.log(color('  ║') + chalk.dim(`  ${scope}`.padEnd(43)) + color('║'));
  console.log(color('  ║') + '                                           ' + color('║'));

  if (isSuper) {
    console.log(color('  ║') + chalk.yellow('  CAREFUL MODE: Review before destructive  ') + color('║'));
    console.log(color('  ║') + chalk.yellow('  operations. Think twice, execute once.    ') + color('║'));
    console.log(color('  ║') + '                                           ' + color('║'));
  }

  console.log(color('  ║') + chalk.yellow('  Restart Claude Code to activate.        ') + color('║'));
  console.log(color('  ║') + '                                           ' + color('║'));
  console.log(color('  ╚═══════════════════════════════════════════╝'));
  console.log('');

  if (isSuper) {
    info('Superflow: auto-approve until all tasks done. Stay careful.');
  } else {
    info('Flow: auto-approve until "vf done". Then permissions reset.');
  }
}

function disableFlow(): void {
  const settings = readFlowSettings();

  if (!settings._vibeFocus?.flowActive) {
    warn('Flow mode is not active.');
    return;
  }

  delete settings.allowedTools;
  delete settings._vibeFocus;
  writeFlowSettings(settings);

  success('Flow mode disabled.');
  info('Claude Code will ask for permission again.');
  info('Restart Claude Code to apply changes.');
}

function showStatus(): void {
  const settings = readFlowSettings();
  const isActive = settings._vibeFocus?.flowActive === true;
  const mode = settings._vibeFocus?.flowMode || 'task';

  console.log('');
  console.log(chalk.bold('Flow Mode Status:'));
  console.log('');

  if (isActive) {
    const toolCount = settings.allowedTools?.length || 0;
    const enabledAt = settings._vibeFocus?.flowEnabledAt;
    const modeLabel = mode === 'super'
      ? chalk.cyanBright('SUPERFLOW (until all tasks done)')
      : chalk.green('FLOW (until current task done)');

    console.log(`  Status:    ${chalk.green('ACTIVE')}`);
    console.log(`  Mode:      ${modeLabel}`);
    console.log(`  Tools:     ${chalk.cyan(toolCount + ' patterns')} whitelisted`);
    if (enabledAt) {
      console.log(`  Since:     ${chalk.dim(new Date(enabledAt).toLocaleString())}`);
    }
  } else {
    console.log(`  Status:    ${chalk.yellow('INACTIVE')}`);
    console.log('');
    info('vf flow --on        (until current task done)');
    info('vf superflow --on   (until all tasks done)');
  }
  console.log('');
}

export const flowCommand = new Command('flow')
  .description('Auto-approve tool permissions until current task is done')
  .option('--on', 'Enable flow mode (scoped to current task)')
  .option('--off', 'Disable flow mode')
  .option('--status', 'Check flow status')
  .option('--add <patterns...>', 'Add extra Bash patterns')
  .action((opts) => {
    if (opts.off) {
      disableFlow();
    } else if (opts.on || (!opts.off && !opts.status)) {
      enableFlow('task', opts.add || []);
    } else {
      showStatus();
    }
  });

export const superflowCommand = new Command('superflow')
  .description('Auto-approve tool permissions until ALL tasks are done (careful mode)')
  .option('--on', 'Enable superflow')
  .option('--off', 'Disable superflow')
  .option('--status', 'Check flow status')
  .option('--add <patterns...>', 'Add extra Bash patterns')
  .action((opts) => {
    if (opts.off) {
      disableFlow();
    } else if (opts.on || (!opts.off && !opts.status)) {
      enableFlow('super', opts.add || []);
    } else {
      showStatus();
    }
  });
