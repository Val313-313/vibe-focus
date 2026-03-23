// vibe-focus guard hook — bundled by tsup as standalone .mjs
// Shebang added by tsup banner config
// Runs on every AI agent prompt (Claude Code: UserPromptSubmit hook)

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
  type TeamMessageContext,
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

interface CloudConfigMinimal {
  supabaseUrl: string;
  supabaseAnonKey: string;
  accessToken: string;
  projectId: string;
}

function readCloudConfigForHook(stateDir: string): CloudConfigMinimal | null {
  const cloudPath = join(stateDir, 'cloud.json');
  if (!existsSync(cloudPath)) return null;
  try {
    const cfg = JSON.parse(readFileSync(cloudPath, 'utf-8'));
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !cfg.accessToken || !cfg.projectId) return null;
    return {
      supabaseUrl: cfg.supabaseUrl,
      supabaseAnonKey: cfg.supabaseAnonKey,
      accessToken: cfg.accessToken,
      projectId: cfg.projectId,
    };
  } catch {
    return null;
  }
}

function formatMessageAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

async function fetchRecentMessages(cloudCfg: CloudConfigMinimal): Promise<TeamMessageContext[]> {
  const params = [
    `project_id=eq.${cloudCfg.projectId}`,
    'select=body,created_at,profiles:profiles(username)',
    'order=created_at.desc',
    'limit=5',
  ].join('&');

  const url = `${cloudCfg.supabaseUrl}/rest/v1/messages?${params}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'apikey': cloudCfg.supabaseAnonKey,
      'Authorization': `Bearer ${cloudCfg.accessToken}`,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(3000),
  });

  if (!response.ok) return [];

  const data = await response.json() as Array<{
    body: string;
    created_at: string;
    profiles?: { username: string };
  }>;

  if (!Array.isArray(data)) return [];

  return data.reverse().map((m) => ({
    username: m.profiles?.username || '?',
    body: m.body,
    time: formatMessageAge(m.created_at),
  }));
}

// --- Main execution ---
(async () => {
  try {
    const projectDir = process.env.VF_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();
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

    // Fetch recent team messages from cloud (non-blocking timeout)
    let messages: TeamMessageContext[] = [];
    const cloudCfg = readCloudConfigForHook(stateDir);
    if (cloudCfg) {
      try {
        messages = await fetchRecentMessages(cloudCfg);
      } catch { /* silent — never block the hook */ }
    }

    const input: GuardInput = { task, worker, scope, noteCount, session, team, messages };
    console.log(JSON.stringify(buildGuardContext(input)));
  } catch {
    // Silent fail — never block the AI agent
    process.exit(0);
  }
})();
