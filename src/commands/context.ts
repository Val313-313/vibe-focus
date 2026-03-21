import { Command } from 'commander';
import { createInterface } from 'node:readline/promises';
import chalk from 'chalk';
import { readState, writeState } from '../core/state.js';
import { getActiveTask } from '../core/task.js';
import { success, info, warn } from '../ui/output.js';
import type { SessionContext } from '../types/index.js';

const MAX_CONTEXTS = 5; // keep last 5 session contexts

export interface StructuredContextFields {
  decisions?: string[];
  openQuestions?: string[];
  projectState?: string;
  techStack?: string[];
}

export const contextCommand = new Command('context')
  .description('Save and restore session context across Claude Code sessions')
  .argument('[summary...]', 'Session summary to save')
  .option('--show', 'Show the most recent saved context')
  .option('--list', 'List all saved session contexts')
  .option('--clear', 'Clear all saved contexts')
  .option('--decisions <decisions...>', 'Key decisions made')
  .option('--questions <questions...>', 'Open/unresolved questions')
  .option('--project-state <state>', 'Current project state (e.g. "lokal in dev")')
  .option('--tech-stack <stack...>', 'Active tech stack')
  .option('-i, --interactive', 'Interactively enter structured context fields')
  .action(async (summaryParts, opts) => {
    if (opts.show) {
      showContext();
      return;
    }
    if (opts.list) {
      listContexts();
      return;
    }
    if (opts.clear) {
      clearContexts();
      return;
    }

    if (opts.interactive) {
      await saveContextInteractive();
      return;
    }

    const summary = summaryParts?.join(' ')?.trim();
    if (!summary) {
      showContext();
      return;
    }

    saveContext(summary, {
      decisions: opts.decisions,
      openQuestions: opts.questions,
      projectState: opts.projectState,
      techStack: opts.techStack,
    });
  });

async function promptMultiLine(rl: ReturnType<typeof createInterface>, label: string): Promise<string[]> {
  const items: string[] = [];
  console.log(chalk.cyan(`\n${label} (one per line, empty line to skip/finish):`));
  let index = 1;
  process.stdout.write(chalk.gray(`  ${index}. `));

  return new Promise((resolve) => {
    rl.on('line', (line) => {
      if (line.trim() === '') {
        rl.removeAllListeners('line');
        resolve(items);
        return;
      }
      items.push(line.trim());
      index++;
      process.stdout.write(chalk.gray(`  ${index}. `));
    });
  });
}

async function saveContextInteractive(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    const summary = await rl.question(chalk.cyan('Session summary: '));

    if (!summary.trim()) {
      info('No summary provided. Context not saved.');
      rl.close();
      return;
    }

    const decisions = await promptMultiLine(rl, 'Decisions');
    const openQuestions = await promptMultiLine(rl, 'Open questions');
    const projectState = await rl.question(chalk.cyan('\nProject state (e.g. "lokal in dev", empty to skip): '));
    const techStack = await promptMultiLine(rl, 'Tech stack');

    rl.close();

    saveContext(summary.trim(), {
      decisions: decisions.length > 0 ? decisions : undefined,
      openQuestions: openQuestions.length > 0 ? openQuestions : undefined,
      projectState: projectState.trim() || undefined,
      techStack: techStack.length > 0 ? techStack : undefined,
    });
  } catch {
    rl.close();
  }
}

export function saveContext(
  summary: string,
  fields: StructuredContextFields = {},
  explicitTaskId?: string,
  quiet: boolean = false,
): void {
  const state = readState();
  const active = getActiveTask(state);

  const ctx: SessionContext = {
    id: `ctx-${state.nextContextNumber}`,
    taskId: explicitTaskId ?? active?.id ?? null,
    savedAt: new Date().toISOString(),
    summary,
    ...(fields.decisions && { decisions: fields.decisions }),
    ...(fields.openQuestions && { openQuestions: fields.openQuestions }),
    ...(fields.projectState && { projectState: fields.projectState }),
    ...(fields.techStack && { techStack: fields.techStack }),
  };

  state.sessionContexts.push(ctx);
  state.nextContextNumber++;

  // Trim to max
  if (state.sessionContexts.length > MAX_CONTEXTS) {
    state.sessionContexts = state.sessionContexts.slice(-MAX_CONTEXTS);
  }

  writeState(state);

  if (quiet) {
    info(`Session context saved (${ctx.id}).`);
    return;
  }

  const gB = chalk.greenBright;
  const gD = chalk.dim.green;
  const c = chalk.cyan;
  const d = chalk.dim;

  console.log('');
  console.log(gD('  ╔═══════════════════════════════════════════╗'));
  console.log(gD('  ║') + gB('   SESSION CONTEXT SAVED                 ') + gD('║'));
  console.log(gD('  ╠═══════════════════════════════════════════╣'));
  console.log(gD('  ║') + '                                           ' + gD('║'));

  // Wrap summary to fit in the box
  printWrapped(summary, gD);

  console.log(gD('  ║') + '                                           ' + gD('║'));
  console.log(gD('  ║') + d(`  ID: ${ctx.id}`) + ' '.repeat(Math.max(0, 35 - ctx.id.length)) + gD('║'));

  const taskRef = explicitTaskId ? state.tasks.find(t => t.id === explicitTaskId) : active;
  if (taskRef) {
    const taskInfo = `  Task: ${taskRef.id} - ${taskRef.title}`;
    console.log(gD('  ║') + d(taskInfo.slice(0, 41).padEnd(41)) + gD('║'));
  }

  // Structured fields
  if (ctx.decisions?.length) {
    console.log(gD('  ║') + '                                           ' + gD('║'));
    console.log(gD('  ║') + c('  Decisions:'.padEnd(41)) + gD('║'));
    for (const dec of ctx.decisions) {
      console.log(gD('  ║') + d(`    - ${dec}`.slice(0, 41).padEnd(41)) + gD('║'));
    }
  }
  if (ctx.openQuestions?.length) {
    console.log(gD('  ║') + c('  Open Questions:'.padEnd(41)) + gD('║'));
    for (const q of ctx.openQuestions) {
      console.log(gD('  ║') + d(`    ? ${q}`.slice(0, 41).padEnd(41)) + gD('║'));
    }
  }
  if (ctx.projectState) {
    console.log(gD('  ║') + c('  State: ') + d(ctx.projectState.slice(0, 32).padEnd(32)) + gD('║'));
  }
  if (ctx.techStack?.length) {
    console.log(gD('  ║') + c('  Stack: ') + d(ctx.techStack.join(', ').slice(0, 32).padEnd(32)) + gD('║'));
  }

  console.log(gD('  ║') + '                                           ' + gD('║'));
  console.log(gD('  ╚═══════════════════════════════════════════╝'));
  console.log('');

  info('This context will auto-inject into your next Claude Code session via the guard hook.');
  info(`${state.sessionContexts.length}/${MAX_CONTEXTS} context slots used.`);
}

function printWrapped(text: string, gD: chalk.Chalk): void {
  const maxLine = 39;
  const words = text.split(' ');
  let line = '';
  const lines: string[] = [];
  for (const word of words) {
    if (line.length + word.length + 1 > maxLine) {
      lines.push(line);
      line = word;
    } else {
      line = line ? line + ' ' + word : word;
    }
  }
  if (line) lines.push(line);

  for (const l of lines) {
    console.log(gD('  ║') + `  ${l.padEnd(41)}` + gD('║'));
  }
}

function showContext(): void {
  const state = readState();

  if (state.sessionContexts.length === 0) {
    info('No session context saved yet.');
    info('Save one with: vf context "what was accomplished, decisions made, next steps..."');
    return;
  }

  const latest = state.sessionContexts[state.sessionContexts.length - 1];
  const age = getTimeAgo(latest.savedAt);

  const gB = chalk.greenBright;
  const gD = chalk.dim.green;
  const c = chalk.cyan;
  const d = chalk.dim;

  console.log('');
  console.log(gD('  ╔═══════════════════════════════════════════╗'));
  console.log(gD('  ║') + gB('   LAST SESSION CONTEXT                  ') + gD('║'));
  console.log(gD('  ╠═══════════════════════════════════════════╣'));
  console.log(gD('  ║') + '                                           ' + gD('║'));
  console.log(gD('  ║') + c(`  ${latest.id}`) + d(` saved ${age}`.padEnd(41 - latest.id.length)) + gD('║'));

  if (latest.taskId) {
    const task = state.tasks.find(t => t.id === latest.taskId);
    const taskInfo = task ? `  Task: ${task.id} - ${task.title}` : `  Task: ${latest.taskId}`;
    console.log(gD('  ║') + d(taskInfo.slice(0, 41).padEnd(41)) + gD('║'));
  }

  console.log(gD('  ║') + '                                           ' + gD('║'));

  // Summary
  printWrapped(latest.summary, gD);

  // Structured fields
  if (latest.decisions?.length) {
    console.log(gD('  ║') + '                                           ' + gD('║'));
    console.log(gD('  ║') + c('  Decisions:'.padEnd(41)) + gD('║'));
    for (const dec of latest.decisions) {
      console.log(gD('  ║') + d(`    - ${dec}`.slice(0, 41).padEnd(41)) + gD('║'));
    }
  }
  if (latest.openQuestions?.length) {
    console.log(gD('  ║') + c('  Open Questions:'.padEnd(41)) + gD('║'));
    for (const q of latest.openQuestions) {
      console.log(gD('  ║') + d(`    ? ${q}`.slice(0, 41).padEnd(41)) + gD('║'));
    }
  }
  if (latest.projectState) {
    console.log(gD('  ║') + c('  State: ') + d(latest.projectState.slice(0, 32).padEnd(32)) + gD('║'));
  }
  if (latest.techStack?.length) {
    console.log(gD('  ║') + c('  Stack: ') + d(latest.techStack.join(', ').slice(0, 32).padEnd(32)) + gD('║'));
  }

  console.log(gD('  ║') + '                                           ' + gD('║'));
  console.log(gD('  ╚═══════════════════════════════════════════╝'));
  console.log('');
}

function listContexts(): void {
  const state = readState();

  if (state.sessionContexts.length === 0) {
    info('No session contexts saved yet.');
    info('Save one with: vf context "summary of what was done..."');
    return;
  }

  const gB = chalk.greenBright;
  const d = chalk.dim;
  const c = chalk.cyan;
  const y = chalk.yellow;

  console.log('');
  console.log(gB('  SESSION CONTEXTS'));
  console.log(d('  ─────────────────────────────────────────'));
  console.log('');

  for (const ctx of state.sessionContexts) {
    const age = getTimeAgo(ctx.savedAt);
    const taskInfo = ctx.taskId ? d(` (${ctx.taskId})`) : '';
    const preview = ctx.summary.length > 50 ? ctx.summary.slice(0, 47) + '...' : ctx.summary;

    console.log(`  ${c(ctx.id)}${taskInfo}  ${d(age)}`);
    console.log(`  ${preview}`);
    if (ctx.projectState) {
      console.log(`  ${y('state:')} ${ctx.projectState}`);
    }
    if (ctx.techStack?.length) {
      console.log(`  ${y('stack:')} ${ctx.techStack.join(', ')}`);
    }
    console.log('');
  }

  console.log(d(`  ${state.sessionContexts.length}/${MAX_CONTEXTS} slots used`));
  console.log('');
}

function clearContexts(): void {
  const state = readState();
  const count = state.sessionContexts.length;
  state.sessionContexts = [];
  writeState(state);

  if (count > 0) {
    success(`Cleared ${count} saved context${count > 1 ? 's' : ''}.`);
  } else {
    info('No contexts to clear.');
  }
}

function getTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
