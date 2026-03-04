import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { Command } from 'commander';
import { readState, writeState } from '../core/state.js';
import { getActiveTask, criteriaProgress } from '../core/task.js';
import { generateClaudeMd } from '../generators/claude-md.js';
import { success, error, info } from '../ui/output.js';
import type { ProjectScope } from '../types/index.js';

export const scopeCommand = new Command('scope')
  .description('Define project scope or generate CLAUDE.md rules')
  .option('--define', 'Interactively define or update project scope')
  .option('--purpose <purpose>', 'Set project purpose')
  .option('--in <items...>', 'Add items to in-scope')
  .option('--out <items...>', 'Add items to out-of-scope')
  .option('--boundary <items...>', 'Add scope boundaries')
  .option('--show', 'Show current project scope')
  .option('--rules', 'Write to .claude/rules/vibe-focus.md')
  .option('--claude-md', 'Append to CLAUDE.md')
  .action((opts) => {
    let state = readState();

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

      // Generate CLAUDE.md output
      if (opts.rules || opts.claudeMd) {
        const content = generateClaudeMd(state);
        if (opts.rules) {
          writeRulesFile(content);
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
      const content = generateClaudeMd(state);
      if (opts.rules) writeRulesFile(content);
      if (opts.claudeMd) appendClaudeMd(content);
    }
  });

function writeRulesFile(content: string): void {
  const dir = path.join(process.cwd(), '.claude', 'rules');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, 'vibe-focus.md');
  fs.writeFileSync(filePath, content);
  success(`Written to ${filePath}`);
}

function appendClaudeMd(content: string): void {
  const filePath = path.join(process.cwd(), 'CLAUDE.md');
  const marker = '<!-- vibe-focus:start -->';
  const endMarker = '<!-- vibe-focus:end -->';
  const wrapped = `${marker}\n${content}\n${endMarker}`;

  if (fs.existsSync(filePath)) {
    let existing = fs.readFileSync(filePath, 'utf-8');
    const startIdx = existing.indexOf(marker);
    const endIdx = existing.indexOf(endMarker);

    if (startIdx >= 0 && endIdx >= 0) {
      existing =
        existing.slice(0, startIdx) +
        wrapped +
        existing.slice(endIdx + endMarker.length);
    } else {
      existing += '\n\n' + wrapped;
    }

    fs.writeFileSync(filePath, existing);
  } else {
    fs.writeFileSync(filePath, wrapped + '\n');
  }

  success(`Written to ${filePath}`);
}
