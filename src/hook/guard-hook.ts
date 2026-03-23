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

      // Validate required fields to prevent injection from corrupt/malicious files
      if (typeof p.username !== 'string' || typeof p.lastHeartbeat !== 'string') continue;
      if (p.username === username) continue;

      const ageMs = Date.now() - new Date(p.lastHeartbeat).getTime();
      if (isNaN(ageMs)) continue; // invalid date
      const ageMins = Math.floor(ageMs / 60000);
      if (ageMins > 60) continue; // skip offline

      const status = ageMins < 5 ? 'active' : ageMins < 15 ? 'idle' : 'away' as const;
      const taskInfo = typeof p.taskTitle === 'string' ? `${p.taskId} - ${p.taskTitle}` : 'idle';
      const progressInfo = typeof p.progress?.total === 'number' && p.progress.total > 0
        ? ` (${p.progress.met}/${p.progress.total})` : '';

      coworkers.push({
        username: String(p.username).slice(0, 50),
        status,
        taskInfo: String(taskInfo).slice(0, 200),
        progressInfo,
        activeFiles: Array.isArray(p.activeFiles)
          ? p.activeFiles.filter((f: unknown) => typeof f === 'string').slice(0, 50)
          : [],
      });
    } catch { /* skip corrupt files */ }
  }

  if (coworkers.length === 0 && myActiveFiles.length === 0) return null;
  return { coworkers, myActiveFiles };
}

interface CloudCacheMinimal {
  version: 1;
  updatedAt: string;
  team: Array<{
    user_id: string;
    task_id: string | null;
    task_title: string | null;
    progress_met: number;
    progress_total: number;
    active_files: string[];
    focus_score: number;
    status: 'active' | 'idle';
    last_heartbeat: string;
    profiles?: { username: string; display_name: string | null };
  }>;
  messages: Array<{
    body: string;
    created_at: string;
    profile?: { username: string };
  }>;
}

function readCloudCacheForHook(stateDir: string): CloudCacheMinimal | null {
  const cachePath = join(stateDir, 'cloud-cache.json');
  if (!existsSync(cachePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(cachePath, 'utf-8'));
    if (raw?.version !== 1 || typeof raw.updatedAt !== 'string') return null;

    // Reject stale cache (>10 min)
    const ageMs = Date.now() - new Date(raw.updatedAt).getTime();
    if (isNaN(ageMs) || ageMs > 10 * 60 * 1000) return null;

    // Validate structure
    if (!Array.isArray(raw.team) || !Array.isArray(raw.messages)) return null;

    return raw as CloudCacheMinimal;
  } catch {
    return null;
  }
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
    // Validate all required fields are strings
    if (
      typeof cfg.supabaseUrl !== 'string' ||
      typeof cfg.supabaseAnonKey !== 'string' ||
      typeof cfg.accessToken !== 'string' ||
      typeof cfg.projectId !== 'string'
    ) return null;

    // Validate URL format (HTTPS only)
    if (!cfg.supabaseUrl.startsWith('https://')) return null;

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
    let team = readTeamContext(stateDir, teamUsername);

    const scope = state.projectScope?.outOfScope?.length > 0
      ? { outOfScope: state.projectScope.outOfScope }
      : null;

    // Read cloud cache (populated by heartbeat responses) for cloud teammates
    const cloudCache = readCloudCacheForHook(stateDir);

    // Merge cloud presence into team context (cloud teammates not in local team)
    if (cloudCache && cloudCache.team.length > 0) {
      const localUsernames = new Set(team?.coworkers.map(c => c.username) ?? []);

      const cloudCoworkers: TeamMemberContext[] = [];
      for (const ct of cloudCache.team) {
        const username = ct.profiles?.username ?? ct.user_id.slice(0, 8);
        if (localUsernames.has(username)) continue;

        const ageMs = Date.now() - new Date(ct.last_heartbeat).getTime();
        const ageMins = Math.floor(ageMs / 60000);
        if (ageMins > 60) continue;

        const status = ageMins < 5 ? 'active' : ageMins < 15 ? 'idle' : 'away' as const;
        const taskInfo = ct.task_title ? `${ct.task_id} - ${ct.task_title}` : 'idle';
        const progressInfo = ct.progress_total > 0 ? ` (${ct.progress_met}/${ct.progress_total})` : '';

        cloudCoworkers.push({
          username,
          status,
          taskInfo,
          progressInfo,
          activeFiles: ct.active_files || [],
        });
      }

      if (cloudCoworkers.length > 0) {
        if (!team) {
          team = { coworkers: cloudCoworkers, myActiveFiles: [] };
        } else {
          team = { ...team, coworkers: [...team.coworkers, ...cloudCoworkers] };
        }
      }
    }

    // Get messages from cloud cache first, fall back to live fetch
    let messages: TeamMessageContext[] = [];

    if (cloudCache && cloudCache.messages.length > 0) {
      messages = cloudCache.messages.map(m => ({
        username: m.profile?.username || '?',
        body: m.body,
        time: formatMessageAge(m.created_at),
      })).reverse(); // oldest first
    } else {
      // Fallback: fetch directly from Supabase (original behavior)
      const cloudCfg = readCloudConfigForHook(stateDir);
      if (cloudCfg) {
        try {
          messages = await fetchRecentMessages(cloudCfg);
        } catch { /* silent — never block the hook */ }
      }
    }

    const input: GuardInput = { task, worker, scope, noteCount, session, team, messages };
    console.log(JSON.stringify(buildGuardContext(input)));
  } catch {
    // Silent fail — never block the AI agent
    process.exit(0);
  }
})();
