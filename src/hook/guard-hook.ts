// vibe-focus guard hook — bundled by tsup as standalone .mjs
// Shebang added by tsup banner config
// Runs on every Claude Code prompt via UserPromptSubmit hook

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { VibeFocusState } from '../types/index.js';
import {
  buildGuardContext,
  buildNoTaskMessage,
  buildTeamBlock,
  type GuardInput,
  type TaskContext,
  type WorkerContext,
  type SessionMemoryContext,
  type TeamContext,
  type TeamMemberContext,
} from './context-builder.js';

function findStateFile(dir: string): string | null {
  while (dir !== dirname(dir)) {
    const stateFile = join(dir, '.vibe-focus', 'state.json');
    if (existsSync(stateFile)) return stateFile;
    dir = dirname(dir);
  }
  return null;
}

function resolveActiveTaskId(state: VibeFocusState, vfWorker: string | null): string | null {
  let activeTaskId = state.activeTaskId;
  if (vfWorker && state.activeWorkers?.[vfWorker]) {
    activeTaskId = state.activeWorkers[vfWorker];
  }
  return activeTaskId;
}

function extractWorkerContext(state: VibeFocusState, vfWorker: string | null): WorkerContext {
  const workers: Record<string, string> = state.activeWorkers || {};
  const otherWorkers = Object.entries(workers)
    .filter(([name]) => name !== vfWorker)
    .map(([name, taskId]) => {
      const task = state.tasks.find((t) => t.id === taskId);
      return `${name}: ${task ? task.title : taskId}`;
    });
  return { currentWorker: vfWorker, otherWorkers };
}

function extractSessionContext(state: VibeFocusState): SessionMemoryContext | null {
  const contexts = state.sessionContexts || [];
  if (contexts.length === 0) return null;
  const latest = contexts[contexts.length - 1];
  return {
    summary: latest.summary,
    savedAt: latest.savedAt,
    decisions: latest.decisions,
    openQuestions: latest.openQuestions,
    projectState: latest.projectState,
    techStack: latest.techStack,
  };
}

function readTeamContext(stateDir: string, myUsername: string): TeamContext | null {
  const teamWorkersDir = join(stateDir, 'team', 'workers');
  const localConfigPath = join(stateDir, 'team', 'local.json');

  if (!existsSync(teamWorkersDir) || !existsSync(localConfigPath)) return null;

  let username = myUsername;
  if (!username) {
    try {
      const localConfig = JSON.parse(readFileSync(localConfigPath, 'utf-8'));
      username = localConfig.username || '';
    } catch {
      return null;
    }
  }

  const myActiveFiles: string[] = [];
  const myPresencePath = join(teamWorkersDir, `${username}.json`);
  if (existsSync(myPresencePath)) {
    try {
      const myP = JSON.parse(readFileSync(myPresencePath, 'utf-8'));
      if (myP.activeFiles) myActiveFiles.push(...myP.activeFiles);
    } catch { /* skip */ }
  }

  const coworkers: TeamMemberContext[] = [];
  const workerFiles = readdirSync(teamWorkersDir).filter(f => f.endsWith('.json'));

  for (const wf of workerFiles) {
    try {
      const p = JSON.parse(readFileSync(join(teamWorkersDir, wf), 'utf-8'));
      if (p.username === username) continue;

      const ageMs = Date.now() - new Date(p.lastHeartbeat).getTime();
      const ageMins = Math.floor(ageMs / 60000);
      if (ageMins > 60) continue; // skip offline

      const status = ageMins < 5 ? 'active' : ageMins < 15 ? 'idle' : 'away' as const;
      const taskInfo = p.taskTitle ? `${p.taskId} - ${p.taskTitle}` : 'idle';
      const progressInfo = p.progress?.total > 0 ? ` (${p.progress.met}/${p.progress.total})` : '';

      coworkers.push({
        username: p.username,
        status,
        taskInfo,
        progressInfo,
        activeFiles: p.activeFiles || [],
      });
    } catch { /* skip corrupt files */ }
  }

  if (coworkers.length === 0 && myActiveFiles.length === 0) return null;
  return { coworkers, myActiveFiles };
}

// --- Main execution ---
try {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const stateFile = findStateFile(projectDir);
  if (!stateFile) process.exit(0);

  const state = JSON.parse(readFileSync(stateFile, 'utf-8')) as VibeFocusState;
  const vfWorker = process.env.VF_WORKER || null;
  const stateDir = dirname(stateFile);

  const activeTaskId = resolveActiveTaskId(state, vfWorker);

  if (!activeTaskId) {
    console.log(JSON.stringify(buildNoTaskMessage(vfWorker)));
    process.exit(0);
  }

  const rawTask = state.tasks.find((t) => t.id === activeTaskId);
  if (!rawTask) process.exit(0);

  const task: TaskContext = {
    id: rawTask.id,
    title: rawTask.title,
    metCount: rawTask.acceptanceCriteria.filter((c) => c.met).length,
    totalCount: rawTask.acceptanceCriteria.length,
    unmetCriteria: rawTask.acceptanceCriteria
      .filter((c) => !c.met)
      .map((c) => c.text),
  };

  const worker = extractWorkerContext(state, vfWorker);
  const noteCount = (state.notes || []).filter((n) => !n.promoted).length;
  const session = extractSessionContext(state);

  // Read team username from local config
  let teamUsername = '';
  const localConfigPath = join(stateDir, 'team', 'local.json');
  if (existsSync(localConfigPath)) {
    try {
      teamUsername = JSON.parse(readFileSync(localConfigPath, 'utf-8')).username || '';
    } catch { /* skip */ }
  }
  const team = readTeamContext(stateDir, teamUsername);

  const scope = state.projectScope?.outOfScope?.length > 0
    ? { outOfScope: state.projectScope.outOfScope }
    : null;

  const input: GuardInput = { task, worker, scope, noteCount, session, team };
  console.log(JSON.stringify(buildGuardContext(input)));
} catch {
  // Silent fail — never block Claude Code
  process.exit(0);
}
