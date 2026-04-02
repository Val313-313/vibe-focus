import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import chalk from 'chalk';
import { readState } from '../core/state.js';
import { generateRulesMd } from '../generators/rules-md.js';
import { resolveAgent } from '../agents/resolve.js';
import { AGENT_CONFIGS, type AgentType } from '../agents/types.js';
import { updateConfig } from '../core/config.js';
import { success, error, info, warn } from '../ui/output.js';

const HOOK_SCRIPT_NAME = 'vibe-focus-guard.mjs';
const AUTO_TRACK_SCRIPT_NAME = 'vibe-focus-auto-track.mjs';
const MARKER_START = '<!-- vibe-focus:start -->';
const MARKER_END = '<!-- vibe-focus:end -->';

function getBundledHookPath(): string {
  const thisFile = fileURLToPath(import.meta.url);
  return path.join(path.dirname(thisFile), 'guard-hook.mjs');
}

function getBundledAutoTrackPath(): string {
  const thisFile = fileURLToPath(import.meta.url);
  return path.join(path.dirname(thisFile), 'auto-track.mjs');
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

function appendWithMarkers(filePath: string, content: string): void {
  const wrapped = `${MARKER_START}\n${content}\n${MARKER_END}`;

  if (fs.existsSync(filePath)) {
    let existing = fs.readFileSync(filePath, 'utf-8');
    const startIdx = existing.indexOf(MARKER_START);
    const endIdx = existing.indexOf(MARKER_END);

    if (startIdx >= 0 && endIdx >= 0) {
      existing =
        existing.slice(0, startIdx) +
        wrapped +
        existing.slice(endIdx + MARKER_END.length);
    } else {
      existing += '\n\n' + wrapped;
    }
    fs.writeFileSync(filePath, existing);
  } else {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, wrapped + '\n');
  }
}

function removeMarkers(filePath: string): boolean {
  if (!fs.existsSync(filePath)) return false;

  const content = fs.readFileSync(filePath, 'utf-8');
  const startIdx = content.indexOf(MARKER_START);
  const endIdx = content.indexOf(MARKER_END);

  if (startIdx < 0 || endIdx < 0) return false;

  const before = content.slice(0, startIdx).replace(/\n\n$/, '');
  const after = content.slice(endIdx + MARKER_END.length);
  const cleaned = (before + after).trim();

  if (cleaned.length === 0) {
    fs.unlinkSync(filePath);
  } else {
    fs.writeFileSync(filePath, cleaned + '\n');
  }
  return true;
}

export const guardCommand = new Command('guard')
  .description('Install/remove AI agent focus enforcement')
  .option('--install', 'Install the focus guardian for your AI agent')
  .option('--remove', 'Remove the focus guardian')
  .option('--status', 'Check if guard is active')
  .option('--agent <type>', 'AI agent type: claude, cursor, copilot, windsurf, generic')
  .action((opts) => {
    const agent = resolveAgent(opts.agent);

    if (opts.install) {
      installGuard(agent);
    } else if (opts.remove) {
      removeGuard(agent);
    } else {
      checkStatus(agent);
    }
  });

export function installGuard(agent: AgentType): void {
  const state = readState();
  const cwd = process.cwd();
  const config = AGENT_CONFIGS[agent];
  const rulesContent = generateRulesMd(state);

  // Save agent choice to config
  updateConfig({ agent });

  if (agent === 'generic') {
    // Generic: print rules to stdout
    console.log('');
    info(`Agent: ${config.displayName} — printing rules to stdout.`);
    console.log('');
    console.log(rulesContent);
    console.log('');
    info('Copy the above rules into your AI agent\'s system prompt or rules file.');
    return;
  }

  if (agent === 'copilot') {
    // Copilot: append with markers to .github/copilot-instructions.md
    const filePath = path.join(cwd, config.rulesDir, config.rulesFile);
    appendWithMarkers(filePath, rulesContent);
    printInstallBox(agent, { rules: `${config.rulesDir}/${config.rulesFile}` });
    return;
  }

  // Claude and Cursor: write to dedicated rules file
  const rulesDir = path.join(cwd, config.rulesDir);
  fs.mkdirSync(rulesDir, { recursive: true });
  fs.writeFileSync(path.join(rulesDir, config.rulesFile), rulesContent);

  if (agent === 'claude') {
    // Claude: also install hooks + register in settings.json
    const hooksDir = path.join(cwd, config.hookDir!);
    fs.mkdirSync(hooksDir, { recursive: true });

    // 1. Guard hook (UserPromptSubmit) — focus enforcement
    const hookPath = path.join(hooksDir, HOOK_SCRIPT_NAME);
    const bundledHook = getBundledHookPath();
    if (!fs.existsSync(bundledHook)) {
      error('Guard hook bundle not found. Run "npm run build" first.');
      return;
    }
    fs.copyFileSync(bundledHook, hookPath);
    fs.chmodSync(hookPath, '755');

    // 2. Auto-track hook (PostToolUse) — heartbeats on file edits
    const autoTrackPath = path.join(hooksDir, AUTO_TRACK_SCRIPT_NAME);
    const bundledAutoTrack = getBundledAutoTrackPath();
    if (fs.existsSync(bundledAutoTrack)) {
      fs.copyFileSync(bundledAutoTrack, autoTrackPath);
      fs.chmodSync(autoTrackPath, '755');
    }

    const settings = readSettings();
    if (!settings.hooks) settings.hooks = {};

    // Register UserPromptSubmit (guard)
    if (!settings.hooks.UserPromptSubmit) settings.hooks.UserPromptSubmit = [];
    const guardCommand = `node "${hookPath}"`;
    const guardInstalled = settings.hooks.UserPromptSubmit.some(
      (entry: any) => entry.hooks?.some((h: any) => h.command?.includes(HOOK_SCRIPT_NAME))
    );
    if (!guardInstalled) {
      settings.hooks.UserPromptSubmit.push({
        hooks: [{
          type: 'command',
          command: guardCommand,
        }],
      });
    }

    // Register PostToolUse (auto-track heartbeats on Edit/Write)
    if (fs.existsSync(bundledAutoTrack)) {
      if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];
      const trackCommand = `node "${autoTrackPath}"`;
      const trackInstalled = settings.hooks.PostToolUse.some(
        (entry: any) => entry.hooks?.some((h: any) => h.command?.includes(AUTO_TRACK_SCRIPT_NAME))
      );
      if (!trackInstalled) {
        settings.hooks.PostToolUse.push({
          matcher: 'Edit|Write',
          hooks: [{
            type: 'command',
            command: trackCommand,
            async: true,
          }],
        });
      }
    }

    writeSettings(settings);
    printInstallBox(agent, {
      hook: `${config.hookDir}/${HOOK_SCRIPT_NAME}`,
      rules: `${config.rulesDir}/${config.rulesFile}`,
      config: config.settingsFile!,
    });
    return;
  }

  // Cursor
  printInstallBox(agent, { rules: `${config.rulesDir}/${config.rulesFile}` });
}

function printInstallBox(agent: AgentType, paths: { hook?: string; rules: string; config?: string }): void {
  const config = AGENT_CONFIGS[agent];
  const maxWidth = 45;

  console.log('');
  console.log(chalk.greenBright('  ╔' + '═'.repeat(maxWidth) + '╗'));
  console.log(chalk.greenBright('  ║') + chalk.bold.green(`   FOCUS GUARDIAN INSTALLED`.padEnd(maxWidth)) + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ╠' + '═'.repeat(maxWidth) + '╣'));
  console.log(chalk.greenBright('  ║') + ''.padEnd(maxWidth) + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ║') + chalk.dim(`  Agent: ${config.displayName}`.padEnd(maxWidth)) + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ║') + ''.padEnd(maxWidth) + chalk.greenBright('║'));

  if (paths.hook) {
    console.log(chalk.greenBright('  ║') + chalk.cyan('  Hook:  ') + chalk.dim(paths.hook.padEnd(maxWidth - 9)) + chalk.greenBright('║'));
  }
  console.log(chalk.greenBright('  ║') + chalk.cyan('  Rules: ') + chalk.dim(paths.rules.padEnd(maxWidth - 9)) + chalk.greenBright('║'));
  if (paths.config) {
    console.log(chalk.greenBright('  ║') + chalk.cyan('  Config:') + chalk.dim(paths.config.padEnd(maxWidth - 9)) + chalk.greenBright('║'));
  }

  console.log(chalk.greenBright('  ║') + ''.padEnd(maxWidth) + chalk.greenBright('║'));

  if (config.supportsHook) {
    console.log(chalk.greenBright('  ║') + chalk.yellow(`  Restart ${config.displayName} to activate.`.padEnd(maxWidth)) + chalk.greenBright('║'));
  }

  console.log(chalk.greenBright('  ║') + ''.padEnd(maxWidth) + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ╚' + '═'.repeat(maxWidth) + '╝'));
  console.log('');
  info('Remove with: vf guard --remove');
}

function removeGuard(agent: AgentType): void {
  const cwd = process.cwd();
  const config = AGENT_CONFIGS[agent];

  if (agent === 'generic') {
    info('Generic agent has no files to remove.');
    return;
  }

  if (agent === 'copilot') {
    const filePath = path.join(cwd, config.rulesDir, config.rulesFile);
    if (removeMarkers(filePath)) {
      success('Focus Guardian rules removed from copilot-instructions.md.');
    } else {
      info('No vibe-focus rules found in copilot-instructions.md.');
    }
    return;
  }

  // Claude and Cursor: remove the rules file
  const rulesPath = path.join(cwd, config.rulesDir, config.rulesFile);
  if (fs.existsSync(rulesPath)) {
    fs.unlinkSync(rulesPath);
  }

  if (agent === 'claude') {
    // Remove hook scripts
    const hookPath = path.join(cwd, config.hookDir!, HOOK_SCRIPT_NAME);
    if (fs.existsSync(hookPath)) fs.unlinkSync(hookPath);
    const autoTrackPath = path.join(cwd, config.hookDir!, AUTO_TRACK_SCRIPT_NAME);
    if (fs.existsSync(autoTrackPath)) fs.unlinkSync(autoTrackPath);

    // Remove from settings
    const settings = readSettings();
    if (settings.hooks?.UserPromptSubmit) {
      settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit.filter(
        (entry: any) => !entry.hooks?.some((h: any) => h.command?.includes(HOOK_SCRIPT_NAME))
      );
      if (settings.hooks.UserPromptSubmit.length === 0) delete settings.hooks.UserPromptSubmit;
    }
    if (settings.hooks?.PostToolUse) {
      settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter(
        (entry: any) => !entry.hooks?.some((h: any) => h.command?.includes(AUTO_TRACK_SCRIPT_NAME))
      );
      if (settings.hooks.PostToolUse.length === 0) delete settings.hooks.PostToolUse;
    }
    if (settings.hooks && Object.keys(settings.hooks).length === 0) delete settings.hooks;
    writeSettings(settings);
  }

  success(`Focus Guardian removed for ${config.displayName}.`);
  if (config.supportsHook) {
    info(`${config.displayName} will no longer enforce focus.`);
  }
}

function checkStatus(agent: AgentType): void {
  const cwd = process.cwd();
  const config = AGENT_CONFIGS[agent];

  console.log('');
  console.log(chalk.bold(`Focus Guardian Status (${config.displayName}):`));
  console.log('');

  if (agent === 'generic') {
    info('Generic agent: use "vf guard --install" to print rules.');
    console.log('');
    return;
  }

  if (agent === 'copilot') {
    const filePath = path.join(cwd, config.rulesDir, config.rulesFile);
    const hasRules = fs.existsSync(filePath) &&
      fs.readFileSync(filePath, 'utf-8').includes(MARKER_START);
    console.log(`  Rules:  ${hasRules ? chalk.green('present in copilot-instructions.md') : chalk.red('not found')}`);
    console.log('');
    if (hasRules) {
      console.log(chalk.greenBright(`  GUARD IS ACTIVE - ${config.displayName} will enforce focus.`));
    } else {
      info('Guard is not installed. Run "vf guard --install" to activate.');
    }
    console.log('');
    return;
  }

  // Claude, Cursor, Windsurf — dedicated rules file
  const rulesPath = path.join(cwd, config.rulesDir, config.rulesFile);
  const rulesExist = fs.existsSync(rulesPath);
  console.log(`  Rules file:   ${rulesExist ? chalk.green('present') : chalk.red('missing')}`);

  if (agent === 'claude') {
    const hookPath = path.join(cwd, config.hookDir!, HOOK_SCRIPT_NAME);
    const settings = readSettings();
    const hookExists = fs.existsSync(hookPath);
    const hookRegistered = settings.hooks?.UserPromptSubmit?.some(
      (entry: any) => entry.hooks?.some((h: any) => h.command?.includes(HOOK_SCRIPT_NAME))
    );

    console.log(`  Hook script:  ${hookExists ? chalk.green('installed') : chalk.red('not installed')}`);
    console.log(`  Hook config:  ${hookRegistered ? chalk.green('registered') : chalk.red('not registered')}`);
    console.log('');

    if (hookExists && hookRegistered && rulesExist) {
      console.log(chalk.greenBright(`  GUARD IS ACTIVE - ${config.displayName} will enforce focus.`));
    } else if (hookExists || rulesExist) {
      warn('Partial installation detected. Run "vf guard --install" to fix.');
    } else {
      info('Guard is not installed. Run "vf guard --install" to activate.');
    }
  } else {
    // Cursor, Windsurf
    console.log('');
    if (rulesExist) {
      console.log(chalk.greenBright(`  GUARD IS ACTIVE - ${config.displayName} will enforce focus.`));
    } else {
      info('Guard is not installed. Run "vf guard --install" to activate.');
    }
  }
  console.log('');
}
