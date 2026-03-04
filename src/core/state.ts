import fs from 'node:fs';
import path from 'node:path';
import type { VibeFocusState } from '../types/index.js';

const STATE_DIR = '.vibe-focus';
const STATE_FILE = 'state.json';

function findProjectRoot(): string {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, STATE_DIR, STATE_FILE))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  throw new Error('Not a vibe-focus project. Run "vf init" to initialize.');
}

export function getStatePath(): string {
  const root = findProjectRoot();
  return path.join(root, STATE_DIR, STATE_FILE);
}

export function getStateDir(): string {
  const root = findProjectRoot();
  return path.join(root, STATE_DIR);
}

export function readState(): VibeFocusState {
  const filePath = getStatePath();
  const raw = fs.readFileSync(filePath, 'utf-8');
  const state = JSON.parse(raw) as VibeFocusState;
  // Backwards compat: add notes if missing
  if (!state.notes) state.notes = [];
  if (!state.nextNoteNumber) state.nextNoteNumber = 1;
  return state;
}

export function writeState(state: VibeFocusState): void {
  const filePath = getStatePath();
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  fs.renameSync(tmpPath, filePath);
}

export function updateState(fn: (state: VibeFocusState) => VibeFocusState): void {
  const state = readState();
  const newState = fn(state);
  writeState(newState);
}

export function createEmptyState(projectName: string): VibeFocusState {
  return {
    version: 1,
    projectName,
    projectScope: null,
    activeTaskId: null,
    nextTaskNumber: 1,
    tasks: [],
    notes: [],
    nextNoteNumber: 1,
    currentSession: null,
    focusEvents: [],
  };
}

export function initProject(projectName: string): string {
  const dir = path.join(process.cwd(), STATE_DIR);
  if (fs.existsSync(path.join(dir, STATE_FILE))) {
    throw new Error('Already initialized. Use "vf status" to see current state.');
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.gitignore'), '*\n');
  const state = createEmptyState(projectName);
  fs.writeFileSync(path.join(dir, STATE_FILE), JSON.stringify(state, null, 2));
  return dir;
}
