import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getStateDir } from './state.js';
import type { Task, VibeFocusState } from '../types/index.js';

const LOG_FILE = 'work-log.md';
const HEADER = '# Work Log\n\nShared task context — committed to git, synced across collaborators.\n\n';

function getLogPath(): string {
  return path.join(getStateDir(), LOG_FILE);
}

function ensureLog(): void {
  const logPath = getLogPath();
  if (!fs.existsSync(logPath)) {
    fs.writeFileSync(logPath, HEADER);
  }
}

function getAuthor(worker: string): string {
  if (worker && worker !== '__default__') return worker;
  return os.userInfo().username || 'unknown';
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

export function logTaskStarted(taskId: string, title: string, worker: string): void {
  try {
    ensureLog();
    const author = getAuthor(worker);
    const line = `- ${today()} **started** ${taskId} "${title}" (${author})\n`;
    fs.appendFileSync(getLogPath(), line);
  } catch {
    // Non-critical — don't break the CLI if log write fails
  }
}

export function logTaskCompleted(taskId: string, title: string, worker: string, duration: string): void {
  try {
    ensureLog();
    const author = getAuthor(worker);
    const line = `- ${today()} **completed** ${taskId} "${title}" (${author}, ${duration})\n`;
    fs.appendFileSync(getLogPath(), line);
  } catch {
    // Non-critical
  }
}

export function logTaskAbandoned(taskId: string, title: string, worker: string, reason?: string): void {
  try {
    ensureLog();
    const author = getAuthor(worker);
    const extra = reason ? ` — ${reason}` : '';
    const line = `- ${today()} **abandoned** ${taskId} "${title}" (${author})${extra}\n`;
    fs.appendFileSync(getLogPath(), line);
  } catch {
    // Non-critical
  }
}

export function logContext(summary: string, taskId: string | null, worker: string): void {
  try {
    ensureLog();
    const author = getAuthor(worker);
    const taskRef = taskId ? ` [${taskId}]` : '';
    const line = `- ${today()} **context**${taskRef}: ${summary} (${author})\n`;
    fs.appendFileSync(getLogPath(), line);
  } catch {
    // Non-critical
  }
}

const TASKS_FILE = 'tasks.json';

/** Write tasks array to tasks.json (git-tracked), stripping the worker field. */
export function exportTasks(state: VibeFocusState): void {
  try {
    const stateDir = getStateDir();
    const tasksPath = path.join(stateDir, TASKS_FILE);
    const tmpPath = tasksPath + '.tmp';
    const exported = state.tasks.map(({ worker, ...rest }) => rest);
    const data = {
      projectName: state.projectName,
      nextTaskNumber: state.nextTaskNumber,
      tasks: exported,
    };
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n');
    fs.renameSync(tmpPath, tasksPath);
  } catch {
    // Non-critical — don't break the CLI if export fails
  }
}

/** Read tasks.json and return tasks + nextTaskNumber for seeding a fresh state. */
export function importTasks(stateDir: string): { tasks: Task[]; nextTaskNumber: number } | null {
  try {
    const tasksPath = path.join(stateDir, TASKS_FILE);
    if (!fs.existsSync(tasksPath)) return null;
    const raw = JSON.parse(fs.readFileSync(tasksPath, 'utf-8'));
    if (!Array.isArray(raw.tasks) || raw.tasks.length === 0) return null;
    const tasks: Task[] = raw.tasks.map((t: any) => ({ ...t, worker: null }));
    const nextTaskNumber = typeof raw.nextTaskNumber === 'number' ? raw.nextTaskNumber : tasks.length + 1;
    return { tasks, nextTaskNumber };
  } catch {
    return null;
  }
}
