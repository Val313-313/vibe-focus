import { Command } from 'commander';
import chalk from 'chalk';
import { readState, writeState } from '../core/state.js';
import { getActiveTask, createTask } from '../core/task.js';
import { success, info, warn } from '../ui/output.js';
import type { Note } from '../types/index.js';

export const noteCommand = new Command('note')
  .description('Quick-capture an idea without losing focus (parking lot)')
  .argument('[text]', 'The idea or note to capture')
  .option('--promote <id>', 'Promote a note to a backlog task')
  .option('--list', 'List all notes')
  .option('--clear', 'Clear all promoted notes')
  .action((text, opts) => {
    if (opts.list) {
      listNotes();
      return;
    }
    if (opts.promote) {
      promoteNote(opts.promote);
      return;
    }
    if (opts.clear) {
      clearPromoted();
      return;
    }
    if (!text) {
      listNotes();
      return;
    }
    captureNote(text);
  });

function captureNote(text: string): void {
  const state = readState();
  const active = getActiveTask(state);

  const note: Note = {
    id: `n${state.nextNoteNumber}`,
    text,
    capturedDuring: active?.id || null,
    createdAt: new Date().toISOString(),
    promoted: false,
    promotedToTaskId: null,
  };

  state.notes.push(note);
  state.nextNoteNumber++;
  writeState(state);

  console.log('');
  console.log(chalk.dim('  ┌─────────────────────────────────────────┐'));
  console.log(chalk.dim('  │') + chalk.yellow(' NOTE CAPTURED') + chalk.dim('                          │'));
  console.log(chalk.dim('  ├─────────────────────────────────────────┤'));
  console.log(chalk.dim('  │') + ` ${chalk.cyan(note.id)} ${text.length > 34 ? text.slice(0, 31) + '...' : text.padEnd(34)}` + chalk.dim(' │'));
  if (active) {
    console.log(chalk.dim('  │') + chalk.dim(` saved during: ${active.id} - ${active.title}`.slice(0, 39).padEnd(39)) + chalk.dim(' │'));
  }
  console.log(chalk.dim('  └─────────────────────────────────────────┘'));
  console.log('');

  if (active) {
    info(`Back to work: "${active.title}"`);
  }

  const unpromoted = state.notes.filter(n => !n.promoted).length;
  if (unpromoted >= 5) {
    warn(`${unpromoted} notes parked. Run "vf note --list" to review.`);
  }
}

function listNotes(): void {
  const state = readState();
  const unpromoted = state.notes.filter(n => !n.promoted);
  const promoted = state.notes.filter(n => n.promoted);

  if (unpromoted.length === 0 && promoted.length === 0) {
    info('No notes captured yet. Use: vf note "your idea"');
    return;
  }

  console.log('');
  console.log(chalk.bold.greenBright('  PARKING LOT'));
  console.log(chalk.dim('  ─────────────────────────────────────────'));

  if (unpromoted.length > 0) {
    console.log('');
    for (const note of unpromoted) {
      const during = note.capturedDuring ? chalk.dim(` (during ${note.capturedDuring})`) : '';
      console.log(`  ${chalk.cyan(note.id)}  ${note.text}${during}`);
    }
    console.log('');
    console.log(chalk.dim(`  ${unpromoted.length} note${unpromoted.length > 1 ? 's' : ''} waiting. Promote to task: vf note --promote <id>`));
  }

  if (promoted.length > 0) {
    console.log('');
    console.log(chalk.dim('  Already promoted:'));
    for (const note of promoted) {
      console.log(chalk.dim(`  ${note.id}  ${note.text} → ${note.promotedToTaskId}`));
    }
  }

  console.log('');
}

function promoteNote(noteId: string): void {
  const state = readState();
  const note = state.notes.find(n => n.id === noteId);

  if (!note) {
    warn(`Note "${noteId}" not found. Use "vf note --list" to see notes.`);
    return;
  }

  if (note.promoted) {
    info(`Note "${noteId}" was already promoted to task ${note.promotedToTaskId}.`);
    return;
  }

  // Create a backlog task from the note
  const result = createTask(state, note.text, {});

  // Mark note as promoted
  const updatedNotes = state.notes.map(n =>
    n.id === noteId ? { ...n, promoted: true, promotedToTaskId: result.task.id } : n
  );

  const finalState = { ...result.state, notes: updatedNotes };
  writeState(finalState);

  success(`Promoted ${noteId} → task ${result.task.id}: "${note.text}"`);
  info('Add criteria with: vf add is not needed - task is already created.');
  info(`Start when ready: vf start ${result.task.id}`);
}

function clearPromoted(): void {
  const state = readState();
  const before = state.notes.length;
  state.notes = state.notes.filter(n => !n.promoted);
  const removed = before - state.notes.length;
  writeState(state);

  if (removed > 0) {
    success(`Cleared ${removed} promoted note${removed > 1 ? 's' : ''}.`);
  } else {
    info('No promoted notes to clear.');
  }
}
