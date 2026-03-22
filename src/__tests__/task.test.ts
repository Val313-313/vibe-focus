import { describe, it, expect } from 'vitest';
import { createTask, getActiveTask, getTask, updateTask, criteriaProgress, unmetDependencies } from '../core/task.js';
import { generateTaskId, generateCriterionId } from '../utils/id.js';
import { elapsedMinutes, formatDuration } from '../utils/time.js';
import type { VibeFocusState, Task } from '../types/index.js';

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

// ─── ID generation ───

describe('generateTaskId', () => {
  it('generates t1, t2, etc.', () => {
    expect(generateTaskId(1)).toBe('t1');
    expect(generateTaskId(42)).toBe('t42');
  });
});

describe('generateCriterionId', () => {
  it('generates taskId-c1, taskId-c2, etc.', () => {
    expect(generateCriterionId('t1', 0)).toBe('t1-c1');
    expect(generateCriterionId('t3', 2)).toBe('t3-c3');
  });
});

// ─── Time utilities ───

describe('elapsedMinutes', () => {
  it('calculates minutes since a timestamp', () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const result = elapsedMinutes(tenMinAgo);
    expect(result).toBe(10);
  });

  it('returns 0 for now', () => {
    const result = elapsedMinutes(new Date().toISOString());
    expect(result).toBe(0);
  });
});

describe('formatDuration', () => {
  it('formats minutes under 60', () => {
    expect(formatDuration(5)).toBe('5m');
    expect(formatDuration(45)).toBe('45m');
  });

  it('formats exact hours', () => {
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(120)).toBe('2h');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(90)).toBe('1h 30m');
    expect(formatDuration(145)).toBe('2h 25m');
  });

  it('formats 0 minutes', () => {
    expect(formatDuration(0)).toBe('0m');
  });
});

// ─── Task creation ───

describe('createTask', () => {
  it('creates task with correct defaults', () => {
    const state = makeState({ nextTaskNumber: 1 });
    const { task, state: newState } = createTask(state, 'My Task');

    expect(task.id).toBe('t1');
    expect(task.title).toBe('My Task');
    expect(task.status).toBe('backlog');
    expect(task.description).toBe('');
    expect(task.acceptanceCriteria).toEqual([]);
    expect(task.dependencies).toEqual([]);
    expect(task.tags).toEqual([]);
    expect(task.switchCount).toBe(0);
    expect(task.startedAt).toBeNull();
    expect(task.completedAt).toBeNull();
    expect(task.abandonedAt).toBeNull();
  });

  it('increments nextTaskNumber', () => {
    const state = makeState({ nextTaskNumber: 3 });
    const { state: newState } = createTask(state, 'Test');

    expect(newState.nextTaskNumber).toBe(4);
  });

  it('adds task to state.tasks', () => {
    const state = makeState();
    const { task, state: newState } = createTask(state, 'Test');

    expect(newState.tasks).toHaveLength(1);
    expect(newState.tasks[0].id).toBe(task.id);
  });

  it('creates acceptance criteria from options', () => {
    const state = makeState();
    const { task } = createTask(state, 'Test', {
      criteria: ['First criterion', 'Second criterion'],
    });

    expect(task.acceptanceCriteria).toHaveLength(2);
    expect(task.acceptanceCriteria[0].id).toBe('t1-c1');
    expect(task.acceptanceCriteria[0].text).toBe('First criterion');
    expect(task.acceptanceCriteria[0].met).toBe(false);
    expect(task.acceptanceCriteria[1].id).toBe('t1-c2');
  });

  it('preserves description and tags', () => {
    const state = makeState();
    const { task } = createTask(state, 'Test', {
      description: 'Details here',
      tags: ['urgent', 'refactor'],
    });

    expect(task.description).toBe('Details here');
    expect(task.tags).toEqual(['urgent', 'refactor']);
  });

  it('preserves dependencies', () => {
    const state = makeState();
    const { task } = createTask(state, 'Test', {
      dependencies: ['t1', 't2'],
    });

    expect(task.dependencies).toEqual(['t1', 't2']);
  });

  it('does not mutate original state', () => {
    const state = makeState();
    const originalTasks = state.tasks;
    createTask(state, 'Test');

    expect(state.tasks).toBe(originalTasks);
    expect(state.tasks).toHaveLength(0);
  });
});

// ─── Task lookups ───

describe('getActiveTask', () => {
  it('returns null when no active task', () => {
    const state = makeState({ activeTaskId: null });
    expect(getActiveTask(state)).toBeNull();
  });

  it('returns the active task', () => {
    const task: Task = {
      id: 't1', title: 'Active', description: '', status: 'active',
      acceptanceCriteria: [], dependencies: [], tags: [],
      createdAt: '', startedAt: '', completedAt: null,
      abandonedAt: null, abandonReason: null, switchCount: 0, worker: null,
    };
    const state = makeState({ activeTaskId: 't1', tasks: [task] });

    expect(getActiveTask(state)).toEqual(task);
  });

  it('returns null when activeTaskId points to non-existent task', () => {
    const state = makeState({ activeTaskId: 't99', tasks: [] });
    expect(getActiveTask(state)).toBeNull();
  });
});

describe('getTask', () => {
  it('finds task by id', () => {
    const task: Task = {
      id: 't2', title: 'Second', description: '', status: 'backlog',
      acceptanceCriteria: [], dependencies: [], tags: [],
      createdAt: '', startedAt: null, completedAt: null,
      abandonedAt: null, abandonReason: null, switchCount: 0, worker: null,
    };
    const state = makeState({ tasks: [task] });

    expect(getTask(state, 't2')).toEqual(task);
  });

  it('returns null for unknown id', () => {
    const state = makeState();
    expect(getTask(state, 't99')).toBeNull();
  });
});

// ─── Task updates ───

describe('updateTask', () => {
  it('updates specific task fields', () => {
    const task: Task = {
      id: 't1', title: 'Original', description: '', status: 'backlog',
      acceptanceCriteria: [], dependencies: [], tags: [],
      createdAt: '', startedAt: null, completedAt: null,
      abandonedAt: null, abandonReason: null, switchCount: 0, worker: null,
    };
    const state = makeState({ tasks: [task] });

    const newState = updateTask(state, 't1', { status: 'active', title: 'Updated' });

    expect(newState.tasks[0].status).toBe('active');
    expect(newState.tasks[0].title).toBe('Updated');
  });

  it('does not modify other tasks', () => {
    const task1: Task = {
      id: 't1', title: 'First', description: '', status: 'backlog',
      acceptanceCriteria: [], dependencies: [], tags: [],
      createdAt: '', startedAt: null, completedAt: null,
      abandonedAt: null, abandonReason: null, switchCount: 0, worker: null,
    };
    const task2: Task = {
      id: 't2', title: 'Second', description: '', status: 'backlog',
      acceptanceCriteria: [], dependencies: [], tags: [],
      createdAt: '', startedAt: null, completedAt: null,
      abandonedAt: null, abandonReason: null, switchCount: 0, worker: null,
    };
    const state = makeState({ tasks: [task1, task2] });

    const newState = updateTask(state, 't1', { status: 'active' });

    expect(newState.tasks[1].status).toBe('backlog');
    expect(newState.tasks[1].title).toBe('Second');
  });

  it('does not mutate original state', () => {
    const task: Task = {
      id: 't1', title: 'First', description: '', status: 'backlog',
      acceptanceCriteria: [], dependencies: [], tags: [],
      createdAt: '', startedAt: null, completedAt: null,
      abandonedAt: null, abandonReason: null, switchCount: 0, worker: null,
    };
    const state = makeState({ tasks: [task] });

    updateTask(state, 't1', { status: 'active' });

    expect(state.tasks[0].status).toBe('backlog');
  });
});

// ─── Criteria progress ───

describe('criteriaProgress', () => {
  it('returns 0/0 for task with no criteria', () => {
    const task: Task = {
      id: 't1', title: '', description: '', status: 'active',
      acceptanceCriteria: [], dependencies: [], tags: [],
      createdAt: '', startedAt: null, completedAt: null,
      abandonedAt: null, abandonReason: null, switchCount: 0, worker: null,
    };

    expect(criteriaProgress(task)).toEqual({ met: 0, total: 0 });
  });

  it('counts met and total criteria', () => {
    const task: Task = {
      id: 't1', title: '', description: '', status: 'active',
      acceptanceCriteria: [
        { id: 'c1', text: 'A', met: true },
        { id: 'c2', text: 'B', met: false },
        { id: 'c3', text: 'C', met: true },
      ],
      dependencies: [], tags: [],
      createdAt: '', startedAt: null, completedAt: null,
      abandonedAt: null, abandonReason: null, switchCount: 0, worker: null,
    };

    expect(criteriaProgress(task)).toEqual({ met: 2, total: 3 });
  });
});

// ─── Dependencies ───

describe('unmetDependencies', () => {
  it('returns empty when no dependencies', () => {
    const task: Task = {
      id: 't2', title: '', description: '', status: 'backlog',
      acceptanceCriteria: [], dependencies: [], tags: [],
      createdAt: '', startedAt: null, completedAt: null,
      abandonedAt: null, abandonReason: null, switchCount: 0, worker: null,
    };
    const state = makeState({ tasks: [task] });

    expect(unmetDependencies(state, task)).toEqual([]);
  });

  it('returns unmet dependencies', () => {
    const dep1: Task = {
      id: 't1', title: 'Dep1', description: '', status: 'active',
      acceptanceCriteria: [], dependencies: [], tags: [],
      createdAt: '', startedAt: null, completedAt: null,
      abandonedAt: null, abandonReason: null, switchCount: 0, worker: null,
    };
    const dep2: Task = {
      id: 't2', title: 'Dep2', description: '', status: 'done',
      acceptanceCriteria: [], dependencies: [], tags: [],
      createdAt: '', startedAt: null, completedAt: null,
      abandonedAt: null, abandonReason: null, switchCount: 0, worker: null,
    };
    const task: Task = {
      id: 't3', title: 'Main', description: '', status: 'backlog',
      acceptanceCriteria: [], dependencies: ['t1', 't2'], tags: [],
      createdAt: '', startedAt: null, completedAt: null,
      abandonedAt: null, abandonReason: null, switchCount: 0, worker: null,
    };
    const state = makeState({ tasks: [dep1, dep2, task] });

    expect(unmetDependencies(state, task)).toEqual(['t1']);
  });

  it('includes non-existent dependency IDs as unmet', () => {
    const task: Task = {
      id: 't1', title: '', description: '', status: 'backlog',
      acceptanceCriteria: [], dependencies: ['t99'], tags: [],
      createdAt: '', startedAt: null, completedAt: null,
      abandonedAt: null, abandonReason: null, switchCount: 0, worker: null,
    };
    const state = makeState({ tasks: [task] });

    expect(unmetDependencies(state, task)).toEqual(['t99']);
  });
});
