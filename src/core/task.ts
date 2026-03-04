import type { Task, AcceptanceCriterion, VibeFocusState } from '../types/index.js';
import { generateTaskId, generateCriterionId } from '../utils/id.js';
import { now } from '../utils/time.js';

export function createTask(
  state: VibeFocusState,
  title: string,
  options: {
    description?: string;
    criteria?: string[];
    dependencies?: string[];
    tags?: string[];
  } = {}
): { task: Task; state: VibeFocusState } {
  const id = generateTaskId(state.nextTaskNumber);

  const acceptanceCriteria: AcceptanceCriterion[] = (options.criteria ?? []).map(
    (text, i) => ({
      id: generateCriterionId(id, i),
      text,
      met: false,
    })
  );

  const task: Task = {
    id,
    title,
    description: options.description ?? '',
    status: 'backlog',
    acceptanceCriteria,
    dependencies: options.dependencies ?? [],
    tags: options.tags ?? [],
    createdAt: now(),
    startedAt: null,
    completedAt: null,
    abandonedAt: null,
    abandonReason: null,
    switchCount: 0,
  };

  return {
    task,
    state: {
      ...state,
      nextTaskNumber: state.nextTaskNumber + 1,
      tasks: [...state.tasks, task],
    },
  };
}

export function getActiveTask(state: VibeFocusState): Task | null {
  if (!state.activeTaskId) return null;
  return state.tasks.find((t) => t.id === state.activeTaskId) ?? null;
}

export function getTask(state: VibeFocusState, id: string): Task | null {
  return state.tasks.find((t) => t.id === id) ?? null;
}

export function updateTask(
  state: VibeFocusState,
  id: string,
  updates: Partial<Task>
): VibeFocusState {
  return {
    ...state,
    tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
  };
}

export function criteriaProgress(task: Task): { met: number; total: number } {
  const total = task.acceptanceCriteria.length;
  const met = task.acceptanceCriteria.filter((c) => c.met).length;
  return { met, total };
}

export function unmetDependencies(state: VibeFocusState, task: Task): string[] {
  return task.dependencies.filter((depId) => {
    const dep = state.tasks.find((t) => t.id === depId);
    return !dep || dep.status !== 'done';
  });
}
