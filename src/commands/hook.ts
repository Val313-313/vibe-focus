import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import chalk from 'chalk';
import { success, error, info } from '../ui/output.js';

const GIT_HOOK_MARKER = '# vibe-focus:post-commit';
const BUNDLED_SCRIPT_NAME = 'git-post-commit.mjs';

function getBundledGitHookPath(): string {
  const thisFile = fileURLToPath(import.meta.url);
  return path.join(path.dirname(thisFile), BUNDLED_SCRIPT_NAME);
}

function findGitDir(startDir: string): string | null {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    const gitDir = path.join(dir, '.git');
    if (fs.existsSync(gitDir)) return gitDir;
    dir = path.dirname(dir);
  }
  return null;
}

export const hookCommand = new Command('hook')
  .description('Install/remove git hooks for auto-tracking')
  .option('--install-git', 'Install git post-commit hook')
  .option('--remove-git', 'Remove git post-commit hook')
  .option('--status', 'Check installed hooks')
  .action((opts) => {
    if (opts.installGit) {
      installGitHook();
    } else if (opts.removeGit) {
      removeGitHook();
    } else {
      checkHookStatus();
    }
  });

export function installGitHook(): boolean {
  const cwd = process.cwd();
  const gitDir = findGitDir(cwd);

  if (!gitDir) {
    error('Not a git repository. Run this from inside a git project.');
    return false;
  }

  const hooksDir = path.join(gitDir, 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });

  // Copy bundled script to .vibe-focus/
  const vfDir = path.join(cwd, '.vibe-focus');
  fs.mkdirSync(vfDir, { recursive: true });
  const scriptDest = path.join(vfDir, BUNDLED_SCRIPT_NAME);
  const bundledPath = getBundledGitHookPath();

  if (fs.existsSync(bundledPath)) {
    fs.copyFileSync(bundledPath, scriptDest);
    fs.chmodSync(scriptDest, '755');
  } else {
    error(`Hook script not found at ${bundledPath}. Run "npm run build" first.`);
    return false;
  }

  // Append to .git/hooks/post-commit (don't overwrite existing hooks)
  const hookFile = path.join(hooksDir, 'post-commit');
  const invocation = `\n${GIT_HOOK_MARKER}\nnode "${scriptDest}" &\n`;

  if (fs.existsSync(hookFile)) {
    const content = fs.readFileSync(hookFile, 'utf-8');
    if (content.includes(GIT_HOOK_MARKER)) {
      info('Git post-commit hook already installed.');
      return true;
    }
    fs.appendFileSync(hookFile, invocation);
  } else {
    fs.writeFileSync(hookFile, `#!/bin/sh\n${invocation}`);
  }
  fs.chmodSync(hookFile, '755');

  console.log('');
  console.log(chalk.greenBright('  ╔═══════════════════════════════════════════╗'));
  console.log(chalk.greenBright('  ║') + chalk.bold.green('   GIT HOOK INSTALLED                  ') + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ╠═══════════════════════════════════════════╣'));
  console.log(chalk.greenBright('  ║') + '                                           ' + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ║') + chalk.cyan('  Hook:   ') + chalk.dim('.git/hooks/post-commit         ') + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ║') + chalk.cyan('  Script: ') + chalk.dim('.vibe-focus/git-post-commit.mjs') + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ║') + '                                           ' + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ║') + chalk.dim('  Every commit will auto-push activity  ') + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ║') + chalk.dim('  and heartbeats to vibeteamz.          ') + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ║') + '                                           ' + chalk.greenBright('║'));
  console.log(chalk.greenBright('  ╚═══════════════════════════════════════════╝'));
  console.log('');
  info('Remove with: vf hook --remove-git');
  return true;
}

function removeGitHook(): void {
  const cwd = process.cwd();
  const gitDir = findGitDir(cwd);

  if (!gitDir) {
    error('Not a git repository.');
    return;
  }

  const hookFile = path.join(gitDir, 'hooks', 'post-commit');
  if (!fs.existsSync(hookFile)) {
    info('No post-commit hook found.');
    return;
  }

  const content = fs.readFileSync(hookFile, 'utf-8');
  if (!content.includes(GIT_HOOK_MARKER)) {
    info('No vibe-focus hook found in post-commit.');
    return;
  }

  // Remove our lines but preserve other hooks
  const lines = content.split('\n');
  const filtered: string[] = [];
  let skipNext = false;
  for (const line of lines) {
    if (line.includes(GIT_HOOK_MARKER)) {
      skipNext = true;
      continue;
    }
    if (skipNext) {
      skipNext = false;
      continue;
    }
    filtered.push(line);
  }

  const cleaned = filtered.join('\n').trim();
  if (cleaned === '#!/bin/sh' || cleaned === '') {
    fs.unlinkSync(hookFile);
  } else {
    fs.writeFileSync(hookFile, cleaned + '\n');
  }

  // Remove script from .vibe-focus/
  const scriptPath = path.join(cwd, '.vibe-focus', BUNDLED_SCRIPT_NAME);
  if (fs.existsSync(scriptPath)) {
    fs.unlinkSync(scriptPath);
  }

  success('Git post-commit hook removed.');
}

function checkHookStatus(): void {
  const cwd = process.cwd();
  const gitDir = findGitDir(cwd);

  console.log('');
  console.log(chalk.bold('Hook Status:'));
  console.log('');

  // Git hook
  if (gitDir) {
    const hookFile = path.join(gitDir, 'hooks', 'post-commit');
    const hasHook = fs.existsSync(hookFile) &&
      fs.readFileSync(hookFile, 'utf-8').includes(GIT_HOOK_MARKER);
    console.log(`  Git post-commit:  ${hasHook ? chalk.green('installed') : chalk.dim('not installed')}`);
  } else {
    console.log(`  Git post-commit:  ${chalk.dim('no git repo')}`);
  }

  // Claude Code hook (check .claude/settings.json)
  const claudeSettings = path.join(cwd, '.claude', 'settings.json');
  if (fs.existsSync(claudeSettings)) {
    try {
      const settings = JSON.parse(fs.readFileSync(claudeSettings, 'utf-8'));
      const hasGuard = settings.hooks?.UserPromptSubmit?.some(
        (e: any) => e.hooks?.some((h: any) => h.command?.includes('vibe-focus-guard'))
      );
      const hasAutoTrack = settings.hooks?.PostToolUse?.some(
        (e: any) => e.hooks?.some((h: any) => h.command?.includes('vibe-focus-auto-track'))
      );
      console.log(`  Claude guard:     ${hasGuard ? chalk.green('installed') : chalk.dim('not installed')}`);
      console.log(`  Claude auto-track:${hasAutoTrack ? chalk.green(' installed') : chalk.dim(' not installed')}`);
    } catch {
      console.log(`  Claude hooks:     ${chalk.dim('settings unreadable')}`);
    }
  } else {
    console.log(`  Claude hooks:     ${chalk.dim('no .claude/settings.json')}`);
  }

  console.log('');
  info('Install git hook:    vf hook --install-git');
  info('Install Claude hook: vf guard --install --agent claude');
  console.log('');
}
