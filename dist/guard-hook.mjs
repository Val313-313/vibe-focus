#!/usr/bin/env node

// src/hook/guard-hook.ts
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";

// src/hook/context-builder.ts
function buildNoTaskMessage(worker) {
  const workerHint = worker ? ` (worker: ${worker})` : "";
  const workerFlag = worker ? ` --worker ${worker}` : "";
  const result = [
    `VIBE FOCUS: No active task${workerHint}. Before working, create and start a task:`,
    `  vf add "task" -c "criterion"`,
    `  vf start t1${workerFlag}`,
    `This keeps your session focused.`
  ].join("\n");
  return { result, suppressPrompt: false };
}
function formatSessionAge(savedAt) {
  const ageMs = Date.now() - new Date(savedAt).getTime();
  const ageHours = Math.floor(ageMs / 36e5);
  if (ageHours < 1) return "just now";
  if (ageHours < 24) return `${ageHours}h ago`;
  return `${Math.floor(ageHours / 24)}d ago`;
}
function buildSessionBlock(session) {
  const lines = [];
  lines.push(`
PREVIOUS SESSION CONTEXT (saved ${formatSessionAge(session.savedAt)}):`);
  lines.push(session.summary);
  if (session.decisions?.length) {
    lines.push("\nKEY DECISIONS:");
    lines.push(...session.decisions.map((d) => `  - ${d}`));
  }
  if (session.openQuestions?.length) {
    lines.push("\nOPEN QUESTIONS:");
    lines.push(...session.openQuestions.map((q) => `  ? ${q}`));
  }
  if (session.projectState) {
    lines.push(`PROJECT STATE: ${session.projectState}`);
  }
  if (session.techStack?.length) {
    lines.push(`TECH STACK: ${session.techStack.join(", ")}`);
  }
  return lines.join("\n");
}
function buildTeamBlock(team) {
  if (team.coworkers.length === 0) return "";
  const lines = [];
  lines.push("\nTEAM CONTEXT:");
  for (const cw of team.coworkers) {
    lines.push(`  ${cw.username} [${cw.status}] \u2192 ${cw.taskInfo}${cw.progressInfo}`);
  }
  const conflicts = [];
  for (const cw of team.coworkers) {
    const shared = team.myActiveFiles.filter((f) => cw.activeFiles.includes(f));
    if (shared.length > 0) {
      conflicts.push(`  \u26A0 FILE CONFLICT with ${cw.username}: ${shared.join(", ")}`);
    }
  }
  if (conflicts.length > 0) {
    lines.push("\nCONFLICT WARNINGS:");
    lines.push(...conflicts);
    lines.push("  \u2192 Coordinate before modifying shared files!");
  }
  return lines.join("\n");
}
function buildMessagesBlock(messages) {
  if (messages.length === 0) return "";
  const lines = [];
  lines.push("\nTEAM MESSAGES (recent):");
  for (const msg of messages) {
    lines.push(`  ${msg.username}: ${msg.body} (${msg.time})`);
  }
  return lines.join("\n");
}
function buildGuardContext(input) {
  const { task, worker, scope, noteCount, session, team, messages } = input;
  const workerFlag = worker.currentWorker ? ` --worker ${worker.currentWorker}` : "";
  const sections = [];
  sections.push("VIBE FOCUS ACTIVE - STRICT MODE");
  if (worker.currentWorker) {
    sections.push(`WORKER: ${worker.currentWorker}`);
  }
  sections.push("");
  sections.push(`CURRENT TASK: ${task.id} - ${task.title}`);
  sections.push(`PROGRESS: ${task.metCount}/${task.totalCount} criteria met`);
  sections.push("");
  if (task.unmetCriteria.length > 0) {
    sections.push("REMAINING CRITERIA:");
    sections.push(...task.unmetCriteria.map((c) => `  - ${c}`));
  } else {
    sections.push(`ALL CRITERIA MET - run: vf done${workerFlag}`);
  }
  if (noteCount > 0) {
    sections.push(`PARKED NOTES: ${noteCount} ideas saved for later (vf note --list)`);
  }
  if (worker.otherWorkers.length > 0) {
    sections.push("\nOTHER ACTIVE WORKERS:");
    sections.push(...worker.otherWorkers.map((w) => `  - ${w}`));
  }
  if (team) {
    const teamBlock = buildTeamBlock(team);
    if (teamBlock) sections.push(teamBlock);
  }
  if (messages && messages.length > 0) {
    const msgBlock = buildMessagesBlock(messages);
    if (msgBlock) sections.push(msgBlock);
  }
  if (session) {
    sections.push(buildSessionBlock(session));
  }
  sections.push("");
  sections.push("ENFORCEMENT: Before responding, verify the user's request relates to this task.");
  sections.push(`If it does NOT relate to "${task.title}":`);
  sections.push("  1. STOP immediately. Do NOT start working on the unrelated request.");
  sections.push(`  2. Tell the user: "That's not part of the current task. Let me park it."`);
  sections.push('  3. Run: vf note "<their idea summarized>"');
  sections.push(`  4. Then redirect: "Back to ${task.title} - here's what we still need to do:"`);
  sections.push("");
  sections.push(`IMPORTANT: Even if the user's question seems quick or related, if it's a DIFFERENT concern`);
  sections.push(`than "${task.title}", it MUST be parked as a note. No exceptions. No "quickly checking".`);
  sections.push("");
  sections.push("SAFETY: Even in flow/superflow mode, always review before destructive operations.");
  sections.push("Think twice before: deleting files, force-pushing, dropping data, overwriting config.");
  if (scope && scope.outOfScope.length > 0) {
    sections.push(`
OUT OF SCOPE (refuse these): ${scope.outOfScope.join(", ")}`);
  }
  return { result: sections.join("\n"), suppressPrompt: false };
}

// src/hook/guard-hook.ts
function findStateFile(dir) {
  while (dir !== dirname(dir)) {
    const stateFile = join(dir, ".vibe-focus", "state.json");
    if (existsSync(stateFile)) return stateFile;
    dir = dirname(dir);
  }
  return null;
}
function resolveActiveTaskId(state, vfWorker) {
  let activeTaskId = state.activeTaskId;
  if (vfWorker && state.activeWorkers?.[vfWorker]) {
    activeTaskId = state.activeWorkers[vfWorker];
  }
  return activeTaskId;
}
function extractWorkerContext(state, vfWorker) {
  const workers = state.activeWorkers || {};
  const otherWorkers = Object.entries(workers).filter(([name]) => name !== vfWorker).map(([name, taskId]) => {
    const task = state.tasks.find((t) => t.id === taskId);
    return `${name}: ${task ? task.title : taskId}`;
  });
  return { currentWorker: vfWorker, otherWorkers };
}
function extractSessionContext(state) {
  const contexts = state.sessionContexts || [];
  if (contexts.length === 0) return null;
  const latest = contexts[contexts.length - 1];
  return {
    summary: latest.summary,
    savedAt: latest.savedAt,
    decisions: latest.decisions,
    openQuestions: latest.openQuestions,
    projectState: latest.projectState,
    techStack: latest.techStack
  };
}
function readTeamContext(stateDir, myUsername) {
  const teamWorkersDir = join(stateDir, "team", "workers");
  const localConfigPath = join(stateDir, "team", "local.json");
  if (!existsSync(teamWorkersDir) || !existsSync(localConfigPath)) return null;
  let username = myUsername;
  if (!username) {
    try {
      const localConfig = JSON.parse(readFileSync(localConfigPath, "utf-8"));
      username = localConfig.username || "";
    } catch {
      return null;
    }
  }
  const myActiveFiles = [];
  const myPresencePath = join(teamWorkersDir, `${username}.json`);
  if (existsSync(myPresencePath)) {
    try {
      const myP = JSON.parse(readFileSync(myPresencePath, "utf-8"));
      if (myP.activeFiles) myActiveFiles.push(...myP.activeFiles);
    } catch {
    }
  }
  const coworkers = [];
  const workerFiles = readdirSync(teamWorkersDir).filter((f) => f.endsWith(".json"));
  for (const wf of workerFiles) {
    try {
      const p = JSON.parse(readFileSync(join(teamWorkersDir, wf), "utf-8"));
      if (typeof p.username !== "string" || typeof p.lastHeartbeat !== "string") continue;
      if (p.username === username) continue;
      const ageMs = Date.now() - new Date(p.lastHeartbeat).getTime();
      if (isNaN(ageMs)) continue;
      const ageMins = Math.floor(ageMs / 6e4);
      if (ageMins > 60) continue;
      const status = ageMins < 5 ? "active" : ageMins < 15 ? "idle" : "away";
      const taskInfo = typeof p.taskTitle === "string" ? `${p.taskId} - ${p.taskTitle}` : "idle";
      const progressInfo = typeof p.progress?.total === "number" && p.progress.total > 0 ? ` (${p.progress.met}/${p.progress.total})` : "";
      coworkers.push({
        username: String(p.username).slice(0, 50),
        status,
        taskInfo: String(taskInfo).slice(0, 200),
        progressInfo,
        activeFiles: Array.isArray(p.activeFiles) ? p.activeFiles.filter((f) => typeof f === "string").slice(0, 50) : []
      });
    } catch {
    }
  }
  if (coworkers.length === 0 && myActiveFiles.length === 0) return null;
  return { coworkers, myActiveFiles };
}
function readCloudCacheForHook(stateDir) {
  const cachePath = join(stateDir, "cloud-cache.json");
  if (!existsSync(cachePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(cachePath, "utf-8"));
    if (raw?.version !== 1 || typeof raw.updatedAt !== "string") return null;
    const ageMs = Date.now() - new Date(raw.updatedAt).getTime();
    if (isNaN(ageMs) || ageMs > 10 * 60 * 1e3) return null;
    if (!Array.isArray(raw.team) || !Array.isArray(raw.messages)) return null;
    return raw;
  } catch {
    return null;
  }
}
function readCloudConfigForHook(stateDir) {
  const cloudPath = join(stateDir, "cloud.json");
  if (!existsSync(cloudPath)) return null;
  try {
    const cfg = JSON.parse(readFileSync(cloudPath, "utf-8"));
    if (typeof cfg.supabaseUrl !== "string" || typeof cfg.supabaseAnonKey !== "string" || typeof cfg.accessToken !== "string" || typeof cfg.projectId !== "string") return null;
    if (!cfg.supabaseUrl.startsWith("https://")) return null;
    return {
      supabaseUrl: cfg.supabaseUrl,
      supabaseAnonKey: cfg.supabaseAnonKey,
      accessToken: cfg.accessToken,
      projectId: cfg.projectId
    };
  } catch {
    return null;
  }
}
function formatMessageAge(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 6e4);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
async function fetchRecentMessages(cloudCfg) {
  const params = [
    `project_id=eq.${cloudCfg.projectId}`,
    "select=body,created_at,profiles:profiles(username)",
    "order=created_at.desc",
    "limit=5"
  ].join("&");
  const url = `${cloudCfg.supabaseUrl}/rest/v1/messages?${params}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "apikey": cloudCfg.supabaseAnonKey,
      "Authorization": `Bearer ${cloudCfg.accessToken}`,
      "Accept": "application/json"
    },
    signal: AbortSignal.timeout(3e3)
  });
  if (!response.ok) return [];
  const data = await response.json();
  if (!Array.isArray(data)) return [];
  return data.reverse().map((m) => ({
    username: m.profiles?.username || "?",
    body: m.body,
    time: formatMessageAge(m.created_at)
  }));
}
(async () => {
  try {
    const projectDir = process.env.VF_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const stateFile = findStateFile(projectDir);
    if (!stateFile) process.exit(0);
    const state = JSON.parse(readFileSync(stateFile, "utf-8"));
    const vfWorker = process.env.VF_WORKER || null;
    const stateDir = dirname(stateFile);
    const activeTaskId = resolveActiveTaskId(state, vfWorker);
    if (!activeTaskId) {
      console.log(JSON.stringify(buildNoTaskMessage(vfWorker)));
      process.exit(0);
    }
    const rawTask = state.tasks.find((t) => t.id === activeTaskId);
    if (!rawTask) process.exit(0);
    const task = {
      id: rawTask.id,
      title: rawTask.title,
      metCount: rawTask.acceptanceCriteria.filter((c) => c.met).length,
      totalCount: rawTask.acceptanceCriteria.length,
      unmetCriteria: rawTask.acceptanceCriteria.filter((c) => !c.met).map((c) => c.text)
    };
    const worker = extractWorkerContext(state, vfWorker);
    const noteCount = (state.notes || []).filter((n) => !n.promoted).length;
    const session = extractSessionContext(state);
    let teamUsername = "";
    const localConfigPath = join(stateDir, "team", "local.json");
    if (existsSync(localConfigPath)) {
      try {
        teamUsername = JSON.parse(readFileSync(localConfigPath, "utf-8")).username || "";
      } catch {
      }
    }
    let team = readTeamContext(stateDir, teamUsername);
    const scope = state.projectScope?.outOfScope?.length > 0 ? { outOfScope: state.projectScope.outOfScope } : null;
    const cloudCache = readCloudCacheForHook(stateDir);
    if (cloudCache && cloudCache.team.length > 0) {
      const localUsernames = new Set(team?.coworkers.map((c) => c.username) ?? []);
      const cloudCoworkers = [];
      for (const ct of cloudCache.team) {
        const username = ct.profiles?.username ?? ct.user_id.slice(0, 8);
        if (localUsernames.has(username)) continue;
        const ageMs = Date.now() - new Date(ct.last_heartbeat).getTime();
        const ageMins = Math.floor(ageMs / 6e4);
        if (ageMins > 60) continue;
        const status = ageMins < 5 ? "active" : ageMins < 15 ? "idle" : "away";
        const taskInfo = ct.task_title ? `${ct.task_id} - ${ct.task_title}` : "idle";
        const progressInfo = ct.progress_total > 0 ? ` (${ct.progress_met}/${ct.progress_total})` : "";
        cloudCoworkers.push({
          username,
          status,
          taskInfo,
          progressInfo,
          activeFiles: ct.active_files || []
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
    let messages = [];
    if (cloudCache && cloudCache.messages.length > 0) {
      messages = cloudCache.messages.map((m) => ({
        username: m.profile?.username || "?",
        body: m.body,
        time: formatMessageAge(m.created_at)
      })).reverse();
    } else {
      const cloudCfg = readCloudConfigForHook(stateDir);
      if (cloudCfg) {
        try {
          messages = await fetchRecentMessages(cloudCfg);
        } catch {
        }
      }
    }
    const input = { task, worker, scope, noteCount, session, team, messages };
    console.log(JSON.stringify(buildGuardContext(input)));
  } catch {
    process.exit(0);
  }
})();
