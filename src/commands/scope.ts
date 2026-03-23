import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { Command } from 'commander';
import { readState, writeState } from '../core/state.js';
import { getActiveTask, criteriaProgress } from '../core/task.js';
import { generateRulesMd } from '../generators/rules-md.js';
import { resolveAgent } from '../agents/resolve.js';
import { AGENT_CONFIGS } from '../agents/types.js';
import { success, error, info } from '../ui/output.js';
import type { ProjectScope } from '../types/index.js';

const MARKER_START = '<!-- vibe-focus:start -->';
const MARKER_END = '<!-- vibe-focus:end -->';

export const scopeCommand = new Command('scope')
  .description('Define project scope or generate rules for your AI agent')
  .option('--define', 'Interactively define or update project scope')
  .option('--purpose <purpose>', 'Set project purpose')
  .option('--in <items...>', 'Add items to in-scope')
  .option('--out <items...>', 'Add items to out-of-scope')
  .option('--boundary <items...>', 'Add scope boundaries')
  .option('--show', 'Show current project scope')
  .option('--rules', 'Write rules file for AI agent')
  .option('--claude-md', 'Append to CLAUDE.md')
  .option('--agent <type>', 'AI agent type: claude, cursor, copilot, windsurf, generic')
  .action((opts) => {
    let state = readState();
    const agent = resolveAgent(opts.agent);
    const agentConfig = AGENT_CONFIGS[agent];

    // Show current scope
    if (opts.show || (!opts.define && !opts.purpose && !opts.in && !opts.out && !opts.boundary && !opts.rules && !opts.claudeMd)) {
      if (!state.projectScope) {
        info('No project scope defined yet.');
        info('Run "vf scope --define" to set it up.');
        console.log('');
        info('Or set individual fields:');
        console.log('  vf scope --purpose "Build a task tracking CLI"');
        console.log('  vf scope --in "CLI commands" "State management"');
        console.log('  vf scope --out "Web UI" "Mobile app"');
        return;
      }

      console.log(chalk.bold(`\nProject Scope: ${state.projectName}`));
      console.log('');
      console.log(chalk.cyan('Purpose:'));
      console.log(`  ${state.projectScope.purpose}`);

      if (state.projectScope.boundaries.length > 0) {
        console.log('');
        console.log(chalk.cyan('Boundaries:'));
        for (const b of state.projectScope.boundaries) {
          console.log(`  - ${b}`);
        }
      }

      if (state.projectScope.inScope.length > 0) {
        console.log('');
        console.log(chalk.green('In Scope:'));
        for (const item of state.projectScope.inScope) {
          console.log(`  + ${item}`);
        }
      }

      if (state.projectScope.outOfScope.length > 0) {
        console.log('');
        console.log(chalk.red('Out of Scope:'));
        for (const item of state.projectScope.outOfScope) {
          console.log(`  - ${item}`);
        }
      }

      // Generate rules output
      if (opts.rules || opts.claudeMd) {
        const content = generateRulesMd(state);
        if (opts.rules) {
          writeAgentRules(content, agent);
        }
        if (opts.claudeMd) {
          appendClaudeMd(content);
        }
      }

      return;
    }

    // Initialize scope if needed
    if (!state.projectScope) {
      state = {
        ...state,
        projectScope: {
          purpose: '',
          boundaries: [],
          inScope: [],
          outOfScope: [],
        },
      };
    }

    const scope = state.projectScope!;

    if (opts.purpose) {
      scope.purpose = opts.purpose;
    }

    if (opts.in) {
      scope.inScope = [...new Set([...scope.inScope, ...opts.in])];
    }

    if (opts.out) {
      scope.outOfScope = [...new Set([...scope.outOfScope, ...opts.out])];
    }

    if (opts.boundary) {
      scope.boundaries = [...new Set([...scope.boundaries, ...opts.boundary])];
    }

    state = { ...state, projectScope: scope };
    writeState(state);
    success('Project scope updated.');

    // Show updated scope
    if (scope.purpose) console.log(`  Purpose: ${scope.purpose}`);
    if (scope.inScope.length > 0) console.log(`  In scope: ${scope.inScope.join(', ')}`);
    if (scope.outOfScope.length > 0) console.log(`  Out of scope: ${scope.outOfScope.join(', ')}`);

    // Generate files if requested
    if (opts.rules || opts.claudeMd) {
      const content = generateRulesMd(state);
      if (opts.rules) writeAgentRules(content, agent);
      if (opts.claudeMd) appendClaudeMd(content);
    }
  });

function writeAgentRules(content: string, agent: ReturnType<typeof resolveAgent>): void {
  const config = AGENT_CONFIGS[agent];

  if (agent === 'generic') {
    console.log('');
    console.log(content);
    console.log('');
    info('Copy the above rules into your AI agent\'s system prompt.');
    return;
  }

  if (agent === 'copilot') {
    const filePath = path.join(process.cwd(), config.rulesDir, config.rulesFile);
    appendWithMarkers(filePath, content);
    success(`Written to ${config.rulesDir}/${config.rulesFile}`);
    return;
  }

  // Claude and Cursor: write dedicated file
  const dir = path.join(process.cwd(), config.rulesDir);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, config.rulesFile);
  fs.writeFileSync(filePath, content);
  success(`Written to ${filePath}`);
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

function appendClaudeMd(content: string): void {
  const filePath = path.join(process.cwd(), 'CLAUDE.md');
  appendWithMarkers(filePath, content);
  success(`Written to ${filePath}`);
}
