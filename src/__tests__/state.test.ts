import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createEmptyState, initProject, readState, writeState } from '../core/state.js';
import type { VibeFocusState } from '../types/index.js';

let tmpDir: string;
let originalCwd: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-test-'));
  originalCwd = process.cwd();
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('createEmptyState', () => {
  it('creates state with correct defaults', () => {
    const state = createEmptyState('my-project');

    expect(state.version).toBe(1);
    expect(state.projectName).toBe('my-project');
    expect(state.projectScope).toBeNull();
    expect(state.activeTaskId).toBeNull();
    expect(state.nextTaskNumber).toBe(1);
    expect(state.tasks).toEqual([]);
    expect(state.notes).toEqual([]);
    expect(state.nextNoteNumber).toBe(1);
    expect(state.currentSession).toBeNull();
    expect(state.focusEvents).toEqual([]);
    expect(state.sessionContexts).toEqual([]);
    expect(state.nextContextNumber).toBe(1);
  });
});

describe('initProject', () => {
  it('creates .vibe-focus directory with state.json and .gitignore', () => {
    initProject('test-project');

    expect(fs.existsSync(path.join(tmpDir, '.vibe-focus'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.vibe-focus', 'state.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.vibe-focus', '.gitignore'))).toBe(true);
  });

  it('gitignore contains wildcard', () => {
    initProject('test-project');

    const gitignore = fs.readFileSync(path.join(tmpDir, '.vibe-focus', '.gitignore'), 'utf-8');
    expect(gitignore.trim()).toBe('*');
  });

  it('state.json contains valid initial state', () => {
    initProject('test-project');

    const raw = fs.readFileSync(path.join(tmpDir, '.vibe-focus', 'state.json'), 'utf-8');
    const state = JSON.parse(raw) as VibeFocusState;

    expect(state.projectName).toBe('test-project');
    expect(state.version).toBe(1);
    expect(state.tasks).toEqual([]);
  });

  it('throws when already initialized', () => {
    initProject('test-project');

    expect(() => initProject('test-project')).toThrow('Already initialized');
  });

  it('returns the created directory path and import count', () => {
    const { dir, importedCount } = initProject('test-project');

    expect(fs.realpathSync(dir)).toBe(fs.realpathSync(path.join(tmpDir, '.vibe-focus')));
    expect(importedCount).toBe(0);
  });
});

describe('readState / writeState', () => {
  beforeEach(() => {
    initProject('test-project');
  });

  it('reads the state written by initProject', () => {
    const state = readState();

    expect(state.projectName).toBe('test-project');
    expect(state.tasks).toEqual([]);
  });

  it('writes and reads state back correctly', () => {
    const state = readState();
    state.activeTaskId = 't1';
    state.tasks.push({
      id: 't1',
      title: 'My Task',
      description: 'desc',
      status: 'active',
      acceptanceCriteria: [],
      dependencies: [],
      tags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: null,
      abandonedAt: null,
      abandonReason: null,
      switchCount: 0,
      worker: null,
    });

    writeState(state);
    const reloaded = readState();

    expect(reloaded.activeTaskId).toBe('t1');
    expect(reloaded.tasks).toHaveLength(1);
    expect(reloaded.tasks[0].title).toBe('My Task');
  });

  it('adds backwards-compat fields for notes when missing', () => {
    // Simulate old state without notes/contexts
    const statePath = path.join(tmpDir, '.vibe-focus', 'state.json');
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    delete raw.notes;
    delete raw.nextNoteNumber;
    delete raw.sessionContexts;
    delete raw.nextContextNumber;
    fs.writeFileSync(statePath, JSON.stringify(raw));

    const state = readState();

    expect(state.notes).toEqual([]);
    expect(state.nextNoteNumber).toBe(1);
    expect(state.sessionContexts).toEqual([]);
    expect(state.nextContextNumber).toBe(1);
  });

  it('write uses atomic rename (tmp file)', () => {
    const state = readState();
    state.projectName = 'updated';

    writeState(state);

    // tmp file should not remain
    const tmpPath = path.join(tmpDir, '.vibe-focus', 'state.json.tmp');
    expect(fs.existsSync(tmpPath)).toBe(false);

    // State should be updated
    const reloaded = readState();
    expect(reloaded.projectName).toBe('updated');
  });
});

describe('findProjectRoot (via readState)', () => {
  it('finds state from a subdirectory', () => {
    initProject('test-project');

    const subDir = path.join(tmpDir, 'src', 'deep');
    fs.mkdirSync(subDir, { recursive: true });
    process.chdir(subDir);

    const state = readState();
    expect(state.projectName).toBe('test-project');
  });

  it('throws when no .vibe-focus found', () => {
    // tmpDir has no .vibe-focus
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-empty-'));
    process.chdir(emptyDir);

    expect(() => readState()).toThrow('Not a vibe-focus project');

    fs.rmSync(emptyDir, { recursive: true, force: true });
  });
});
