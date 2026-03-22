import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { evaluateSwitch, evaluateAdd, evaluateScopeAlignment } from '../core/guardian.js';
import type { Task, VibeFocusState } from '../types/index.js';

function makeState(overrides: Partial<VibeFocusState> = {}): VibeFocusState {
  return {
    version: 1,
    projectName: 'test',
    projectScope: null,
    activeTaskId: null,
    activeWorkers: {},
    nextTaskNumber: 1,
    tasks: [],
    notes: [],
    nextNoteNumber: 1,
    currentSession: null,
    focusEvents: [],
    sessionContexts: [],
    nextContextNumber: 1,
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Test Task',
    description: '',
    status: 'active',
    acceptanceCriteria: [],
    dependencies: [],
    tags: [],
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    completedAt: null,
    abandonedAt: null,
    abandonReason: null,
    switchCount: 0,
    worker: null,
    ...overrides,
  };
}

describe('evaluateSwitch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-21T14:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('blocks switch when task is 66%+ done', () => {
    const task = makeTask({
      acceptanceCriteria: [
        { id: 'c1', text: 'A', met: true },
        { id: 'c2', text: 'B', met: true },
        { id: 'c3', text: 'C', met: false },
      ],
      startedAt: new Date().toISOString(),
    });
    const state = makeState();

    const result = evaluateSwitch(state, task, 't2');

    expect(result.allowed).toBe(false);
    expect(result.severity).toBe('block');
    expect(result.message).toContain('67%');
    expect(result.message).toContain('1 Kriterium');
    expect(result.overrideFlag).toBe('--force');
  });

  it('blocks switch when task is 100% done (still need vf done)', () => {
    const task = makeTask({
      acceptanceCriteria: [
        { id: 'c1', text: 'A', met: true },
        { id: 'c2', text: 'B', met: true },
      ],
    });
    const state = makeState();

    const result = evaluateSwitch(state, task, 't2');

    expect(result.allowed).toBe(false);
    expect(result.severity).toBe('block');
    expect(result.message).toContain('100%');
  });

  it('uses plural "Kriterien" for multiple remaining criteria', () => {
    const task = makeTask({
      acceptanceCriteria: [
        { id: 'c1', text: 'A', met: true },
        { id: 'c2', text: 'B', met: true },
        { id: 'c3', text: 'C', met: true },
        { id: 'c4', text: 'D', met: true },
        { id: 'c5', text: 'E', met: false },
        { id: 'c6', text: 'F', met: false },
      ],
      startedAt: new Date().toISOString(),
    });
    const state = makeState();

    const result = evaluateSwitch(state, task, 't2');

    expect(result.message).toContain('Kriterien');
    expect(result.message).toContain('2');
  });

  it('blocks after 3+ switches today', () => {
    const today = new Date('2026-03-21T10:00:00.000Z');
    const state = makeState({
      focusEvents: [
        { type: 'switch_away', taskId: 't1', timestamp: today.toISOString() },
        { type: 'switch_away', taskId: 't2', timestamp: today.toISOString() },
        { type: 'switch_away', taskId: 't3', timestamp: today.toISOString() },
      ],
    });
    const task = makeTask({ acceptanceCriteria: [] });

    const result = evaluateSwitch(state, task, 't4');

    expect(result.allowed).toBe(false);
    expect(result.severity).toBe('block');
    expect(result.message).toContain('3x');
    expect(result.message).toContain('Context-Collapse');
    expect(result.overrideFlag).toBe('--yolo');
  });

  it('does not count yesterday switches as today', () => {
    const yesterday = new Date('2026-03-20T10:00:00.000Z');
    const state = makeState({
      focusEvents: [
        { type: 'switch_away', taskId: 't1', timestamp: yesterday.toISOString() },
        { type: 'switch_away', taskId: 't2', timestamp: yesterday.toISOString() },
        { type: 'switch_away', taskId: 't3', timestamp: yesterday.toISOString() },
      ],
    });
    const task = makeTask({ acceptanceCriteria: [] });

    const result = evaluateSwitch(state, task, 't4');

    // Should NOT block because those switches were yesterday
    expect(result.severity).not.toBe('block');
  });

  it('warns when 15+ minutes invested', () => {
    const fifteenMinAgo = new Date(Date.now() - 16 * 60 * 1000).toISOString();
    const task = makeTask({
      startedAt: fifteenMinAgo,
      acceptanceCriteria: [],
    });
    const state = makeState();

    const result = evaluateSwitch(state, task, 't2');

    expect(result.allowed).toBe(false);
    expect(result.severity).toBe('warn');
    expect(result.message).toContain('Minuten');
    expect(result.overrideFlag).toBe('--force');
  });

  it('gives gentle pushback by default (no criteria, fresh task, few switches)', () => {
    const task = makeTask({
      startedAt: new Date().toISOString(),
      acceptanceCriteria: [],
    });
    const state = makeState();

    const result = evaluateSwitch(state, task, 't2');

    expect(result.allowed).toBe(false);
    expect(result.severity).toBe('warn');
    expect(result.message).toContain('aktiven Task');
    expect(result.overrideFlag).toBe('--force');
  });

  it('does not block when task has no criteria and <66% threshold is irrelevant', () => {
    const task = makeTask({ acceptanceCriteria: [] });
    const state = makeState();

    const result = evaluateSwitch(state, task, 't2');

    // No criteria → completionPercent = 0, so 66% rule doesn't trigger
    expect(result.severity).not.toBe('block');
  });

  it('prioritizes 66% rule over switch-count rule', () => {
    const today = new Date('2026-03-21T10:00:00.000Z');
    const state = makeState({
      focusEvents: [
        { type: 'switch_away', taskId: 't1', timestamp: today.toISOString() },
        { type: 'switch_away', taskId: 't2', timestamp: today.toISOString() },
        { type: 'switch_away', taskId: 't3', timestamp: today.toISOString() },
      ],
    });
    const task = makeTask({
      acceptanceCriteria: [
        { id: 'c1', text: 'A', met: true },
        { id: 'c2', text: 'B', met: true },
        { id: 'c3', text: 'C', met: false },
      ],
      startedAt: new Date().toISOString(),
    });

    const result = evaluateSwitch(state, task, 't4');

    // 66% rule is checked first → message about completion percentage
    expect(result.message).toContain('67%');
  });
});

describe('evaluateAdd', () => {
  it('always allows adding tasks', () => {
    const task = makeTask({ title: 'Current Focus' });

    const result = evaluateAdd(task);

    expect(result.allowed).toBe(true);
    expect(result.severity).toBe('info');
    expect(result.message).toContain('Current Focus');
  });
});

describe('evaluateScopeAlignment', () => {
  it('returns null when no scope is defined', () => {
    const state = makeState({ projectScope: null });

    const result = evaluateScopeAlignment(state, 'New feature');

    expect(result).toBeNull();
  });

  it('blocks tasks matching outOfScope keywords', () => {
    const state = makeState({
      projectScope: {
        purpose: 'CLI tool',
        boundaries: [],
        inScope: ['CLI Commands'],
        outOfScope: ['Web UI', 'Mobile App', 'Cloud Sync'],
      },
    });

    const result = evaluateScopeAlignment(state, 'Build Web UI dashboard');

    expect(result).not.toBeNull();
    expect(result!.allowed).toBe(false);
    expect(result!.severity).toBe('block');
    expect(result!.message).toContain('ausserhalb');
    expect(result!.overrideFlag).toBe('--force');
  });

  it('is case-insensitive for scope matching', () => {
    const state = makeState({
      projectScope: {
        purpose: 'CLI tool',
        boundaries: [],
        inScope: [],
        outOfScope: ['Cloud Sync'],
      },
    });

    const result = evaluateScopeAlignment(state, 'Add cloud sync feature');

    expect(result).not.toBeNull();
    expect(result!.allowed).toBe(false);
  });

  it('returns null when task does not match outOfScope', () => {
    const state = makeState({
      projectScope: {
        purpose: 'CLI tool',
        boundaries: [],
        inScope: ['CLI Commands'],
        outOfScope: ['Web UI'],
      },
    });

    const result = evaluateScopeAlignment(state, 'Add new CLI command');

    expect(result).toBeNull();
  });

  it('includes project purpose in suggestion', () => {
    const state = makeState({
      projectScope: {
        purpose: 'Focus Guardian CLI',
        boundaries: [],
        inScope: [],
        outOfScope: ['Database'],
      },
    });

    const result = evaluateScopeAlignment(state, 'Add database layer');

    expect(result).not.toBeNull();
    expect(result!.suggestion).toContain('Focus Guardian CLI');
  });
});
