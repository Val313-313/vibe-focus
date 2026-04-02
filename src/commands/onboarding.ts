import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { initProject } from '../core/state.js';
import { resolveAgent, isValidAgent } from '../agents/resolve.js';
import { AGENT_CONFIGS, type AgentType } from '../agents/types.js';
import { updateConfig } from '../core/config.js';
import { installGuard } from './guard.js';
import { installGitHook } from './hook.js';
import { readCloudConfig } from '../cloud/core/cloud-state.js';
import { githubDeviceFlow, autoLinkProject } from '../cloud/commands/login.js';
import { fireHeartbeat } from '../cloud/core/heartbeat.js';
import { success, error, info, warn } from '../ui/output.js';

export interface OnboardingOptions {
  projectName?: string;
  agent?: string;
  skipLogin?: boolean;
  skipGuard?: boolean;
  skipHook?: boolean;
  isJoin?: boolean;
}

export interface OnboardingResult {
  initialized: boolean;
  loggedIn: boolean;
  linked: boolean;
  guardInstalled: boolean;
  hookInstalled: boolean;
}

const STATE_DIR = '.vibe-focus';
const STATE_FILE = 'state.json';

function isInitialized(): boolean {
  return fs.existsSync(path.join(process.cwd(), STATE_DIR, STATE_FILE));
}

function stepLabel(step: number, total: number, label: string): string {
  return chalk.dim(`Step ${step}/${total}`) + '  ' + label;
}

export async function runOnboarding(opts: OnboardingOptions): Promise<OnboardingResult> {
  const result: OnboardingResult = {
    initialized: false,
    loggedIn: false,
    linked: false,
    guardInstalled: false,
    hookInstalled: false,
  };

  const totalSteps = 5
    - (opts.skipLogin ? 1 : 0)
    - (opts.skipGuard ? 1 : 0)
    - (opts.skipHook ? 1 : 0);
  let step = 0;

  const verb = opts.isJoin ? 'Joining' : 'Setting up';
  console.log('');
  console.log(chalk.greenBright(`  ${verb} vibe-focus...`));
  console.log('');

  // ── Step: Initialize project ──
  step++;
  if (isInitialized()) {
    console.log(stepLabel(step, totalSteps, chalk.green('Project already initialized') + chalk.dim(' (skipped)')));
    result.initialized = true;

    // If joining, show imported task count
    if (opts.isJoin) {
      const tasksPath = path.join(process.cwd(), STATE_DIR, 'tasks.json');
      if (fs.existsSync(tasksPath)) {
        try {
          const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf-8'));
          if (Array.isArray(tasks) && tasks.length > 0) {
            info(`Found ${tasks.length} task${tasks.length === 1 ? '' : 's'} in team backlog`);
          }
        } catch { /* ignore parse errors */ }
      }
    }
  } else {
    const projectName = opts.projectName ?? path.basename(process.cwd());
    console.log(stepLabel(step, totalSteps, opts.isJoin ? 'Joining project...' : 'Initialize project'));
    try {
      const { importedCount } = initProject(projectName);
      result.initialized = true;
      success(`Initialized "${projectName}"`);
      if (importedCount > 0) {
        info(`Imported ${importedCount} task${importedCount === 1 ? '' : 's'} from team backlog`);
      }
    } catch (e: any) {
      error(e.message);
      return result;
    }
  }

  // Save agent to config if specified
  const agentType = opts.agent && isValidAgent(opts.agent) ? opts.agent as AgentType : undefined;
  if (agentType) {
    updateConfig({ agent: agentType });
  }

  // ── Step: Login to vibeteamz ──
  if (!opts.skipLogin) {
    step++;
    const config = readCloudConfig();
    if (config.accessToken && config.userId) {
      console.log(stepLabel(step, totalSteps, chalk.green('Already logged in') + chalk.dim(' (skipped)')));
      result.loggedIn = true;

      // Still try to auto-link if not linked
      if (!config.projectId) {
        result.linked = await autoLinkProject(config);
      } else {
        result.linked = true;
      }
    } else {
      console.log(stepLabel(step, totalSteps, 'Login to vibeteamz (GitHub)'));
      result.loggedIn = await githubDeviceFlow(config);
      if (result.loggedIn) {
        const updated = readCloudConfig();
        result.linked = !!updated.projectId;
      }
    }
  }

  // ── Step: Install focus guardian ──
  if (!opts.skipGuard) {
    step++;
    const agent = agentType ?? resolveAgent();
    const agentName = AGENT_CONFIGS[agent].displayName;
    console.log(stepLabel(step, totalSteps, `Install focus guardian (${agentName})`));
    try {
      installGuard(agent);
      result.guardInstalled = true;
    } catch {
      warn('Guard installation failed. Install manually with: vf guard --install');
    }
  }

  // ── Step: Install git hook ──
  if (!opts.skipHook) {
    step++;
    console.log(stepLabel(step, totalSteps, 'Install git hook'));
    try {
      result.hookInstalled = installGitHook();
    } catch {
      warn('Git hook installation failed. Install manually with: vf hook --install-git');
    }
  }

  // ── Summary ──
  console.log('');
  if (result.linked) {
    // Fire a heartbeat to confirm connection
    fireHeartbeat();
    console.log(chalk.greenBright('  ♥ Connected to vibeteamz!'));
  } else if (result.loggedIn) {
    console.log(chalk.yellow('  ♥ Logged in but not linked to a project'));
    info('Link with: vf vibeteamz link <project-id>');
  } else if (!opts.skipLogin) {
    console.log(chalk.dim('  ♥ vibeteamz: not connected'));
    info('Login later with: vf vibeteamz login --github');
  }

  console.log('');
  if (result.initialized) {
    info('Next: vf add "Your first task" && vf start t1');
  }
  console.log('');

  return result;
}
