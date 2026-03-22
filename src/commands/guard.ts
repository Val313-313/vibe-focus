import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import chalk from 'chalk';
import { readState } from '../core/state.js';
import { generateClaudeMd } from '../generators/claude-md.js';
import { success, error, info, warn } from '../ui/output.js';

const HOOK_SCRIPT_NAME = 'vibe-focus-guard.mjs';

function getBundledHookPath(): string {
  const thisFile = fileURLToPath(import.meta.url);
  return path.join(path.dirname(thisFile), 'guard-hook.mjs');
}

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

export const guardCommand = new Command('guard')
  .description('Install/remove Claude Code focus enforcement hooks')
  .option('--install', 'Install the focus guardian hook into Claude Code')
  .option('--remove', 'Remove the focus guardian hook')
  .option('--status', 'Check if guard is active')
  .action((opts) => {
    if (opts.install) {
      installGuard();
    } else if (opts.remove) {
      removeGuard();
    } else {
      checkStatus();
    }
  });

function installGuard(): void {
  const state = readState();
  const cwd = process.cwd();

  // 1. Write hook script
  const hooksDir = path.join(cwd, '.claude', 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });
  const hookPath = path.join(hooksDir, HOOK_SCRIPT_NAME);
  const bundledHook = getBundledHookPath();
  if (!fs.existsSync(bundledHook)) {
    error('Guard hook bundle not found. Run "npm run build" first.');
    return;
  }
  fs.copyFileSync(bundledHook, hookPath);
  fs.chmodSync(hookPath, '755');

  // 2. Update .claude/settings.json to register the hook
  const settings = readSettings();
  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.UserPromptSubmit) settings.hooks.UserPromptSubmit = [];

  // Check if already installed
  const hookCommand = `node "${hookPath}"`;
  const alreadyInstalled = settings.hooks.UserPromptSubmit.some(
    (entry: any) => entry.hooks?.some((h: any) => h.command?.includes(HOOK_SCRIPT_NAME))
  );

  if (!alreadyInstalled) {
    settings.hooks.UserPromptSubmit.push({
      hooks: [{
        type: 'command',
        command: hookCommand,
      }],
    });
  }

  writeSettings(settings);

  // 3. Write/update rules file
  const rulesDir = path.join(cwd, '.claude', 'rules');
  fs.mkdirSync(rulesDir, { recursive: true });
  const rulesContent = generateClaudeMd(state);
  fs.writeFileSync(path.join(rulesDir, 'vibe-focus.md'), rulesContent);

  console.log('');
  console.log(chalk.greenBright('  ╔═══════════════════════════════════════════╗'));
  console.log(chalk.greenBright('  ║') + chalk.bold.green('   FOCUS GUARDIAN INSTALLED              ') + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ╠═══════════════════════════════════════════╣'));
  console.log(chalk.greenBright('  ║') + '                                           ' + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ║') + chalk.dim('  Claude Code wird jetzt bei JEDEM        ') + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ║') + chalk.dim('  Prompt deinen aktuellen Task prüfen     ') + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ║') + chalk.dim('  und dich zurückweisen wenn du abweichst. ') + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ║') + '                                           ' + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ║') + chalk.cyan('  Hook:  ') + chalk.dim('.claude/hooks/' + HOOK_SCRIPT_NAME) + '  ' + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ║') + chalk.cyan('  Rules: ') + chalk.dim('.claude/rules/vibe-focus.md') + '     ' + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ║') + chalk.cyan('  Config:') + chalk.dim('.claude/settings.json') + '          ' + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ║') + '                                           ' + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ║') + chalk.yellow('  Starte Claude Code neu um zu aktivieren ') + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ║') + '                                           ' + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ╚═══════════════════════════════════════════╝'));
  console.log('');
  info('Remove with: vf guard --remove');
}

function removeGuard(): void {
  const cwd = process.cwd();

  // Remove hook script
  const hookPath = path.join(cwd, '.claude', 'hooks', HOOK_SCRIPT_NAME);
  if (fs.existsSync(hookPath)) {
    fs.unlinkSync(hookPath);
  }

  // Remove from settings
  const settings = readSettings();
  if (settings.hooks?.UserPromptSubmit) {
    settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit.filter(
      (entry: any) => !entry.hooks?.some((h: any) => h.command?.includes(HOOK_SCRIPT_NAME))
    );
    if (settings.hooks.UserPromptSubmit.length === 0) {
      delete settings.hooks.UserPromptSubmit;
    }
    if (Object.keys(settings.hooks).length === 0) {
      delete settings.hooks;
    }
  }
  writeSettings(settings);

  // Remove rules file
  const rulesPath = path.join(cwd, '.claude', 'rules', 'vibe-focus.md');
  if (fs.existsSync(rulesPath)) {
    fs.unlinkSync(rulesPath);
  }

  success('Focus Guardian hook removed.');
  info('Claude Code will no longer enforce focus.');
}

function checkStatus(): void {
  const cwd = process.cwd();
  const hookPath = path.join(cwd, '.claude', 'hooks', HOOK_SCRIPT_NAME);
  const rulesPath = path.join(cwd, '.claude', 'rules', 'vibe-focus.md');
  const settings = readSettings();

  const hookExists = fs.existsSync(hookPath);
  const rulesExist = fs.existsSync(rulesPath);
  const hookRegistered = settings.hooks?.UserPromptSubmit?.some(
    (entry: any) => entry.hooks?.some((h: any) => h.command?.includes(HOOK_SCRIPT_NAME))
  );

  console.log('');
  console.log(chalk.bold('Focus Guardian Status:'));
  console.log('');
  console.log(`  Hook script:  ${hookExists ? chalk.green('installed') : chalk.red('not installed')}`);
  console.log(`  Hook config:  ${hookRegistered ? chalk.green('registered') : chalk.red('not registered')}`);
  console.log(`  Rules file:   ${rulesExist ? chalk.green('present') : chalk.red('missing')}`);
  console.log('');

  if (hookExists && hookRegistered && rulesExist) {
    console.log(chalk.greenBright('  GUARD IS ACTIVE - Claude Code will enforce focus.'));
  } else if (hookExists || rulesExist) {
    warn('Partial installation detected. Run "vf guard --install" to fix.');
  } else {
    info('Guard is not installed. Run "vf guard --install" to activate.');
  }
  console.log('');
}
