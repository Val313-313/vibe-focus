import {
  AGENT_CONFIGS,
  cleanupWorkers,
  createEmptyState,
  createTask,
  criteriaProgress,
  elapsedMinutes,
  error,
  exportTasks,
  formatDuration,
  generateClaudeMd,
  generateCriterionId,
  generateRulesMd,
  generateTaskId,
  getActiveTask,
  getActiveTaskForWorker,
  getAllActiveWorkers,
  getStateDir,
  getStatePath,
  getTask,
  getTodayStart,
  importTasks,
  info,
  initProject,
  installGuard,
  isValidAgent,
  now,
  printChangeBanner,
  printFocusCard,
  printGuardian,
  printProgressBar,
  printTask,
  readConfig,
  readState,
  resolveActiveTask,
  resolveAgent,
  resolveWorker,
  success,
  unmetDependencies,
  updateConfig,
  updateState,
  updateTask,
  warn,
  writeConfig,
  writeState
} from "./chunk-FOBSJZT7.js";

// src/core/guardian.ts
function todaySwitchCount(state) {
  const todayStart = getTodayStart();
  return state.focusEvents.filter(
    (e) => e.type === "switch_away" && new Date(e.timestamp) >= todayStart
  ).length;
}
function evaluateSwitch(state, currentTask, _targetTaskId) {
  const { met, total } = criteriaProgress(currentTask);
  const completionPercent = total > 0 ? met / total * 100 : 0;
  const elapsed = currentTask.startedAt ? elapsedMinutes(currentTask.startedAt) : 0;
  const switches = todaySwitchCount(state);
  if (total > 0 && completionPercent >= 66) {
    const remaining = total - met;
    return {
      allowed: false,
      severity: "block",
      message: `Du bist ${Math.round(completionPercent)}% fertig mit "${currentTask.title}". Nur noch ${remaining} ${remaining > 1 ? "Kriterien" : "Kriterium"} offen!`,
      suggestion: "Mach die restlichen Kriterien fertig. Du bist fast da.",
      overrideFlag: "--force"
    };
  }
  if (switches >= 3) {
    return {
      allowed: false,
      severity: "block",
      message: `Du hast heute schon ${switches}x den Task gewechselt. Das ist genau das Context-Collapse-Pattern das vibe-focus verhindern soll.`,
      suggestion: 'Pick EINEN Task und mach ihn fertig. Nutze "vf note" um neue Ideen zu parken.',
      overrideFlag: "--yolo"
    };
  }
  if (elapsed > 15) {
    return {
      allowed: false,
      severity: "warn",
      message: `Du hast ${elapsed} Minuten in "${currentTask.title}" investiert. Wechseln heisst: Context weg.`,
      suggestion: 'Mach diesen Task erst fertig, oder nutze "vf abandon --reason ..." wenn du wirklich blockiert bist.',
      overrideFlag: "--force"
    };
  }
  return {
    allowed: false,
    severity: "warn",
    message: `Du hast einen aktiven Task: "${currentTask.title}".`,
    suggestion: 'Nutze "vf add" um neue Ideen zu queuen. Nutze "vf done" wenn fertig.',
    overrideFlag: "--force"
  };
}
function evaluateAdd(currentTask) {
  return {
    allowed: true,
    severity: "info",
    message: `Wird zum Backlog hinzugef\xFCgt. Bleib fokussiert auf: "${currentTask.title}"`,
    suggestion: "",
    overrideFlag: ""
  };
}
function evaluateScopeAlignment(state, taskTitle) {
  if (!state.projectScope) return null;
  const outOfScope = state.projectScope.outOfScope.some(
    (item) => taskTitle.toLowerCase().includes(item.toLowerCase())
  );
  if (outOfScope) {
    return {
      allowed: false,
      severity: "block",
      message: `"${taskTitle}" scheint ausserhalb des Projekt-Scopes zu liegen.`,
      suggestion: `Projekt-Purpose: ${state.projectScope.purpose}. Pr\xFCfe ob dieser Task wirklich hierher geh\xF6rt.`,
      overrideFlag: "--force"
    };
  }
  return null;
}

// src/core/scoring.ts
function computeScoreFromFactors(factors) {
  let score = 50;
  score += factors.tasksCompleted * 20;
  score -= factors.tasksSwitchedAway * 10;
  score -= factors.pushbackOverrides * 5;
  score -= factors.tasksAbandoned * 15;
  return Math.max(0, Math.min(100, Math.round(score)));
}
function calculateDailyScore(state) {
  const todayStart = getTodayStart();
  const todayEvents = state.focusEvents.filter(
    (e) => new Date(e.timestamp) >= todayStart
  );
  const factors = {
    tasksCompleted: todayEvents.filter((e) => e.type === "complete").length,
    tasksSwitchedAway: todayEvents.filter((e) => e.type === "switch_away").length,
    pushbackOverrides: todayEvents.filter((e) => e.type === "pushback_override").length,
    tasksAbandoned: todayEvents.filter((e) => e.type === "abandon").length
  };
  return computeScoreFromFactors(factors);
}
function scoreLabel(score) {
  if (score >= 90) return "Deep Focus";
  if (score >= 70) return "Good Focus";
  if (score >= 50) return "Moderate";
  return "Context Collapse";
}

// src/core/history.ts
function dateKey(timestamp) {
  return timestamp.slice(0, 10);
}
function getDailyHistory(state, maxDays = 14) {
  if (state.focusEvents.length === 0) return [];
  const grouped = /* @__PURE__ */ new Map();
  for (const event of state.focusEvents) {
    const key = dateKey(event.timestamp);
    const list = grouped.get(key) ?? [];
    list.push(event);
    grouped.set(key, list);
  }
  const days = [];
  for (const [date, events] of grouped) {
    const stats = {
      tasksCompleted: events.filter((e) => e.type === "complete").length,
      tasksSwitched: events.filter((e) => e.type === "switch_away").length,
      tasksAbandoned: events.filter((e) => e.type === "abandon").length,
      overrides: events.filter((e) => e.type === "pushback_override").length,
      tasksStarted: events.filter((e) => e.type === "start").length
    };
    days.push({
      date,
      score: computeScoreFromFactors({
        tasksCompleted: stats.tasksCompleted,
        tasksSwitchedAway: stats.tasksSwitched,
        pushbackOverrides: stats.overrides,
        tasksAbandoned: stats.tasksAbandoned
      }),
      ...stats,
      eventCount: events.length
    });
  }
  days.sort((a, b3) => a.date.localeCompare(b3.date));
  return days.slice(-maxDays);
}
function getStreak(history) {
  let streak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].score >= 50) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}
function getAverageScore(history) {
  if (history.length === 0) return 0;
  const sum = history.reduce((acc, d10) => acc + d10.score, 0);
  return Math.round(sum / history.length);
}

// src/core/sync.ts
function detectChanges(state, currentWorker) {
  const meta = state.workerMeta[currentWorker];
  const lastSeen = meta?.lastSeenEventIndex ?? 0;
  const changes = [];
  for (let i = lastSeen; i < state.focusEvents.length; i++) {
    const event = state.focusEvents[i];
    if (event.worker && event.worker !== currentWorker) {
      changes.push({
        type: event.type,
        worker: event.worker,
        taskId: event.taskId,
        description: describeEvent(event),
        timestamp: event.timestamp
      });
    }
  }
  return changes;
}
function describeEvent(event) {
  switch (event.type) {
    case "start":
      return `started ${event.taskId}`;
    case "complete":
      return `completed ${event.taskId}`;
    case "abandon":
      return `abandoned ${event.taskId}`;
    case "switch_away":
      return `switched away from ${event.taskId}`;
    case "switch_to":
      return `switched to ${event.taskId}`;
    case "pushback_override":
      return `overrode guardian on ${event.taskId}`;
    case "message":
      return event.details ?? "(empty message)";
    default:
      return `${event.type} ${event.taskId}`;
  }
}
function formatChangeBanner(changes) {
  if (changes.length === 0) return "";
  const lines = [];
  const shown = changes.slice(-5);
  for (const c3 of shown) {
    const icon = eventIcon(c3.type);
    lines.push(`  ${icon} ${c3.worker}: ${c3.description}`);
  }
  if (changes.length > 5) {
    lines.push(`  ... and ${changes.length - 5} more`);
  }
  return lines.join("\n");
}
function eventIcon(type) {
  switch (type) {
    case "start":
      return "\u25B6";
    case "complete":
      return "\u2713";
    case "abandon":
      return "\u2717";
    case "switch_away":
      return "\u25C0";
    case "switch_to":
      return "\u25B6";
    case "pushback_override":
      return "!";
    case "message":
      return "\u{1F4AC}";
    default:
      return "\xB7";
  }
}
function stampWorkerMeta(state, worker) {
  return {
    ...state.workerMeta,
    [worker]: {
      lastSeenEventIndex: state.focusEvents.length,
      lastCommandAt: now()
    }
  };
}

// src/team/core/team-state.ts
import fs from "fs";
import path2 from "path";

// src/team/core/validation.ts
import path from "path";
var SAFE_USERNAME = /^[a-zA-Z0-9_-]{1,32}$/;
var SENSITIVE_PATTERNS = [
  /\.env/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /secret/i,
  /credential/i,
  /\.aws\//i,
  /\.ssh\//i,
  /\.gnupg\//i,
  /token/i,
  /password/i,
  /\.netrc/i,
  /\.npmrc$/i,
  /\.pypirc$/i
];
function validateUsername(username) {
  if (!SAFE_USERNAME.test(username)) {
    throw new Error(
      `Invalid username "${username}". Only letters, numbers, hyphens, and underscores allowed (max 32 chars).`
    );
  }
  return username;
}
function validatePathWithin(filePath, expectedDir) {
  const resolved = path.resolve(filePath);
  const resolvedDir = path.resolve(expectedDir);
  if (!resolved.startsWith(resolvedDir + path.sep) && resolved !== resolvedDir) {
    throw new Error(`Path traversal detected: ${filePath} escapes ${expectedDir}`);
  }
  return resolved;
}
function filterSensitiveFiles(files) {
  return files.filter((file) => {
    const lower = file.toLowerCase();
    return !SENSITIVE_PATTERNS.some((pattern) => pattern.test(lower));
  });
}
function isSensitivePath(filePath) {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(filePath.toLowerCase()));
}

// src/team/core/team-state.ts
var TEAM_DIR = "team";
var CONFIG_FILE = "config.json";
var LOCAL_FILE = "local.json";
var WORKERS_DIR = "workers";
function getTeamDir() {
  return path2.join(getStateDir(), TEAM_DIR);
}
function getWorkersDir() {
  return path2.join(getTeamDir(), WORKERS_DIR);
}
function isTeamInitialized() {
  return fs.existsSync(path2.join(getTeamDir(), CONFIG_FILE));
}
function readTeamConfig() {
  const filePath = path2.join(getTeamDir(), CONFIG_FILE);
  if (!fs.existsSync(filePath)) {
    throw new Error('Team not initialized. Run "vf team init --user <name>" first.');
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (typeof parsed.version !== "number" || !parsed.settings) {
      throw new Error("Invalid team config format.");
    }
    return parsed;
  } catch (e) {
    throw new Error(`Corrupt team config: ${e.message}. Re-run "vf team init".`);
  }
}
function writeTeamConfig(config) {
  const filePath = path2.join(getTeamDir(), CONFIG_FILE);
  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2));
  fs.renameSync(tmpPath, filePath);
}
function readLocalConfig() {
  const filePath = path2.join(getTeamDir(), LOCAL_FILE);
  if (!fs.existsSync(filePath)) {
    throw new Error('Local config not found. Run "vf team init --user <name>" first.');
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (typeof parsed.username !== "string") {
      throw new Error("Missing username field.");
    }
    return parsed;
  } catch (e) {
    throw new Error(`Corrupt local config: ${e.message}. Re-run "vf team init --user <name>".`);
  }
}
function writeLocalConfig(config) {
  const filePath = path2.join(getTeamDir(), LOCAL_FILE);
  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2));
  fs.renameSync(tmpPath, filePath);
}
function getUsername() {
  const username = readLocalConfig().username;
  validateUsername(username);
  return username;
}
function createTeamDirs() {
  const teamDir = getTeamDir();
  const workersDir = getWorkersDir();
  fs.mkdirSync(teamDir, { recursive: true });
  fs.mkdirSync(workersDir, { recursive: true });
}
function updateGitignore() {
  const gitignorePath = path2.join(getStateDir(), ".gitignore");
  const content = `# Personal state - never commit
*
# Team coordination - shared via Git
!team/
!team/**
# But ignore local config
team/local.json
`;
  fs.writeFileSync(gitignorePath, content);
}

// src/team/core/discord.ts
var COLORS = {
  task_started: 52326,
  // green
  task_completed: 48340,
  // cyan
  criterion_checked: 16761095,
  // yellow
  task_abandoned: 16007990,
  // red
  message: 10233776
  // purple
};
var ICONS = {
  task_started: "\u25B6",
  task_completed: "\u2713",
  criterion_checked: "\u2611",
  task_abandoned: "\u2717",
  message: "\u{1F4AC}"
};
function buildDiscordEmbed(event, teamName) {
  const icon = ICONS[event.type];
  const worker = event.worker ?? "unknown";
  if (event.type === "message") {
    return {
      title: `${icon} ${worker}`,
      description: event.message ?? "",
      color: COLORS.message,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      footer: { text: `vibe-focus | ${teamName}` }
    };
  }
  const action = event.type === "task_started" ? "started" : event.type === "task_completed" ? "completed" : event.type === "criterion_checked" ? "checked criteria on" : "abandoned";
  let description = `**${event.taskId}**: ${event.taskTitle ?? ""}`;
  if (event.progress) {
    description += `
Progress: ${event.progress}`;
  }
  return {
    title: `${icon} ${worker} ${action} ${event.taskId ?? ""}`,
    description,
    color: COLORS[event.type],
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    footer: { text: `vibe-focus | ${teamName}` }
  };
}
async function sendDiscordEmbed(webhookUrl, embed) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5e3);
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [embed]
      }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}
function fireDiscordEvent(event) {
  try {
    if (!isTeamInitialized()) return;
    const config = readTeamConfig();
    const webhookUrl = config.settings.discordWebhookUrl;
    if (!webhookUrl) return;
    const embed = buildDiscordEmbed(event, config.teamName);
    sendDiscordEmbed(webhookUrl, embed).catch(() => {
    });
  } catch {
  }
}
async function testDiscordWebhook(webhookUrl, teamName) {
  try {
    const embed = {
      title: "\u2713 vibe-focus connected",
      description: `Discord notifications enabled for **${teamName}**.
Task events will appear here automatically.`,
      color: COLORS.task_completed,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      footer: { text: `vibe-focus | ${teamName}` }
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5e3);
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed] }),
        signal: controller.signal
      });
      return res.ok;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return false;
  }
}

// src/team/core/presence.ts
import fs2 from "fs";
import path4 from "path";
import os from "os";

// src/team/core/file-tracker.ts
import { execSync } from "child_process";
import path3 from "path";
function getActiveFiles() {
  try {
    const staged = execSync("git diff --cached --name-only", { encoding: "utf-8" }).trim();
    const unstaged = execSync("git diff --name-only", { encoding: "utf-8" }).trim();
    const files = /* @__PURE__ */ new Set();
    for (const line of staged.split("\n")) {
      if (line.trim()) files.add(line.trim());
    }
    for (const line of unstaged.split("\n")) {
      if (line.trim()) files.add(line.trim());
    }
    return [...files].sort();
  } catch {
    return [];
  }
}
function getActiveDirectories() {
  const files = getActiveFiles();
  const dirs = /* @__PURE__ */ new Set();
  for (const file of files) {
    const dir = path3.dirname(file);
    if (dir !== ".") {
      dirs.add(dir + "/");
    }
  }
  return [...dirs].sort();
}

// src/team/core/presence.ts
function safePresencePath(username) {
  validateUsername(username);
  const workersDir = getWorkersDir();
  const filePath = path4.join(workersDir, `${username}.json`);
  return validatePathWithin(filePath, workersDir);
}
function writePresence() {
  const state = readState();
  const username = getUsername();
  const worker = process.env.VF_WORKER ?? void 0;
  const task = resolveActiveTask(state, worker);
  const rawFiles = task ? getActiveFiles() : [];
  const safeFiles = filterSensitiveFiles(rawFiles);
  const rawDirs = task ? getActiveDirectories() : [];
  const safeDirs = filterSensitiveFiles(rawDirs);
  const presence = {
    version: 1,
    username,
    machine: os.hostname().split(".")[0],
    // short hostname only, no FQDN
    taskId: task?.id ?? null,
    taskTitle: task?.title ?? null,
    taskStatus: task ? "active" : "idle",
    progress: task ? (() => {
      const { met, total } = criteriaProgress(task);
      return { met, total, percent: total > 0 ? Math.round(met / total * 100) : 0 };
    })() : { met: 0, total: 0, percent: 0 },
    activeFiles: safeFiles,
    activeDirectories: safeDirs,
    flowMode: null,
    lastHeartbeat: now(),
    sessionStarted: task?.startedAt ?? null,
    worker: worker ?? null
  };
  const filePath = safePresencePath(username);
  const tmpPath = filePath + ".tmp";
  fs2.writeFileSync(tmpPath, JSON.stringify(presence, null, 2));
  fs2.renameSync(tmpPath, filePath);
}
function readAllPresence() {
  const workersDir = getWorkersDir();
  if (!fs2.existsSync(workersDir)) return [];
  const files = fs2.readdirSync(workersDir).filter((f) => f.endsWith(".json"));
  const results = [];
  for (const file of files) {
    try {
      const raw = fs2.readFileSync(path4.join(workersDir, file), "utf-8");
      const parsed = JSON.parse(raw);
      if (typeof parsed.username !== "string" || typeof parsed.lastHeartbeat !== "string" || typeof parsed.version !== "number") {
        continue;
      }
      results.push(parsed);
    } catch {
    }
  }
  return results;
}
function getCoworkers(staleThreshold = 15, offlineThreshold = 60) {
  let username;
  try {
    username = getUsername();
  } catch {
    return [];
  }
  const all = readAllPresence();
  return all.filter((p) => p.username !== username).map((presence) => {
    const age = elapsedMinutes(presence.lastHeartbeat);
    const staleness = getStaleness(age, staleThreshold, offlineThreshold);
    return { presence, staleness, heartbeatAge: age };
  });
}
function getStaleness(ageMinutes, staleThreshold, offlineThreshold) {
  if (ageMinutes < 5) return "active";
  if (ageMinutes < staleThreshold) return "idle";
  if (ageMinutes < offlineThreshold) return "away";
  return "offline";
}
function detectConflicts(myFiles, coworkers) {
  const warnings = [];
  const myDirs = new Set(myFiles.map((f) => path4.dirname(f)));
  for (const cw of coworkers) {
    if (cw.staleness === "offline") continue;
    const theirFiles = new Set(cw.presence.activeFiles);
    const theirDirs = new Set(cw.presence.activeDirectories);
    const fileCollisions = myFiles.filter((f) => theirFiles.has(f));
    if (fileCollisions.length > 0) {
      warnings.push({
        type: "file_collision",
        files: fileCollisions,
        coworkers: [cw.presence.username]
      });
    }
    const dirOverlaps = [...myDirs].filter((d10) => theirDirs.has(d10 + "/") || theirDirs.has(d10));
    if (dirOverlaps.length > 0 && fileCollisions.length === 0) {
      warnings.push({
        type: "directory_overlap",
        files: dirOverlaps,
        coworkers: [cw.presence.username]
      });
    }
  }
  return warnings;
}
function goOffline() {
  const username = getUsername();
  const filePath = safePresencePath(username);
  if (fs2.existsSync(filePath)) {
    fs2.unlinkSync(filePath);
  }
}

// src/team/register.ts
import { Command as Command8 } from "commander";

// src/team/commands/init.ts
import os2 from "os";
import { Command } from "commander";
var initCommand = new Command("init").description("Initialize team mode for this vibe-focus project").requiredOption("--user <name>", "Your username (only letters, numbers, hyphens, underscores)").option("--team-name <name>", "Team name", "team").option("--skip-guard", "Skip auto-installing the focus guard").action(async (opts) => {
  try {
    validateUsername(opts.user);
  } catch (e) {
    console.error("Error: " + e.message);
    process.exit(1);
  }
  try {
    getStateDir();
  } catch {
    console.error('Error: Not a vibe-focus project. Run "vf init" first.');
    process.exit(1);
  }
  if (isTeamInitialized()) {
    console.log("Team already initialized. Updating local config...");
  } else {
    createTeamDirs();
    const teamConfig = {
      version: 1,
      teamName: opts.teamName,
      settings: {
        staleThresholdMinutes: 15,
        offlineThresholdMinutes: 60,
        syncIntervalSeconds: 60
      }
    };
    writeTeamConfig(teamConfig);
    updateGitignore();
    console.log("Team directory created: .vibe-focus/team/");
    console.log("Updated .gitignore to track team files.");
  }
  const localConfig = {
    username: opts.user,
    machine: os2.hostname(),
    autoSync: false
  };
  writeLocalConfig(localConfig);
  console.log("");
  console.log(`  Username:  ${opts.user}`);
  console.log(`  Machine:   ${os2.hostname()}`);
  console.log(`  Team:      ${opts.teamName}`);
  if (!opts.skipGuard) {
    try {
      const { installGuard: installGuard2 } = await import("./guard-LWGQF67X.js");
      const agent = resolveAgent();
      const config = AGENT_CONFIGS[agent];
      console.log("");
      console.log(`  Guard:     auto-installing for ${config.displayName}...`);
      installGuard2(agent);
    } catch {
      console.log("");
      console.log('  Guard:     skipped (run "vf guard --install" manually)');
    }
  }
  console.log("");
  console.log("Next steps:");
  console.log('  1. Commit the team config:  git add .vibe-focus/team/ && git commit -m "Init vibe-focus-team"');
  console.log("  2. Have your coworker run:  vf team init --user <their-name>");
  console.log("  3. Check team status:       vf team status");
});

// src/team/commands/status.ts
import chalk from "chalk";
import { Command as Command2 } from "commander";
var g = chalk.green;
var gB = chalk.greenBright;
var gD = chalk.dim.green;
var c = chalk.cyan;
var cB = chalk.cyanBright;
var y = chalk.yellow;
var r = chalk.red;
var d = chalk.dim;
var b = chalk.bold;
function stalenessColor(level) {
  switch (level) {
    case "active":
      return gB;
    case "idle":
      return y;
    case "away":
      return r;
    case "offline":
      return d;
  }
}
function stalenessIcon(level) {
  switch (level) {
    case "active":
      return gB("\u25CF");
    case "idle":
      return y("\u25D0");
    case "away":
      return r("\u25CB");
    case "offline":
      return d("\u25CB");
  }
}
function formatAge(minutes) {
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
function hLine(char, width) {
  return char.repeat(width);
}
function boxTop(w) {
  return gD("\u2554" + hLine("\u2550", w - 2) + "\u2557");
}
function boxBot(w) {
  return gD("\u255A" + hLine("\u2550", w - 2) + "\u255D");
}
function boxRow(content, w) {
  const visible = content.replace(/\x1b\[[0-9;]*m/g, "");
  const pad = Math.max(0, w - 4 - visible.length);
  return gD("\u2551") + " " + content + " ".repeat(pad) + " " + gD("\u2551");
}
function boxEmpty(w) {
  return gD("\u2551") + " ".repeat(w - 2) + gD("\u2551");
}
function sectionHeader(label, w) {
  const remaining = w - 6 - label.length - 4;
  return gD("\u2560\u2500\u2500") + " " + gB(label) + " " + gD(hLine("\u2500", Math.max(1, remaining)) + "\u2563");
}
var statusCommand = new Command2("status").description("Show team members and their current focus state").option("--json", "Output as JSON").action((opts) => {
  try {
    writePresence();
  } catch {
  }
  let teamConfig;
  try {
    teamConfig = readTeamConfig();
  } catch (e) {
    console.error(e.message);
    return;
  }
  const username = getUsername();
  const allPresence = readAllPresence();
  const coworkers = getCoworkers(
    teamConfig.settings.staleThresholdMinutes,
    teamConfig.settings.offlineThresholdMinutes
  );
  const myFiles = getActiveFiles();
  const conflicts = detectConflicts(myFiles, coworkers);
  if (opts.json) {
    console.log(JSON.stringify({ username, team: teamConfig, workers: allPresence, coworkers, conflicts }, null, 2));
    return;
  }
  const W = 68;
  const lines = [];
  lines.push("");
  lines.push(boxTop(W));
  lines.push(boxRow(
    gB("TEAM") + d("://") + c(teamConfig.teamName) + d(" > ") + cB("COWORKER AWARENESS"),
    W
  ));
  lines.push(sectionHeader("TEAM MEMBERS", W));
  lines.push(boxEmpty(W));
  if (allPresence.length === 0) {
    lines.push(boxRow(d("   No team members found. Run: vf team init --user <name>"), W));
  } else {
    lines.push(boxRow(
      d("   USER          STATUS    TASK                  PROGRESS  HEARTBEAT"),
      W
    ));
    lines.push(boxRow(d("   " + hLine("\u2500", W - 8)), W));
    for (const presence of allPresence) {
      const isMe = presence.username === username;
      const cw = coworkers.find((c3) => c3.presence.username === presence.username);
      const staleness = cw?.staleness ?? "active";
      const age = cw?.heartbeatAge ?? 0;
      const icon = stalenessIcon(isMe ? "active" : staleness);
      const nameColor = isMe ? cB : stalenessColor(staleness);
      const nameStr = nameColor((presence.username + (isMe ? " (you)" : "")).padEnd(14));
      const statusStr = presence.taskStatus === "active" ? g("active".padEnd(10)) : d("idle".padEnd(10));
      const taskStr = presence.taskId ? (b(presence.taskId) + " " + (presence.taskTitle ?? "").slice(0, 16)).padEnd(22) : d("\u2014".padEnd(22));
      const pctStr = presence.taskId ? (presence.progress.percent + "%").padEnd(10) : d("\u2014".padEnd(10));
      const ageStr = isMe ? g("now".padEnd(9)) : stalenessColor(staleness)(formatAge(age).padEnd(9));
      lines.push(boxRow(
        "   " + icon + " " + nameStr + statusStr + taskStr + pctStr + ageStr,
        W
      ));
    }
  }
  if (conflicts.length > 0) {
    lines.push(sectionHeader("CONFLICTS", W));
    lines.push(boxEmpty(W));
    for (const conflict of conflicts) {
      const severity = conflict.type === "file_collision" ? r("FILE") : y("DIR");
      const who = conflict.coworkers.join(", ");
      lines.push(boxRow(
        "   " + severity + d(" ") + r(conflict.files.join(", ").slice(0, 35)) + d(" \u2190 ") + c(who),
        W
      ));
    }
  }
  if (myFiles.length > 0) {
    lines.push(sectionHeader("YOUR ACTIVE FILES", W));
    lines.push(boxEmpty(W));
    for (const file of myFiles.slice(0, 8)) {
      lines.push(boxRow("   " + d(file), W));
    }
    if (myFiles.length > 8) {
      lines.push(boxRow("   " + d(`... and ${myFiles.length - 8} more`), W));
    }
  }
  lines.push(boxEmpty(W));
  lines.push(boxBot(W));
  lines.push("");
  console.log(lines.join("\n"));
});

// src/team/commands/sync.ts
import { execFileSync } from "child_process";
import { Command as Command3 } from "commander";

// src/cloud/core/cloud-state.ts
import fs3 from "fs";
import path5 from "path";
import crypto from "crypto";
var CLOUD_FILE = "cloud.json";
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var HTTPS_URL_RE = /^https:\/\/[a-zA-Z0-9][a-zA-Z0-9.-]+[a-zA-Z0-9](:\d{1,5})?(\/[^\s]*)?$/;
function getCloudPath() {
  return path5.join(getStateDir(), CLOUD_FILE);
}
function defaultConfig() {
  return {
    version: 1,
    apiUrl: "https://vibeteamz.vercel.app",
    supabaseUrl: null,
    supabaseAnonKey: null,
    accessToken: null,
    refreshToken: null,
    userId: null,
    projectId: null,
    linkedAt: null,
    apiKey: null
  };
}
function validateConfig(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Invalid cloud config: not an object.");
  }
  const obj = raw;
  if (obj.version !== 1) {
    throw new Error("Invalid cloud config version.");
  }
  if (typeof obj.apiUrl !== "string" || !HTTPS_URL_RE.test(obj.apiUrl)) {
    throw new Error("Invalid cloud config: apiUrl must be a valid HTTPS URL.");
  }
  const nullableStrings = ["supabaseUrl", "supabaseAnonKey", "accessToken", "refreshToken", "userId", "linkedAt", "apiKey"];
  for (const key of nullableStrings) {
    const val = obj[key];
    if (val !== null && val !== void 0 && typeof val !== "string") {
      throw new Error(`Invalid cloud config: ${key} must be string or null (got ${typeof val}: ${String(val).slice(0, 20)}).`);
    }
  }
  if (typeof obj.supabaseUrl === "string" && !HTTPS_URL_RE.test(obj.supabaseUrl)) {
    throw new Error("Invalid cloud config: supabaseUrl must be a valid HTTPS URL.");
  }
  if (typeof obj.userId === "string" && !UUID_RE.test(obj.userId)) {
    throw new Error("Invalid cloud config: userId must be a valid UUID.");
  }
  if (obj.projectId !== null && obj.projectId !== void 0) {
    if (typeof obj.projectId !== "string") {
      throw new Error("Invalid cloud config: projectId must be string or null.");
    }
    if (!UUID_RE.test(obj.projectId)) {
      throw new Error("Invalid cloud config: projectId must be a valid UUID.");
    }
  }
  return {
    version: 1,
    apiUrl: obj.apiUrl,
    supabaseUrl: obj.supabaseUrl ?? null,
    supabaseAnonKey: obj.supabaseAnonKey ?? null,
    accessToken: obj.accessToken ?? null,
    refreshToken: obj.refreshToken ?? null,
    userId: obj.userId ?? null,
    projectId: obj.projectId ?? null,
    linkedAt: obj.linkedAt ?? null,
    apiKey: obj.apiKey ?? null
  };
}
function readCloudConfig() {
  const filePath = getCloudPath();
  if (!fs3.existsSync(filePath)) {
    return defaultConfig();
  }
  const raw = fs3.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw);
  return validateConfig(parsed);
}
function writeCloudConfig(config) {
  const validated = validateConfig(config);
  const filePath = getCloudPath();
  const tmpPath = filePath + "." + crypto.randomBytes(4).toString("hex") + ".tmp";
  const content = JSON.stringify(validated, null, 2);
  fs3.writeFileSync(tmpPath, content, { mode: 384 });
  fs3.renameSync(tmpPath, filePath);
}
function isCloudLinked() {
  try {
    const config = readCloudConfig();
    return !!((config.accessToken || config.apiKey) && config.userId && config.projectId);
  } catch {
    return false;
  }
}
function clearCloudAuth() {
  try {
    const config = readCloudConfig();
    writeCloudConfig({
      ...config,
      accessToken: null,
      refreshToken: null,
      userId: null
    });
  } catch {
  }
}
function isValidUUID(value) {
  return UUID_RE.test(value);
}
function isValidHttpsUrl(value) {
  return HTTPS_URL_RE.test(value);
}

// src/cloud/core/cloud-cache.ts
import fs4 from "fs";
import path6 from "path";
import crypto2 from "crypto";
var CACHE_FILE = "cloud-cache.json";
var MAX_CACHE_AGE_MS = 10 * 60 * 1e3;
function getCachePath() {
  return path6.join(getStateDir(), CACHE_FILE);
}
function writeCloudCache(cache) {
  const filePath = getCachePath();
  const tmpPath = filePath + "." + crypto2.randomBytes(4).toString("hex") + ".tmp";
  const content = JSON.stringify(cache, null, 2);
  fs4.writeFileSync(tmpPath, content, { mode: 384 });
  fs4.renameSync(tmpPath, filePath);
}
function readCloudCache(maxAge = MAX_CACHE_AGE_MS) {
  const filePath = getCachePath();
  if (!fs4.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs4.readFileSync(filePath, "utf-8"));
    if (raw?.version !== 1 || !raw.updatedAt) return null;
    const ageMs = Date.now() - new Date(raw.updatedAt).getTime();
    if (ageMs > maxAge) return null;
    return {
      version: 1,
      updatedAt: raw.updatedAt,
      team: Array.isArray(raw.team) ? raw.team : [],
      messages: Array.isArray(raw.messages) ? raw.messages : [],
      tasks: Array.isArray(raw.tasks) ? raw.tasks : void 0,
      suggestions: Array.isArray(raw.suggestions) ? raw.suggestions : void 0
    };
  } catch {
    return null;
  }
}

// src/cloud/core/token-refresh.ts
var REFRESH_TIMEOUT_MS = 1e4;
async function refreshAccessToken() {
  let config;
  try {
    config = readCloudConfig();
  } catch {
    return false;
  }
  if (!config.supabaseUrl || !config.supabaseAnonKey || !config.refreshToken) {
    return false;
  }
  const url = `${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": config.supabaseAnonKey
      },
      body: JSON.stringify({ refresh_token: config.refreshToken }),
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS)
    });
    if (!response.ok) {
      return false;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return false;
    }
    const data = await response.json();
    if (typeof data.access_token !== "string" || typeof data.refresh_token !== "string") {
      return false;
    }
    config.accessToken = data.access_token;
    config.refreshToken = data.refresh_token;
    writeCloudConfig(config);
    return true;
  } catch {
    return false;
  }
}

// src/cloud/core/heartbeat.ts
var MAX_FILES = 50;
var HEARTBEAT_TIMEOUT_MS = 5e3;
var MAX_PAYLOAD_BYTES = 64e3;
var TOKEN_REFRESH_MARGIN_S = 600;
function isTokenExpiringSoon(token, marginSeconds = TOKEN_REFRESH_MARGIN_S) {
  if (!token) return true;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return true;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    if (typeof payload.exp !== "number") return true;
    const now2 = Math.floor(Date.now() / 1e3);
    return payload.exp - now2 < marginSeconds;
  } catch {
    return true;
  }
}
function buildHeartbeatPayload(overrides = {}) {
  let config;
  try {
    config = readCloudConfig();
  } catch {
    return null;
  }
  if (!(config.accessToken || config.apiKey) || !config.userId || !config.projectId) {
    return null;
  }
  let state;
  try {
    state = readState();
  } catch {
    return null;
  }
  const task = resolveActiveTask(state);
  const progress = task ? criteriaProgress(task) : { met: 0, total: 0 };
  const score = calculateDailyScore(state);
  let activeFiles = [];
  try {
    const raw = getActiveFiles();
    activeFiles = filterSensitiveFiles(raw).slice(0, MAX_FILES);
  } catch {
  }
  return {
    user_id: config.userId,
    project_id: config.projectId,
    task_id: task?.id ?? null,
    task_title: task?.title ?? null,
    progress_met: progress.met,
    progress_total: progress.total,
    active_files: activeFiles,
    focus_score: score,
    status: overrides.status ?? (task ? "active" : "idle")
  };
}
async function sendHeartbeat(payload) {
  const config = readCloudConfig();
  const bearerToken = config.apiKey ?? config.accessToken;
  const usingApiKey = !!config.apiKey;
  if (!bearerToken) {
    return { ok: false, error: "Not authenticated." };
  }
  const url = `${config.apiUrl}/api/heartbeat`;
  const body = JSON.stringify(payload);
  if (Buffer.byteLength(body, "utf-8") > MAX_PAYLOAD_BYTES) {
    return { ok: false, error: "Payload too large." };
  }
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${bearerToken}`
    },
    body,
    signal: AbortSignal.timeout(HEARTBEAT_TIMEOUT_MS)
  });
  if (response.status === 401 || response.status === 403) {
    if (usingApiKey) {
      return { ok: false, error: 'API key rejected. Re-run "vf cloud link" to generate a new key.' };
    }
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const freshConfig = readCloudConfig();
      const retryResponse = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${freshConfig.accessToken}`
        },
        body,
        signal: AbortSignal.timeout(HEARTBEAT_TIMEOUT_MS)
      });
      if (!retryResponse.ok) {
        return { ok: false, error: `HTTP ${retryResponse.status}` };
      }
      const retryContentType = retryResponse.headers.get("content-type") ?? "";
      if (!retryContentType.includes("application/json")) {
        return { ok: false, error: "Unexpected response format." };
      }
      const retryResult = await retryResponse.json();
      if (typeof retryResult.ok !== "boolean") {
        return { ok: false, error: "Malformed API response." };
      }
      if (retryResult.ok && (Array.isArray(retryResult.team) || Array.isArray(retryResult.messages))) {
        try {
          writeCloudCache({
            version: 1,
            updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
            team: Array.isArray(retryResult.team) ? retryResult.team : [],
            messages: Array.isArray(retryResult.messages) ? retryResult.messages : [],
            tasks: Array.isArray(retryResult.tasks) ? retryResult.tasks : void 0,
            suggestions: Array.isArray(retryResult.suggestions) ? retryResult.suggestions : void 0
          });
        } catch {
        }
      }
      return {
        ok: retryResult.ok,
        error: retryResult.error,
        team: Array.isArray(retryResult.team) ? retryResult.team : void 0,
        messages: Array.isArray(retryResult.messages) ? retryResult.messages : void 0,
        tasks: Array.isArray(retryResult.tasks) ? retryResult.tasks : void 0,
        suggestions: Array.isArray(retryResult.suggestions) ? retryResult.suggestions : void 0,
        notifications: Array.isArray(retryResult.notifications) ? retryResult.notifications : void 0
      };
    }
    return { ok: false, error: `HTTP ${response.status}` };
  }
  if (!response.ok) {
    return { ok: false, error: `HTTP ${response.status}` };
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return { ok: false, error: "Unexpected response format." };
  }
  const result = await response.json();
  if (typeof result.ok !== "boolean") {
    return { ok: false, error: "Malformed API response." };
  }
  if (result.ok && (Array.isArray(result.team) || Array.isArray(result.messages))) {
    try {
      writeCloudCache({
        version: 1,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        team: Array.isArray(result.team) ? result.team : [],
        messages: Array.isArray(result.messages) ? result.messages : [],
        tasks: Array.isArray(result.tasks) ? result.tasks : void 0,
        suggestions: Array.isArray(result.suggestions) ? result.suggestions : void 0
      });
    } catch {
    }
  }
  if (config.refreshToken && isTokenExpiringSoon(config.accessToken)) {
    refreshAccessToken().catch(() => {
    });
  }
  return {
    ok: result.ok,
    error: result.error,
    team: Array.isArray(result.team) ? result.team : void 0,
    messages: Array.isArray(result.messages) ? result.messages : void 0,
    tasks: Array.isArray(result.tasks) ? result.tasks : void 0,
    suggestions: Array.isArray(result.suggestions) ? result.suggestions : void 0,
    notifications: Array.isArray(result.notifications) ? result.notifications : void 0
  };
}
function fireHeartbeat(overrides = {}) {
  try {
    const payload = buildHeartbeatPayload(overrides);
    if (!payload) return;
    sendHeartbeat(payload).catch(() => {
    });
  } catch {
  }
}

// src/team/commands/sync.ts
var syncCommand = new Command3("sync").description("Sync team presence files via Git (commit + pull + push)").option("--quiet", "Suppress output").action((opts) => {
  const username = getUsername();
  const log = opts.quiet ? (() => {
  }) : console.log;
  try {
    writePresence();
    log("  Updated presence file.");
  } catch (e) {
    log(`  Warning: Could not update presence: ${e.message}`);
  }
  try {
    execFileSync("git", ["add", ".vibe-focus/team/workers/", ".vibe-focus/team/config.json"], {
      stdio: "pipe",
      encoding: "utf-8"
    });
  } catch {
  }
  try {
    const time = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });
    execFileSync("git", ["commit", "--no-verify", "-m", `vft: heartbeat ${username} ${time}`], {
      stdio: "pipe",
      encoding: "utf-8"
    });
    log("  Committed presence update.");
  } catch {
    log("  No changes to commit.");
  }
  try {
    const result = execFileSync("git", ["pull", "--rebase"], {
      stdio: "pipe",
      encoding: "utf-8"
    });
    log("  Pulled latest: " + result.trim().split("\n")[0]);
  } catch (e) {
    try {
      execFileSync("git", ["rebase", "--abort"], { stdio: "pipe" });
    } catch {
    }
    log("  Warning: Pull failed (rebase aborted): " + (e.stderr || e.message).split("\n")[0]);
  }
  try {
    execFileSync("git", ["push"], {
      stdio: "pipe",
      encoding: "utf-8"
    });
    log("  Pushed to remote.");
  } catch (e) {
    log("  Warning: Push failed: " + (e.stderr || e.message).split("\n")[0]);
    try {
      execFileSync("git", ["pull", "--rebase"], { stdio: "pipe", encoding: "utf-8" });
      execFileSync("git", ["push"], { stdio: "pipe", encoding: "utf-8" });
      log("  Retry succeeded.");
    } catch {
      try {
        execFileSync("git", ["rebase", "--abort"], { stdio: "pipe" });
      } catch {
      }
      log("  Sync incomplete - will retry next time.");
    }
  }
  fireHeartbeat();
  log("");
  log("  Sync complete.");
});

// src/team/commands/who.ts
import chalk2 from "chalk";
import { Command as Command4 } from "commander";
var whoCommand = new Command4("who").description("Check who is working on a specific file or directory").argument("<path>", "File or directory path to check").action((targetPath) => {
  try {
    writePresence();
  } catch {
  }
  const username = getUsername();
  const myFiles = getActiveFiles();
  const coworkers = getCoworkers();
  const iAmTouching = myFiles.some(
    (f) => f === targetPath || f.startsWith(targetPath)
  );
  const touching = [];
  if (iAmTouching) {
    touching.push(`${chalk2.cyanBright(username)} (you)`);
  }
  for (const cw of coworkers) {
    if (cw.staleness === "offline") continue;
    const match = cw.presence.activeFiles.some(
      (f) => f === targetPath || f.startsWith(targetPath)
    );
    if (match) {
      touching.push(chalk2.yellow(cw.presence.username));
    }
  }
  if (touching.length === 0) {
    console.log(chalk2.dim(`  No one is currently working on ${targetPath}`));
  } else {
    console.log(`  ${chalk2.bold(targetPath)}: ${touching.join(", ")}`);
    if (touching.length > 1) {
      console.log(chalk2.red("  \u26A0 Multiple people touching this path - coordinate!"));
    }
  }
});

// src/team/commands/offline.ts
import chalk3 from "chalk";
import { Command as Command5 } from "commander";
var offlineCommand = new Command5("offline").description("Mark yourself as offline (removes your presence file)").action(() => {
  const username = getUsername();
  goOffline();
  console.log(chalk3.dim(`  ${username} marked as offline. Presence file removed.`));
});

// src/team/commands/msg.ts
import chalk4 from "chalk";
import { Command as Command6 } from "commander";

// src/cloud/core/api.ts
var QUERY_TIMEOUT_MS = 8e3;
var INSERT_TIMEOUT_MS = 5e3;
var MAX_RESPONSE_BYTES = 512e3;
var MAX_PAYLOAD_BYTES2 = 64e3;
async function getSupabaseConfig() {
  let config;
  try {
    config = readCloudConfig();
  } catch {
    return null;
  }
  if (!config.supabaseUrl || !config.supabaseAnonKey || !config.userId || !config.projectId) {
    return null;
  }
  if (!config.accessToken && config.refreshToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      config = readCloudConfig();
    }
  }
  if (!config.accessToken) {
    return null;
  }
  return {
    supabaseUrl: config.supabaseUrl,
    supabaseAnonKey: config.supabaseAnonKey,
    accessToken: config.accessToken,
    userId: config.userId,
    projectId: config.projectId
  };
}
async function supabaseQuery(table, params, options = {}) {
  const cfg = await getSupabaseConfig();
  if (!cfg) {
    return { success: false, error: "Cloud not configured." };
  }
  const url = `${cfg.supabaseUrl}/rest/v1/${table}?${params}`;
  const timeout = options.timeout ?? QUERY_TIMEOUT_MS;
  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        "apikey": cfg.supabaseAnonKey,
        "Authorization": `Bearer ${cfg.accessToken}`,
        "Accept": "application/json"
      },
      signal: AbortSignal.timeout(timeout)
    });
  } catch {
    return { success: false, error: "Request failed." };
  }
  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const freshConfig = readCloudConfig();
      if (freshConfig.accessToken) {
        try {
          response = await fetch(url, {
            method: "GET",
            headers: {
              "apikey": cfg.supabaseAnonKey,
              "Authorization": `Bearer ${freshConfig.accessToken}`,
              "Accept": "application/json"
            },
            signal: AbortSignal.timeout(timeout)
          });
        } catch {
          return { success: false, error: "Request failed after token refresh." };
        }
      }
    }
  }
  if (!response.ok) {
    return { success: false, error: `HTTP ${response.status}` };
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return { success: false, error: "Unexpected response format." };
  }
  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_BYTES) {
    return { success: false, error: "Response too large." };
  }
  let body;
  try {
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      return { success: false, error: "Response too large." };
    }
    body = JSON.parse(text);
  } catch {
    return { success: false, error: "Malformed response." };
  }
  if (!Array.isArray(body)) {
    return { success: false, error: "Expected array response." };
  }
  return { success: true, data: body };
}
async function supabaseInsert(table, payload) {
  const cfg = await getSupabaseConfig();
  if (!cfg) {
    return { success: false, error: "Cloud not configured." };
  }
  const url = `${cfg.supabaseUrl}/rest/v1/${table}`;
  const body = JSON.stringify(payload);
  if (Buffer.byteLength(body, "utf-8") > MAX_PAYLOAD_BYTES2) {
    return { success: false, error: "Payload too large." };
  }
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "apikey": cfg.supabaseAnonKey,
        "Authorization": `Bearer ${cfg.accessToken}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body,
      signal: AbortSignal.timeout(INSERT_TIMEOUT_MS)
    });
  } catch {
    return { success: false, error: "Request failed." };
  }
  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const freshConfig = readCloudConfig();
      if (freshConfig.accessToken) {
        try {
          response = await fetch(url, {
            method: "POST",
            headers: {
              "apikey": cfg.supabaseAnonKey,
              "Authorization": `Bearer ${freshConfig.accessToken}`,
              "Content-Type": "application/json",
              "Prefer": "return=minimal"
            },
            body,
            signal: AbortSignal.timeout(INSERT_TIMEOUT_MS)
          });
        } catch {
          return { success: false, error: "Request failed after token refresh." };
        }
      }
    }
  }
  if (!response.ok) {
    return { success: false, error: `HTTP ${response.status}` };
  }
  return { success: true, data: void 0 };
}
function fireCloudActivity(activity) {
  getSupabaseConfig().then((cfg) => {
    if (!cfg) return;
    const payload = {
      project_id: cfg.projectId,
      user_id: cfg.userId,
      type: activity.type,
      message: activity.message
    };
    return supabaseInsert("activity", payload);
  }).catch(() => {
  });
}

// src/team/commands/msg.ts
function getCloudConfig() {
  try {
    const config = readCloudConfig();
    if (!config.userId || !config.projectId) return null;
    return { userId: config.userId, projectId: config.projectId };
  } catch {
    return null;
  }
}
function formatAge2(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 6e4);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
var msgCommand = new Command6("msg").description("Send or read team messages").argument("[message]", "Message to send (omit to read recent messages)").action(async (message) => {
  const cfg = getCloudConfig();
  if (!cfg) {
    console.log(chalk4.red("  Cloud not linked. Run: vf cloud login && vf cloud link"));
    return;
  }
  if (message) {
    const trimmed = message.trim();
    if (trimmed.length === 0 || trimmed.length > 500) {
      console.log(chalk4.red("  Message must be 1-500 characters."));
      return;
    }
    const result = await supabaseInsert("messages", {
      project_id: cfg.projectId,
      user_id: cfg.userId,
      body: trimmed
    });
    if (result.success) {
      console.log(chalk4.green("  \u2713 Message sent to team"));
      fireDiscordEvent({ type: "message", message: trimmed });
    } else {
      console.log(chalk4.red(`  Failed to send: ${result.error}`));
    }
  } else {
    const params = [
      `project_id=eq.${cfg.projectId}`,
      "select=id,body,created_at,profiles:profiles(username)",
      "order=created_at.desc",
      "limit=10"
    ].join("&");
    const result = await supabaseQuery("messages", params);
    if (!result.success) {
      console.log(chalk4.red(`  Failed to fetch messages: ${result.error}`));
      return;
    }
    if (result.data.length === 0) {
      console.log(chalk4.dim("  No team messages yet."));
      return;
    }
    console.log(chalk4.bold("\n  Team Messages (last 10)\n"));
    const msgs = [...result.data].reverse();
    const maxNameLen = Math.max(...msgs.map((m) => (m.profiles?.username || "?").length));
    for (const msg of msgs) {
      const name = (msg.profiles?.username || "?").padEnd(maxNameLen);
      const age = formatAge2(msg.created_at);
      console.log(`  ${chalk4.cyanBright(name)}  ${msg.body}  ${chalk4.dim(age)}`);
    }
    console.log("");
  }
});

// src/team/commands/discord.ts
import { Command as Command7 } from "commander";
import chalk5 from "chalk";
var discordCommand = new Command7("discord").description("Configure Discord webhook for team notifications").argument("[webhook-url]", "Discord webhook URL (omit to show status)").option("--off", "Disable Discord notifications").action(async (webhookUrl, opts) => {
  if (!isTeamInitialized()) {
    console.log(chalk5.red("  Team not initialized. Run: vf team init --user <name>"));
    return;
  }
  const config = readTeamConfig();
  if (opts?.off) {
    if (!config.settings.discordWebhookUrl) {
      console.log(chalk5.dim("  Discord notifications are already off."));
      return;
    }
    delete config.settings.discordWebhookUrl;
    writeTeamConfig(config);
    console.log(chalk5.green("  \u2713 Discord notifications disabled."));
    return;
  }
  if (!webhookUrl) {
    if (config.settings.discordWebhookUrl) {
      const masked = config.settings.discordWebhookUrl.replace(/\/[\w-]+$/, "/****");
      console.log(chalk5.green("  \u2713 Discord notifications enabled"));
      console.log(chalk5.dim(`  Webhook: ${masked}`));
    } else {
      console.log(chalk5.dim("  Discord notifications are off."));
      console.log(chalk5.dim('  Run: vf team discord "https://discord.com/api/webhooks/..."'));
    }
    return;
  }
  try {
    const url = new URL(webhookUrl);
    if (url.protocol !== "https:") {
      console.log(chalk5.red("  Webhook URL must use HTTPS."));
      return;
    }
    if (!url.hostname.includes("discord.com") && !url.hostname.includes("discordapp.com")) {
      console.log(chalk5.yellow("  Warning: URL does not look like a Discord webhook."));
      console.log(chalk5.dim("  Expected: https://discord.com/api/webhooks/..."));
    }
  } catch {
    console.log(chalk5.red("  Invalid URL format."));
    return;
  }
  console.log(chalk5.dim("  Testing webhook..."));
  const ok = await testDiscordWebhook(webhookUrl, config.teamName);
  if (!ok) {
    console.log(chalk5.red("  Webhook test failed. Check the URL and try again."));
    return;
  }
  config.settings.discordWebhookUrl = webhookUrl;
  writeTeamConfig(config);
  console.log(chalk5.green("  \u2713 Discord notifications enabled!"));
  console.log(chalk5.dim("  A test message was sent to your channel."));
  console.log(chalk5.dim("  Task events will now post automatically."));
});

// src/team/register.ts
function register(program) {
  const teamCmd = new Command8("team").description("Team collaboration commands");
  teamCmd.addCommand(initCommand);
  teamCmd.addCommand(statusCommand);
  teamCmd.addCommand(syncCommand);
  teamCmd.addCommand(whoCommand);
  teamCmd.addCommand(offlineCommand);
  teamCmd.addCommand(msgCommand);
  teamCmd.addCommand(discordCommand);
  program.addCommand(teamCmd);
}

// src/cloud/register.ts
import { Command as Command27 } from "commander";

// src/cloud/commands/login.ts
import { Command as Command10 } from "commander";
import { exec } from "child_process";
import { platform } from "os";
import { createInterface } from "readline";

// src/commands/hook.ts
import fs5 from "fs";
import path7 from "path";
import { fileURLToPath } from "url";
import { Command as Command9 } from "commander";
import chalk6 from "chalk";
var GIT_HOOK_MARKER = "# vibe-focus:post-commit";
var BUNDLED_SCRIPT_NAME = "git-post-commit.mjs";
function getBundledGitHookPath() {
  const thisFile = fileURLToPath(import.meta.url);
  return path7.join(path7.dirname(thisFile), BUNDLED_SCRIPT_NAME);
}
function findGitDir(startDir) {
  let dir = startDir;
  while (dir !== path7.dirname(dir)) {
    const gitDir = path7.join(dir, ".git");
    if (fs5.existsSync(gitDir)) return gitDir;
    dir = path7.dirname(dir);
  }
  return null;
}
var hookCommand = new Command9("hook").description("Install/remove git hooks for auto-tracking").option("--install-git", "Install git post-commit hook").option("--remove-git", "Remove git post-commit hook").option("--status", "Check installed hooks").action((opts) => {
  if (opts.installGit) {
    installGitHook();
  } else if (opts.removeGit) {
    removeGitHook();
  } else {
    checkHookStatus();
  }
});
function installGitHook() {
  const cwd = process.cwd();
  const gitDir = findGitDir(cwd);
  if (!gitDir) {
    error("Not a git repository. Run this from inside a git project.");
    return false;
  }
  const hooksDir = path7.join(gitDir, "hooks");
  fs5.mkdirSync(hooksDir, { recursive: true });
  const vfDir = path7.join(cwd, ".vibe-focus");
  fs5.mkdirSync(vfDir, { recursive: true });
  const scriptDest = path7.join(vfDir, BUNDLED_SCRIPT_NAME);
  const bundledPath = getBundledGitHookPath();
  if (fs5.existsSync(bundledPath)) {
    fs5.copyFileSync(bundledPath, scriptDest);
    fs5.chmodSync(scriptDest, "755");
  } else {
    error(`Hook script not found at ${bundledPath}. Run "npm run build" first.`);
    return false;
  }
  const hookFile = path7.join(hooksDir, "post-commit");
  const invocation = `
${GIT_HOOK_MARKER}
node "${scriptDest}" &
`;
  if (fs5.existsSync(hookFile)) {
    const content = fs5.readFileSync(hookFile, "utf-8");
    if (content.includes(GIT_HOOK_MARKER)) {
      info("Git post-commit hook already installed.");
      return true;
    }
    fs5.appendFileSync(hookFile, invocation);
  } else {
    fs5.writeFileSync(hookFile, `#!/bin/sh
${invocation}`);
  }
  fs5.chmodSync(hookFile, "755");
  console.log("");
  console.log(chalk6.greenBright("  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"));
  console.log(chalk6.greenBright("  \u2551") + chalk6.bold.green("   GIT HOOK INSTALLED                  ") + chalk6.greenBright("\u2551"));
  console.log(chalk6.greenBright("  \u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"));
  console.log(chalk6.greenBright("  \u2551") + "                                           " + chalk6.greenBright("\u2551"));
  console.log(chalk6.greenBright("  \u2551") + chalk6.cyan("  Hook:   ") + chalk6.dim(".git/hooks/post-commit         ") + chalk6.greenBright("\u2551"));
  console.log(chalk6.greenBright("  \u2551") + chalk6.cyan("  Script: ") + chalk6.dim(".vibe-focus/git-post-commit.mjs") + chalk6.greenBright("\u2551"));
  console.log(chalk6.greenBright("  \u2551") + "                                           " + chalk6.greenBright("\u2551"));
  console.log(chalk6.greenBright("  \u2551") + chalk6.dim("  Every commit will auto-push activity  ") + chalk6.greenBright("\u2551"));
  console.log(chalk6.greenBright("  \u2551") + chalk6.dim("  and heartbeats to vibeteamz.          ") + chalk6.greenBright("\u2551"));
  console.log(chalk6.greenBright("  \u2551") + "                                           " + chalk6.greenBright("\u2551"));
  console.log(chalk6.greenBright("  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D"));
  console.log("");
  info("Remove with: vf hook --remove-git");
  return true;
}
function removeGitHook() {
  const cwd = process.cwd();
  const gitDir = findGitDir(cwd);
  if (!gitDir) {
    error("Not a git repository.");
    return;
  }
  const hookFile = path7.join(gitDir, "hooks", "post-commit");
  if (!fs5.existsSync(hookFile)) {
    info("No post-commit hook found.");
    return;
  }
  const content = fs5.readFileSync(hookFile, "utf-8");
  if (!content.includes(GIT_HOOK_MARKER)) {
    info("No vibe-focus hook found in post-commit.");
    return;
  }
  const lines = content.split("\n");
  const filtered = [];
  let skipNext = false;
  for (const line of lines) {
    if (line.includes(GIT_HOOK_MARKER)) {
      skipNext = true;
      continue;
    }
    if (skipNext) {
      skipNext = false;
      continue;
    }
    filtered.push(line);
  }
  const cleaned = filtered.join("\n").trim();
  if (cleaned === "#!/bin/sh" || cleaned === "") {
    fs5.unlinkSync(hookFile);
  } else {
    fs5.writeFileSync(hookFile, cleaned + "\n");
  }
  const scriptPath = path7.join(cwd, ".vibe-focus", BUNDLED_SCRIPT_NAME);
  if (fs5.existsSync(scriptPath)) {
    fs5.unlinkSync(scriptPath);
  }
  success("Git post-commit hook removed.");
}
function checkHookStatus() {
  const cwd = process.cwd();
  const gitDir = findGitDir(cwd);
  console.log("");
  console.log(chalk6.bold("Hook Status:"));
  console.log("");
  if (gitDir) {
    const hookFile = path7.join(gitDir, "hooks", "post-commit");
    const hasHook = fs5.existsSync(hookFile) && fs5.readFileSync(hookFile, "utf-8").includes(GIT_HOOK_MARKER);
    console.log(`  Git post-commit:  ${hasHook ? chalk6.green("installed") : chalk6.dim("not installed")}`);
  } else {
    console.log(`  Git post-commit:  ${chalk6.dim("no git repo")}`);
  }
  const claudeSettings = path7.join(cwd, ".claude", "settings.json");
  if (fs5.existsSync(claudeSettings)) {
    try {
      const settings = JSON.parse(fs5.readFileSync(claudeSettings, "utf-8"));
      const hasGuard = settings.hooks?.UserPromptSubmit?.some(
        (e) => e.hooks?.some((h) => h.command?.includes("vibe-focus-guard"))
      );
      const hasAutoTrack = settings.hooks?.PostToolUse?.some(
        (e) => e.hooks?.some((h) => h.command?.includes("vibe-focus-auto-track"))
      );
      console.log(`  Claude guard:     ${hasGuard ? chalk6.green("installed") : chalk6.dim("not installed")}`);
      console.log(`  Claude auto-track:${hasAutoTrack ? chalk6.green(" installed") : chalk6.dim(" not installed")}`);
    } catch {
      console.log(`  Claude hooks:     ${chalk6.dim("settings unreadable")}`);
    }
  } else {
    console.log(`  Claude hooks:     ${chalk6.dim("no .claude/settings.json")}`);
  }
  console.log("");
  info("Install git hook:    vf hook --install-git");
  info("Install Claude hook: vf guard --install --agent claude");
  console.log("");
}

// src/cloud/commands/login.ts
var LOGIN_TIMEOUT_MS = 1e4;
var DEVICE_POLL_INTERVAL_MS = 5e3;
var DEVICE_MAX_WAIT_MS = 10 * 60 * 1e3;
var MAX_CREDENTIAL_LENGTH = 256;
var MAX_KEY_LENGTH = 2048;
function openBrowser(url) {
  const cmd = platform() === "darwin" ? "open" : platform() === "win32" ? "start" : "xdg-open";
  exec(`${cmd} "${url}"`, () => {
  });
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function githubDeviceFlow(config) {
  info("Starting GitHub device flow...");
  const deviceUrl = `${config.apiUrl}/api/auth/device`;
  let deviceCode;
  let userCode;
  let verificationUri;
  try {
    const response = await fetch(deviceUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(LOGIN_TIMEOUT_MS)
    });
    if (!response.ok) {
      error(`Failed to start device flow (HTTP ${response.status}).`);
      return false;
    }
    const data = await response.json();
    deviceCode = data.device_code;
    userCode = data.user_code;
    verificationUri = data.verification_uri;
    if (!deviceCode || !userCode || !verificationUri) {
      error("Malformed device code response.");
      return false;
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      error("Request timed out. Check your network.");
    } else {
      error("Failed to connect to vibeteamz. Check your network.");
    }
    return false;
  }
  openBrowser(verificationUri);
  info(`Open ${verificationUri} and enter this code:`);
  console.log("");
  console.log(`  >>> ${userCode} <<<`);
  console.log("");
  const tokenUrl = `${config.apiUrl}/api/auth/device/token`;
  const startTime = Date.now();
  let pollCount = 0;
  while (Date.now() - startTime < DEVICE_MAX_WAIT_MS) {
    await sleep(DEVICE_POLL_INTERVAL_MS);
    pollCount++;
    try {
      const response = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_code: deviceCode }),
        signal: AbortSignal.timeout(LOGIN_TIMEOUT_MS)
      });
      if (response.status === 202) {
        process.stdout.write(".");
        if (pollCount % 4 === 0) {
          console.log(`  code: ${userCode}`);
        }
        continue;
      }
      if (response.status === 400) {
        const data = await response.json();
        if (data.error === "expired_token") {
          console.log("");
          error("Device code expired. Run the command again.");
          return false;
        }
      }
      if (response.status === 404) {
        console.log("");
        error("Device code not found. Run the command again.");
        return false;
      }
      if (response.ok) {
        const data = await response.json();
        if (typeof data.access_token === "string" && typeof data.user_id === "string") {
          console.log("");
          config.accessToken = data.access_token;
          config.refreshToken = data.refresh_token ?? null;
          config.userId = data.user_id;
          if (typeof data.supabase_url === "string" && data.supabase_url) {
            config.supabaseUrl = String(data.supabase_url).trim().replace(/\/+$/, "");
          }
          if (typeof data.supabase_anon_key === "string" && data.supabase_anon_key) {
            config.supabaseAnonKey = String(data.supabase_anon_key).trim();
          }
          try {
            writeCloudConfig(config);
          } catch (saveErr) {
            config.supabaseUrl = null;
            config.supabaseAnonKey = null;
            writeCloudConfig(config);
            warn(`Saved credentials (Supabase URL skipped: ${saveErr instanceof Error ? saveErr.message : "validation error"})`);
          }
          const displayName = typeof data.username === "string" && data.username ? data.username : data.user_id;
          success(`Logged in as ${displayName}`);
          await autoLinkProject(config);
          autoInstallHooks();
          return true;
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      process.stdout.write(`x[${msg}]`);
    }
  }
  console.log("");
  error("Timed out waiting for authentication. Run the command again.");
  return false;
}
async function emailPasswordFlow(config, email, password) {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    error("Supabase URL and anon key are required for email login.");
    info("Provide them with --supabase-url and --supabase-key on first login.");
    info("Or use --github to authenticate via browser instead.");
    return;
  }
  const authUrl = `${config.supabaseUrl}/auth/v1/token?grant_type=password`;
  try {
    const response = await fetch(authUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": config.supabaseAnonKey
      },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(LOGIN_TIMEOUT_MS)
    });
    if (!response.ok) {
      error(`Authentication failed (HTTP ${response.status}). Check your credentials.`);
      return;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      error("Unexpected response from auth server.");
      return;
    }
    const data = await response.json();
    if (typeof data.access_token !== "string" || typeof data.refresh_token !== "string" || typeof data.user !== "object" || data.user === null) {
      error("Malformed auth response. Supabase URL may be incorrect.");
      return;
    }
    const user = data.user;
    if (typeof user.id !== "string") {
      error("Auth response missing user ID.");
      return;
    }
    const authResult = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user: {
        id: user.id,
        email: typeof user.email === "string" ? user.email : void 0
      }
    };
    config.accessToken = authResult.access_token;
    config.refreshToken = authResult.refresh_token;
    config.userId = authResult.user.id;
    writeCloudConfig(config);
    success(`Logged in as ${authResult.user.email ?? authResult.user.id}`);
    await autoLinkProject(config);
    autoInstallHooks();
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      error("Login request timed out. Check your network and Supabase URL.");
    } else {
      error("Login failed. Check your network connection.");
    }
  }
}
async function promptChoice(count) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question("  Enter number: ", (answer) => {
      rl.close();
      const num = parseInt(answer.trim(), 10);
      if (isNaN(num) || num < 1 || num > count) {
        resolve(-1);
      } else {
        resolve(num - 1);
      }
    });
  });
}
async function autoLinkProject(config) {
  if (!config.accessToken) return false;
  let projects = [];
  try {
    const res = await fetch(`${config.apiUrl}/api/auth/me/projects`, {
      headers: { "Authorization": `Bearer ${config.accessToken}` },
      signal: AbortSignal.timeout(1e4)
    });
    if (res.ok) {
      const data = await res.json();
      projects = data.projects ?? [];
    }
  } catch {
    info('Could not fetch projects. Link manually with "vf cloud link <project-id>".');
    return false;
  }
  if (projects.length === 0) {
    info('No projects found. Join a project on vibeteamz.com, then run "vf cloud link <id>".');
    return false;
  }
  let chosen;
  if (projects.length === 1) {
    chosen = projects[0];
  } else {
    console.log("");
    info("You are a member of multiple projects:");
    console.log("");
    for (let i = 0; i < projects.length; i++) {
      const p = projects[i];
      const label2 = p.name ?? p.id;
      console.log(`  ${i + 1}. ${label2} (${p.role})`);
    }
    console.log("");
    const idx = await promptChoice(projects.length);
    if (idx < 0) {
      info('Skipped. Link manually with "vf cloud link <project-id>".');
      return false;
    }
    chosen = projects[idx];
  }
  let apiKey = config.projectId === chosen.id && config.apiKey ? config.apiKey : null;
  let projectName = chosen.name;
  if (!apiKey) {
    try {
      const res = await fetch(`${config.apiUrl}/api/auth/api-key`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.accessToken}`
        },
        body: JSON.stringify({ project_id: chosen.id, label: "cli-auto" }),
        signal: AbortSignal.timeout(1e4)
      });
      if (res.ok) {
        const data = await res.json();
        apiKey = data.api_key;
        if (data.project_name) projectName = data.project_name;
      }
    } catch {
    }
  }
  config.projectId = chosen.id;
  config.linkedAt = now();
  config.apiKey = apiKey;
  writeCloudConfig(config);
  const label = projectName ? `${projectName} (${chosen.id})` : chosen.id;
  success(`Linked to project ${label}`);
  if (apiKey) {
    info("API key generated. Heartbeats will use project-scoped auth.");
  }
  info("Heartbeats will now be sent with vf start, done, check, and team sync.");
  return true;
}
function autoInstallHooks() {
  try {
    readState();
    installGuard(resolveAgent());
  } catch {
  }
  try {
    installGitHook();
  } catch {
  }
}
var loginCommand = new Command10("login").description("Authenticate with vibeteamz via Supabase").option("--github", "Authenticate via GitHub in your browser (recommended)").option("--email <email>", "Your email address (for email/password login)").option("--password <password>", "Your password (for email/password login)").option("--supabase-url <url>", "Supabase project URL (HTTPS)").option("--supabase-key <key>", "Supabase anon key").option("--api-url <url>", "vibeteamz API URL (HTTPS)").action(async (opts) => {
  let config = readCloudConfig();
  if (opts.supabaseUrl) {
    const url = String(opts.supabaseUrl).replace(/\/+$/, "");
    if (!isValidHttpsUrl(url)) {
      error("--supabase-url must be a valid HTTPS URL.");
      return;
    }
    config.supabaseUrl = url;
  }
  if (opts.supabaseKey) {
    const key = String(opts.supabaseKey);
    if (key.length > MAX_KEY_LENGTH || !/^[A-Za-z0-9_.\-]+$/.test(key)) {
      error("Invalid Supabase anon key format.");
      return;
    }
    config.supabaseAnonKey = key;
  }
  if (opts.apiUrl) {
    const url = String(opts.apiUrl).replace(/\/+$/, "");
    if (!isValidHttpsUrl(url)) {
      error("--api-url must be a valid HTTPS URL.");
      return;
    }
    config.apiUrl = url;
  }
  if (opts.github) {
    await githubDeviceFlow(config);
    return;
  }
  if (opts.email && opts.password) {
    const email = String(opts.email).trim();
    const password = String(opts.password);
    if (email.length > MAX_CREDENTIAL_LENGTH || password.length > MAX_CREDENTIAL_LENGTH) {
      error("Credentials exceed maximum allowed length.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      error("Invalid email format.");
      return;
    }
    await emailPasswordFlow(config, email, password);
    return;
  }
  error("Specify an auth method:");
  info("  vf cloud login --github                    (recommended)");
  info("  vf cloud login --email you@email --password xxx");
});

// src/cloud/commands/link.ts
import { Command as Command11 } from "commander";
var linkCommand = new Command11("link").description("Link this project to a vibeteamz project").argument("<project-id>", "vibeteamz project UUID").action(async (projectId) => {
  const id = String(projectId).trim().toLowerCase();
  if (!isValidUUID(id)) {
    error("Invalid project ID. Must be a valid UUID v4.");
    info("Find your project ID on the vibeteamz dashboard.");
    return;
  }
  const config = readCloudConfig();
  if (!config.accessToken || !config.userId) {
    error('Not logged in. Run "vf cloud login" first.');
    return;
  }
  let apiKey = null;
  let projectName = null;
  try {
    const res = await fetch(`${config.apiUrl}/api/auth/api-key`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.accessToken}`
      },
      body: JSON.stringify({ project_id: id }),
      signal: AbortSignal.timeout(1e4)
    });
    if (res.ok) {
      const data = await res.json();
      apiKey = data.api_key;
      projectName = data.project_name;
      info(`API key generated (${data.key_prefix}\u2026). Heartbeats will use project-scoped auth.`);
    } else {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      error(`Failed to generate API key: ${body.error}`);
      info("Falling back to session token for heartbeats.");
    }
  } catch {
    info("Could not reach server for API key. Falling back to session token.");
  }
  config.projectId = id;
  config.linkedAt = now();
  config.apiKey = apiKey;
  writeCloudConfig(config);
  const label = projectName ? `${projectName} (${id})` : id;
  success(`Linked to project ${label}`);
  info("Heartbeats will now be sent with vf start, done, check, and team sync.");
});

// src/cloud/commands/unlink.ts
import { Command as Command12 } from "commander";
var unlinkCommand = new Command12("unlink").description("Remove the vibeteamz project link (stops heartbeats)").action(() => {
  const config = readCloudConfig();
  if (!config.projectId) {
    info("No project linked.");
    return;
  }
  config.projectId = null;
  config.linkedAt = null;
  config.apiKey = null;
  writeCloudConfig(config);
  success("Project unlinked. Heartbeats will no longer be sent.");
});

// src/cloud/commands/status.ts
import { Command as Command13 } from "commander";
import chalk7 from "chalk";
var statusCommand2 = new Command13("status").description("Show cloud connection status").option("--ping", "Send a test heartbeat to verify connectivity").action(async (opts) => {
  let config;
  try {
    config = readCloudConfig();
  } catch (e) {
    error('Cloud config is corrupted. Re-run "vf cloud login".');
    return;
  }
  console.log(chalk7.bold("Cloud Status"));
  console.log("");
  console.log(`  API URL:      ${config.apiUrl}`);
  console.log(`  Supabase:     ${config.supabaseUrl ?? chalk7.dim("not set")}`);
  console.log(`  Logged in:    ${config.userId ? chalk7.green("yes") : chalk7.red("no")}`);
  console.log(`  Project:      ${config.projectId ?? chalk7.dim("not linked")}`);
  if (config.linkedAt) {
    console.log(`  Linked at:    ${config.linkedAt}`);
  }
  if (opts.ping) {
    console.log("");
    if (!(config.accessToken || config.apiKey) || !config.userId || !config.projectId) {
      error("Cannot ping: not fully configured (need login + link).");
      return;
    }
    const payload = buildHeartbeatPayload();
    if (!payload) {
      error("Could not build heartbeat payload.");
      return;
    }
    info("Sending test heartbeat...");
    try {
      const result = await sendHeartbeat(payload);
      if (result.ok) {
        success("Heartbeat received by vibeteamz!");
      } else {
        error(`Heartbeat failed: ${result.error ?? "unknown error"}`);
      }
    } catch {
      error("Heartbeat request failed. Check your network.");
    }
  }
});

// src/cloud/commands/team.ts
import { Command as Command14 } from "commander";
import chalk8 from "chalk";
var g2 = chalk8.green;
var gB2 = chalk8.greenBright;
var y2 = chalk8.yellow;
var r2 = chalk8.red;
var d2 = chalk8.dim;
function presenceIcon(status) {
  switch (status) {
    case "active":
      return gB2("\u25CF");
    case "idle":
      return y2("\u25D0");
    case "away":
      return r2("\u25CB");
  }
}
function presenceColor(status) {
  switch (status) {
    case "active":
      return gB2;
    case "idle":
      return y2;
    case "away":
      return r2;
  }
}
function classifyPresence(lastHeartbeat) {
  const ageMs = Date.now() - new Date(lastHeartbeat).getTime();
  const minutes = ageMs / 6e4;
  if (minutes < 5) return "active";
  if (minutes < 15) return "idle";
  if (minutes < 60) return "away";
  return "offline";
}
function formatAge3(lastHeartbeat) {
  const ageMs = Date.now() - new Date(lastHeartbeat).getTime();
  const minutes = Math.floor(ageMs / 6e4);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
var teamCommand = new Command14("team").description("Show who is online in your vibeteamz project").action(async () => {
  let config;
  try {
    config = readCloudConfig();
  } catch {
    error('Cloud config is corrupted. Re-run "vf cloud login".');
    return;
  }
  if (!(config.accessToken || config.apiKey) || !config.userId || !config.projectId) {
    error('Cloud not configured. Run "vf vibeteamz login" then "vf vibeteamz link <id>".');
    return;
  }
  if (!isValidUUID(config.projectId)) {
    error("Invalid project ID in cloud config.");
    return;
  }
  const result = await supabaseQuery(
    "presence",
    `project_id=eq.${config.projectId}&select=user_id,task_id,task_title,progress_met,progress_total,focus_score,status,last_heartbeat,profiles(username,display_name)`
  );
  if (!result.success) {
    error(`Failed to fetch team data: ${result.error}`);
    return;
  }
  const online = [];
  for (const row of result.data) {
    const status = classifyPresence(row.last_heartbeat);
    if (status !== "offline") {
      online.push({ ...row, presence: status });
    }
  }
  const order = { active: 0, idle: 1, away: 2 };
  online.sort((a, b3) => order[a.presence] - order[b3.presence]);
  console.log("");
  if (online.length === 0) {
    console.log(d2("  No teammates online."));
    console.log("");
    info('Use "vf cloud pull" for the full project dashboard.');
    return;
  }
  console.log(gB2("  ONLINE") + d2(" (vibeteamz)"));
  for (const row of online) {
    const username = row.profiles?.username ?? row.user_id.slice(0, 8);
    const icon = presenceIcon(row.presence);
    const color = presenceColor(row.presence);
    const nameStr = color(username.padEnd(12));
    const statusStr = color(row.presence.padEnd(8));
    const taskStr = row.task_id ? (chalk8.bold(row.task_id) + ": " + (row.task_title ?? "").slice(0, 20)).padEnd(28) : d2("\u2014".padEnd(28));
    const pctStr = row.progress_total > 0 ? `${Math.round(row.progress_met / row.progress_total * 100)}%`.padEnd(6) : d2("\u2014".padEnd(6));
    const ageStr = formatAge3(row.last_heartbeat);
    console.log(`  ${icon} ${nameStr}${statusStr}${taskStr}${pctStr}${d2(ageStr)}`);
  }
  const counts = { active: 0, idle: 0, away: 0 };
  for (const row of online) counts[row.presence]++;
  const parts = [];
  if (counts.active > 0) parts.push(`${counts.active} ${g2("active")}`);
  if (counts.idle > 0) parts.push(`${counts.idle} ${y2("idle")}`);
  if (counts.away > 0) parts.push(`${counts.away} ${r2("away")}`);
  console.log("");
  console.log(`  ${parts.join(", ")}`);
  const cache = readCloudCache();
  const suggestions = cache?.suggestions;
  if (suggestions && suggestions.length > 0) {
    console.log("");
    console.log(d2("  SUGGESTIONS"));
    for (const s of suggestions) {
      const icon = s.urgency === "high" ? r2("\u25CF") : s.urgency === "medium" ? y2("\u25CF") : g2("\u25CF");
      console.log(`  ${icon} ${s.message}`);
    }
  }
  console.log("");
});

// src/cloud/commands/pull.ts
import { Command as Command15 } from "commander";
import chalk9 from "chalk";
async function apiFetch(baseUrl, path8, token) {
  try {
    const res = await fetch(`${baseUrl}${path8}`, {
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      signal: AbortSignal.timeout(8e3)
    });
    if (!res.ok) return { success: false };
    const data = await res.json();
    return { success: true, data };
  } catch {
    return { success: false };
  }
}
var g3 = chalk9.green;
var gB3 = chalk9.greenBright;
var gD2 = chalk9.dim.green;
var c2 = chalk9.cyan;
var cB2 = chalk9.cyanBright;
var y3 = chalk9.yellow;
var r3 = chalk9.red;
var d3 = chalk9.dim;
var b2 = chalk9.bold;
function classifyPresence2(lastHeartbeat) {
  const ageMs = Date.now() - new Date(lastHeartbeat).getTime();
  const minutes = ageMs / 6e4;
  if (minutes < 5) return "active";
  if (minutes < 15) return "idle";
  if (minutes < 60) return "away";
  return "offline";
}
function presenceIcon2(status) {
  switch (status) {
    case "active":
      return gB3("\u25CF");
    case "idle":
      return y3("\u25D0");
    case "away":
      return r3("\u25CB");
  }
}
function presenceColor2(status) {
  switch (status) {
    case "active":
      return gB3;
    case "idle":
      return y3;
    case "away":
      return r3;
  }
}
function formatAge4(isoStr) {
  const ageMs = Date.now() - new Date(isoStr).getTime();
  const minutes = Math.floor(ageMs / 6e4);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
function hLine2(char, width) {
  return char.repeat(width);
}
function boxTop2(w) {
  return gD2("\u2554" + hLine2("\u2550", w - 2) + "\u2557");
}
function boxBot2(w) {
  return gD2("\u255A" + hLine2("\u2550", w - 2) + "\u255D");
}
function boxRow2(content, w) {
  const visible = content.replace(/\x1b\[[0-9;]*m/g, "");
  const pad = Math.max(0, w - 4 - visible.length);
  return gD2("\u2551") + " " + content + " ".repeat(pad) + " " + gD2("\u2551");
}
function boxEmpty2(w) {
  return gD2("\u2551") + " ".repeat(w - 2) + gD2("\u2551");
}
function sectionHeader2(label, w) {
  const remaining = w - 6 - label.length - 4;
  return gD2("\u2560\u2500\u2500") + " " + gB3(label) + " " + gD2(hLine2("\u2500", Math.max(1, remaining)) + "\u2563");
}
var pullCommand = new Command15("pull").description("Show full project dashboard from vibeteamz").option("--json", "Output as JSON").action(async (opts) => {
  let config;
  try {
    config = readCloudConfig();
  } catch {
    error('Cloud config is corrupted. Re-run "vf cloud login".');
    return;
  }
  if (!(config.accessToken || config.apiKey) || !config.userId || !config.projectId) {
    error('Cloud not configured. Run "vf vibeteamz login" then "vf vibeteamz link <id>".');
    return;
  }
  if (!isValidUUID(config.projectId)) {
    error("Invalid project ID in cloud config.");
    return;
  }
  const pid = config.projectId;
  const token = config.apiKey ?? config.accessToken ?? "";
  const baseUrl = config.apiUrl;
  const [membersResult, presenceResult, activityResult, sessionsResult, tasksApiResult, msApiResult] = await Promise.all([
    supabaseQuery(
      "members",
      `project_id=eq.${pid}&select=user_id,role,joined_at,profiles(username,display_name,availability,score,streak_days)&order=joined_at.asc`
    ),
    supabaseQuery(
      "presence",
      `project_id=eq.${pid}&select=user_id,task_id,task_title,progress_met,progress_total,focus_score,status,last_heartbeat,profiles(username,display_name)`
    ),
    supabaseQuery(
      "activity",
      `project_id=eq.${pid}&select=id,type,message,created_at,profiles(username)&order=created_at.desc&limit=10`
    ),
    supabaseQuery(
      "sessions",
      `project_id=eq.${pid}&select=id,started_by,started_at,ended_at,participants&order=started_at.desc&limit=5`
    ),
    apiFetch(baseUrl, `/api/projects/${pid}/tasks`, token),
    apiFetch(baseUrl, `/api/projects/${pid}/milestones`, token)
  ]);
  const tasksResult = tasksApiResult.success ? { success: true, data: tasksApiResult.data } : { success: false, data: [] };
  const milestonesResult = msApiResult.success ? { success: true, data: Array.isArray(msApiResult.data) ? msApiResult.data : msApiResult.data.milestones ?? [] } : { success: false, data: [] };
  if (opts.json) {
    console.log(JSON.stringify({
      members: membersResult.success ? membersResult.data : [],
      presence: presenceResult.success ? presenceResult.data : [],
      activity: activityResult.success ? activityResult.data : [],
      sessions: sessionsResult.success ? sessionsResult.data : [],
      tasks: tasksResult.success ? tasksResult.data : [],
      milestones: milestonesResult.success ? milestonesResult.data : []
    }, null, 2));
    return;
  }
  const W = 68;
  const lines = [];
  lines.push("");
  lines.push(boxTop2(W));
  lines.push(boxRow2(
    gB3("CLOUD") + d3("://") + c2("vibeteamz") + d3(" > ") + cB2("PROJECT DASHBOARD"),
    W
  ));
  lines.push(sectionHeader2("TEAM MEMBERS", W));
  lines.push(boxEmpty2(W));
  if (membersResult.success && membersResult.data.length > 0) {
    for (const m of membersResult.data) {
      const username = m.profiles?.username ?? m.user_id.slice(0, 8);
      const role = d3(m.role.padEnd(8));
      const avail = m.profiles?.availability ?? "unknown";
      const availColor = avail === "available" ? g3 : avail === "busy" ? y3 : d3;
      const availStr = availColor(avail.padEnd(14));
      const score = String(m.profiles?.score ?? 0).padEnd(7);
      const streak = m.profiles?.streak_days ? `${m.profiles.streak_days}d streak` : "";
      lines.push(boxRow2(
        "   " + gB3("\u25CF") + " " + cB2(username.padEnd(12)) + role + availStr + score + d3(streak),
        W
      ));
    }
  } else {
    lines.push(boxRow2(d3("   No members found."), W));
  }
  lines.push(sectionHeader2("ONLINE NOW", W));
  lines.push(boxEmpty2(W));
  if (presenceResult.success && presenceResult.data.length > 0) {
    const onlineRows = [];
    for (const p of presenceResult.data) {
      const status = classifyPresence2(p.last_heartbeat);
      if (status !== "offline") {
        onlineRows.push({ ...p, ps: status });
      }
    }
    if (onlineRows.length > 0) {
      const order = { active: 0, idle: 1, away: 2 };
      onlineRows.sort((a, b3) => order[a.ps] - order[b3.ps]);
      for (const row of onlineRows) {
        const username = row.profiles?.username ?? row.user_id.slice(0, 8);
        const icon = presenceIcon2(row.ps);
        const color = presenceColor2(row.ps);
        const nameStr = color(username.padEnd(12));
        const statusStr = color(row.ps.padEnd(8));
        const taskStr = row.task_id ? (b2(row.task_id) + ": " + (row.task_title ?? "").slice(0, 16)).padEnd(24) : d3("\u2014".padEnd(24));
        const pctStr = row.progress_total > 0 ? `${Math.round(row.progress_met / row.progress_total * 100)}%`.padEnd(6) : d3("\u2014".padEnd(6));
        const ageStr = formatAge4(row.last_heartbeat);
        lines.push(boxRow2(
          "   " + icon + " " + nameStr + statusStr + taskStr + pctStr + d3(ageStr),
          W
        ));
      }
    } else {
      lines.push(boxRow2(d3("   No teammates online."), W));
    }
  } else {
    lines.push(boxRow2(d3("   No presence data."), W));
  }
  lines.push(sectionHeader2("TASKS", W));
  lines.push(boxEmpty2(W));
  if (tasksResult.success && tasksResult.data.length > 0) {
    const allTasks = tasksResult.data;
    const milestones = milestonesResult.success ? milestonesResult.data : [];
    const msMap = /* @__PURE__ */ new Map();
    for (const ms of milestones) msMap.set(ms.id, ms);
    const byMilestone = /* @__PURE__ */ new Map();
    for (const t of allTasks) {
      const key = t.milestone_id;
      if (!byMilestone.has(key)) byMilestone.set(key, []);
      byMilestone.get(key).push(t);
    }
    const msKeys = [...byMilestone.keys()].sort((a, b3) => {
      if (a === null) return 1;
      if (b3 === null) return -1;
      return 0;
    });
    for (const msId of msKeys) {
      const groupTasks = byMilestone.get(msId);
      const doneCount = groupTasks.filter((t) => t.status === "done").length;
      const total = groupTasks.length;
      const pct = total > 0 ? Math.round(doneCount / total * 100) : 0;
      const msTitle = msId ? msMap.get(msId)?.title ?? msId.slice(0, 8) : "Backlog";
      const msIcon = msId ? y3("\u25C9") : d3("\u2261");
      const progressWidth = 16;
      const filled = total > 0 ? Math.round(doneCount / total * progressWidth) : 0;
      const bar = y3("\u2588".repeat(filled)) + d3("\u2591".repeat(progressWidth - filled));
      const statsStr = d3(`${doneCount}/${total}`) + " " + (pct > 0 ? y3(`${pct}%`) : d3("0%"));
      lines.push(boxRow2(
        "   " + msIcon + " " + b2(msTitle.padEnd(24)) + bar + " " + statsStr,
        W
      ));
      const openTasks = groupTasks.filter((t) => t.status !== "done");
      for (const t of openTasks) {
        const icon = t.status === "in_progress" ? c2("\u25D0") : chalk9.white("\u25CB");
        const title = t.title.length > 36 ? t.title.slice(0, 33) + "..." : t.title;
        const owner = t.assigned_to === config.userId ? d3("@you") : t.assigned_to ? d3(t.assigned_to.slice(0, 8)) : d3("");
        lines.push(boxRow2(
          "      " + icon + " " + title.padEnd(38) + owner,
          W
        ));
      }
      lines.push(boxEmpty2(W));
    }
    const totalAll = allTasks.length;
    const totalDone = allTasks.filter((t) => t.status === "done").length;
    const totalActive = allTasks.filter((t) => t.status === "in_progress").length;
    const parts = [];
    parts.push(`${totalDone}/${totalAll} done`);
    if (totalActive > 0) parts.push(c2(`${totalActive} active`));
    if (milestones.length > 0) parts.push(`${milestones.length} milestone${milestones.length > 1 ? "s" : ""}`);
    lines.push(boxRow2(d3("   " + parts.join(" \xB7 ")), W));
  } else {
    lines.push(boxRow2(d3("   No tasks."), W));
  }
  lines.push(sectionHeader2("RECENT ACTIVITY", W));
  lines.push(boxEmpty2(W));
  if (activityResult.success && activityResult.data.length > 0) {
    for (const a of activityResult.data.slice(0, 8)) {
      const username = a.profiles?.username ?? "???";
      const msg = a.message ?? a.type;
      const age = formatAge4(a.created_at);
      const msgTrimmed = msg.length > 38 ? msg.slice(0, 35) + "..." : msg;
      lines.push(boxRow2(
        "   " + cB2(username.padEnd(8)) + d3(msgTrimmed.padEnd(40)) + d3(age),
        W
      ));
    }
  } else {
    lines.push(boxRow2(d3("   No recent activity."), W));
  }
  if (sessionsResult.success && sessionsResult.data.length > 0) {
    const activeSessions = sessionsResult.data.filter((s) => !s.ended_at);
    if (activeSessions.length > 0) {
      lines.push(sectionHeader2("ACTIVE SESSIONS", W));
      lines.push(boxEmpty2(W));
      for (const s of activeSessions) {
        const started = formatAge4(s.started_at);
        const participants = Array.isArray(s.participants) ? s.participants.length : 0;
        lines.push(boxRow2(
          "   " + g3("\u25B6") + d3(` Started ${started}`) + d3(` \xB7 ${participants} participant${participants !== 1 ? "s" : ""}`),
          W
        ));
      }
    }
  }
  lines.push(boxEmpty2(W));
  lines.push(boxBot2(W));
  lines.push("");
  console.log(lines.join("\n"));
});

// src/cloud/commands/push.ts
import { Command as Command16 } from "commander";
var pushCommand = new Command16("push").description("Post a message to your vibeteamz project team chat").argument("<message>", "Message to post").action(async (message) => {
  let config;
  try {
    config = readCloudConfig();
  } catch {
    error('Cloud config is corrupted. Re-run "vf cloud login".');
    return;
  }
  if (!(config.accessToken || config.apiKey) || !config.userId || !config.projectId) {
    error('Cloud not configured. Run "vf vibeteamz login" then "vf vibeteamz link <id>".');
    return;
  }
  if (!isValidUUID(config.projectId) || !isValidUUID(config.userId)) {
    error("Invalid IDs in cloud config.");
    return;
  }
  try {
    const res = await fetch(`${config.apiUrl}/api/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey ?? config.accessToken}`
      },
      body: JSON.stringify({
        project_id: config.projectId,
        user_id: config.userId,
        body: message
      }),
      signal: AbortSignal.timeout(1e4)
    });
    if (res.ok) {
      success("Message posted to team chat.");
    } else {
      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      error(`Failed to post message: ${data.error ?? `HTTP ${res.status}`}`);
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      error("Request timed out. Check your network.");
    } else {
      error("Failed to connect to vibeteamz. Check your network.");
    }
  }
});

// src/cloud/commands/msg.ts
import { Command as Command17 } from "commander";
var msgCommand2 = new Command17("msg").description("Send a message to your project team chat").argument("<message>", "Message to send").option("--to <usernames...>", "Mention users (auto-adds @ prefix)").option("--reply <message-id>", "Reply to a message").action(async (message, opts) => {
  let config;
  try {
    config = readCloudConfig();
  } catch {
    error('Cloud config is corrupted. Re-run "vf vibeteamz login".');
    return;
  }
  if (!(config.accessToken || config.apiKey) || !config.userId || !config.projectId) {
    error('Cloud not configured. Run "vf vibeteamz login" then "vf vibeteamz link <id>".');
    return;
  }
  if (!isValidUUID(config.projectId) || !isValidUUID(config.userId)) {
    error("Invalid IDs in cloud config.");
    return;
  }
  let finalMessage = message;
  if (opts.to?.length) {
    const mentionPrefix = opts.to.map((u) => `@${u.replace(/^@/, "")}`).join(" ");
    finalMessage = `${mentionPrefix} ${message}`;
  }
  try {
    const token = config.apiKey ?? config.accessToken;
    const res = await fetch(`${config.apiUrl}/api/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        project_id: config.projectId,
        user_id: config.userId,
        body: finalMessage,
        reply_to: opts.reply || null
      }),
      signal: AbortSignal.timeout(1e4)
    });
    if (res.ok) {
      success("Message sent to team chat.");
    } else {
      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      error(`Failed to send message: ${data.error ?? `HTTP ${res.status}`}`);
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      error("Request timed out. Check your network.");
    } else {
      error("Failed to connect to vibeteamz. Check your network.");
    }
  }
});

// src/cloud/commands/milestone.ts
import { Command as Command18 } from "commander";
var milestoneCommand = new Command18("milestone").description("Create a milestone in your project").argument("<title>", "Milestone title").option("--description <text>", "Milestone description").option("--due <date>", "Due date (YYYY-MM-DD)").action(async (title, opts) => {
  let config;
  try {
    config = readCloudConfig();
  } catch {
    error('Cloud config is corrupted. Re-run "vf vibeteamz login".');
    return;
  }
  if (!(config.accessToken || config.apiKey) || !config.userId || !config.projectId) {
    error('Cloud not configured. Run "vf vibeteamz login" then "vf vibeteamz link <id>".');
    return;
  }
  if (!isValidUUID(config.projectId) || !isValidUUID(config.userId)) {
    error("Invalid IDs in cloud config.");
    return;
  }
  try {
    const res = await fetch(`${config.apiUrl}/api/projects/${config.projectId}/milestones`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey ?? config.accessToken}`
      },
      body: JSON.stringify({
        title,
        description: opts.description || null,
        due_date: opts.due || null
      }),
      signal: AbortSignal.timeout(1e4)
    });
    if (res.ok) {
      const data = await res.json();
      success(`Milestone created: "${data.title}"`);
    } else {
      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      error(`Failed to create milestone: ${data.error ?? `HTTP ${res.status}`}`);
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      error("Request timed out. Check your network.");
    } else {
      error("Failed to connect to vibeteamz. Check your network.");
    }
  }
});

// src/cloud/commands/milestones.ts
import { Command as Command19 } from "commander";
import chalk10 from "chalk";
function progressBar(pct, width = 20) {
  const filled = Math.round(pct / 100 * width);
  const empty = width - filled;
  const color = pct >= 100 ? chalk10.greenBright : pct >= 50 ? chalk10.yellow : chalk10.red;
  return color("\u2593".repeat(filled)) + chalk10.dim("\u2591".repeat(empty));
}
var milestonesCommand = new Command19("milestones").description("List milestones with progress").action(async () => {
  let config;
  try {
    config = readCloudConfig();
  } catch {
    error('Cloud config is corrupted. Re-run "vf vibeteamz login".');
    return;
  }
  if (!(config.accessToken || config.apiKey) || !config.userId || !config.projectId) {
    error('Cloud not configured. Run "vf vibeteamz login" then "vf vibeteamz link <id>".');
    return;
  }
  if (!isValidUUID(config.projectId)) {
    error("Invalid project ID in cloud config.");
    return;
  }
  const token = config.apiKey ?? config.accessToken;
  try {
    const res = await fetch(`${config.apiUrl}/api/projects/${config.projectId}/milestones`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${token}` },
      signal: AbortSignal.timeout(1e4)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      error(`Failed to fetch milestones: ${data.error ?? `HTTP ${res.status}`}`);
      return;
    }
    const { milestones } = await res.json();
    if (milestones.length === 0) {
      console.log(chalk10.dim('  No milestones yet. Create one: vf vibeteamz milestone "Title"'));
      return;
    }
    console.log("");
    for (const ms of milestones) {
      const total = ms.tasks.length;
      const done = ms.tasks.filter((t) => t.status === "done").length;
      const pct = total > 0 ? Math.round(done / total * 100) : 0;
      const statusIcon2 = ms.status === "completed" ? chalk10.green("\u2713") : ms.status === "in_progress" ? chalk10.cyan("\u25B6") : chalk10.dim("\u25CB");
      const dueStr = ms.due_date ? chalk10.dim(` due ${ms.due_date}`) : "";
      console.log(`  ${statusIcon2} ${chalk10.bold(ms.title)}${dueStr}`);
      console.log(`    ${progressBar(pct)} ${pct}%  ${chalk10.dim(`${done}/${total} tasks`)}  ${chalk10.dim(ms.id.slice(0, 8))}`);
      console.log("");
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      error("Request timed out. Check your network.");
    } else {
      error("Failed to connect to vibeteamz.");
    }
  }
});

// src/cloud/commands/note.ts
import { Command as Command20 } from "commander";
var noteCommand = new Command20("note").description("Post a note to project activity feed").argument("<text>", "Note text").action(async (text) => {
  let config;
  try {
    config = readCloudConfig();
  } catch {
    error('Cloud config is corrupted. Re-run "vf vibeteamz login".');
    return;
  }
  if (!(config.accessToken || config.apiKey) || !config.userId || !config.projectId) {
    error('Cloud not configured. Run "vf vibeteamz login" then "vf vibeteamz link <id>".');
    return;
  }
  if (!isValidUUID(config.projectId) || !isValidUUID(config.userId)) {
    error("Invalid IDs in cloud config.");
    return;
  }
  try {
    const res = await fetch(`${config.apiUrl}/api/activity/push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey ?? config.accessToken}`
      },
      body: JSON.stringify({
        project_id: config.projectId,
        type: "note",
        message: text
      }),
      signal: AbortSignal.timeout(1e4)
    });
    if (res.ok) {
      success("Note posted to activity feed.");
    } else {
      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      error(`Failed to post note: ${data.error ?? `HTTP ${res.status}`}`);
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      error("Request timed out. Check your network.");
    } else {
      error("Failed to connect to vibeteamz. Check your network.");
    }
  }
});

// src/cloud/commands/tasks.ts
import { Command as Command21 } from "commander";
import chalk11 from "chalk";
var g4 = chalk11.green;
var gB4 = chalk11.greenBright;
var d4 = chalk11.dim;
function statusIcon(status) {
  switch (status) {
    case "todo":
      return chalk11.white("\u25CB");
    case "in_progress":
      return chalk11.cyan("\u25D0");
    case "done":
      return gB4("\u25CF");
    default:
      return d4("\xB7");
  }
}
function statusLabel(status) {
  switch (status) {
    case "todo":
      return chalk11.white("todo");
    case "in_progress":
      return chalk11.cyan("active");
    case "done":
      return gB4("done");
    default:
      return d4(status);
  }
}
function getAuthToken(config) {
  return config.apiKey ?? config.accessToken;
}
async function apiFetch2(config, path8, opts) {
  const token = getAuthToken(config);
  return fetch(`${config.apiUrl}${path8}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      ...opts?.headers ?? {}
    },
    signal: AbortSignal.timeout(1e4)
  });
}
var tasksCommand = new Command21("tasks").description("List project tasks").option("--mine", "Only show tasks assigned to you").option("--all", "Include completed tasks").action(async (opts) => {
  let config;
  try {
    config = readCloudConfig();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    error(`Cloud config error: ${msg}`);
    return;
  }
  if (!(config.accessToken || config.apiKey) || !config.userId || !config.projectId) {
    error('Cloud not configured. Run "vf vibeteamz login" then "vf vibeteamz link <id>".');
    return;
  }
  if (!isValidUUID(config.projectId)) {
    error("Invalid project ID in cloud config.");
    return;
  }
  try {
    const [tasksRes, msRes] = await Promise.all([
      apiFetch2(config, `/api/projects/${config.projectId}/tasks`),
      apiFetch2(config, `/api/projects/${config.projectId}/milestones`)
    ]);
    if (!tasksRes.ok) {
      const data = await tasksRes.json().catch(() => ({}));
      error(`Failed to fetch tasks: ${data.error ?? `HTTP ${tasksRes.status}`}`);
      return;
    }
    const tasks = await tasksRes.json();
    let milestones = [];
    if (msRes.ok) {
      const msBody = await msRes.json();
      milestones = Array.isArray(msBody) ? msBody : msBody.milestones ?? [];
    }
    const msMap = /* @__PURE__ */ new Map();
    for (const ms of milestones) msMap.set(ms.id, ms);
    let filtered = tasks;
    if (opts.mine) {
      filtered = filtered.filter((t) => t.assigned_to === config.userId);
    }
    if (!opts.all) {
      filtered = filtered.filter((t) => t.status !== "done");
    }
    console.log("");
    if (filtered.length === 0) {
      console.log(d4("  No tasks found."));
      if (opts.mine) info("Try without --mine to see all project tasks.");
      console.log("");
      return;
    }
    const byMilestone = /* @__PURE__ */ new Map();
    for (const t of filtered) {
      const key = t.milestone_id;
      if (!byMilestone.has(key)) byMilestone.set(key, []);
      byMilestone.get(key).push(t);
    }
    const msKeys = [...byMilestone.keys()].sort((a, b3) => {
      if (a === null) return 1;
      if (b3 === null) return -1;
      return 0;
    });
    for (const msId of msKeys) {
      const msTitle = msId ? msMap.get(msId)?.title ?? msId.slice(0, 8) : "Backlog";
      const groupTasks = byMilestone.get(msId);
      const done = groupTasks.filter((t) => t.status === "done").length;
      const total = groupTasks.length;
      console.log(chalk11.bold(`  ${msTitle}`) + d4(` (${done}/${total})`));
      for (const t of groupTasks) {
        const icon = statusIcon(t.status);
        const label = statusLabel(t.status).padEnd(16);
        const title = t.title.slice(0, 40).padEnd(42);
        const assignee = t.assignee?.username ? d4(`@${t.assignee.username}`) : t.assigned_to === config.userId ? d4("@you") : d4("unassigned");
        const idStr = d4(t.id.slice(0, 8));
        console.log(`    ${icon} ${label}${title}${assignee}  ${idStr}`);
      }
      console.log("");
    }
    const todoCount = filtered.filter((t) => t.status === "todo").length;
    const activeCount = filtered.filter((t) => t.status === "in_progress").length;
    const doneCount = filtered.filter((t) => t.status === "done").length;
    const parts = [];
    if (todoCount > 0) parts.push(`${todoCount} todo`);
    if (activeCount > 0) parts.push(`${activeCount} ${chalk11.cyan("active")}`);
    if (doneCount > 0) parts.push(`${doneCount} ${g4("done")}`);
    console.log(`  ${parts.join(", ")}`);
    console.log("");
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      error("Request timed out. Check your network.");
    } else {
      const msg = e instanceof Error ? e.message : String(e);
      error(`Failed to connect to vibeteamz: ${msg}`);
    }
  }
});
async function resolveTaskId(config, shortId) {
  if (shortId.length >= 36) return shortId;
  try {
    const res = await apiFetch2(config, `/api/projects/${config.projectId}/tasks`);
    if (!res.ok) return null;
    const tasks = await res.json();
    const match = tasks.find((t) => t.id.startsWith(shortId));
    if (!match) {
      error(`No task found starting with "${shortId}". Run "vf vibeteamz tasks" to see IDs.`);
      return null;
    }
    return match.id;
  } catch {
    return null;
  }
}
async function resolveMilestoneId(config, shortId) {
  if (shortId.length >= 36) return shortId;
  try {
    const res = await apiFetch2(config, `/api/projects/${config.projectId}/milestones`);
    if (!res.ok) return null;
    const body = await res.json();
    const milestones = Array.isArray(body) ? body : body.milestones ?? [];
    const match = milestones.find((m) => m.id.startsWith(shortId));
    if (!match) {
      error(`No milestone found starting with "${shortId}". Run "vf vibeteamz milestones" to see IDs.`);
      return null;
    }
    return match.id;
  } catch {
    return null;
  }
}
var taskCommand = new Command21("task").description("Manage a specific task (claim, start, done, create)");
taskCommand.command("claim <id>").description("Assign a task to yourself").action(async (taskId) => {
  let config;
  try {
    config = readCloudConfig();
  } catch {
    error("Cloud config is corrupted.");
    return;
  }
  if (!(config.accessToken || config.apiKey) || !config.userId || !config.projectId) {
    error("Cloud not configured.");
    return;
  }
  const fullId = await resolveTaskId(config, taskId);
  if (!fullId) return;
  try {
    const res = await apiFetch2(config, `/api/tasks/${fullId}`, {
      method: "PATCH",
      body: JSON.stringify({ assigned_to: config.userId })
    });
    if (res.ok) {
      const data = await res.json();
      success(`Claimed: "${data.title}"`);
    } else {
      const data = await res.json().catch(() => ({}));
      error(`Failed to claim task: ${data.error ?? `HTTP ${res.status}`}`);
    }
  } catch {
    error("Failed to connect to vibeteamz.");
  }
});
taskCommand.command("start <id>").description("Start a task (set to in_progress and claim)").action(async (taskId) => {
  let config;
  try {
    config = readCloudConfig();
  } catch {
    error("Cloud config is corrupted.");
    return;
  }
  if (!(config.accessToken || config.apiKey) || !config.userId || !config.projectId) {
    error("Cloud not configured.");
    return;
  }
  const fullId = await resolveTaskId(config, taskId);
  if (!fullId) return;
  try {
    const res = await apiFetch2(config, `/api/tasks/${fullId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "in_progress", assigned_to: config.userId })
    });
    if (res.ok) {
      const data = await res.json();
      success(`Started: "${data.title}"`);
    } else {
      const data = await res.json().catch(() => ({}));
      error(`Failed to start task: ${data.error ?? `HTTP ${res.status}`}`);
    }
  } catch {
    error("Failed to connect to vibeteamz.");
  }
});
taskCommand.command("done <id>").description("Complete a task (set to done)").action(async (taskId) => {
  let config;
  try {
    config = readCloudConfig();
  } catch {
    error("Cloud config is corrupted.");
    return;
  }
  if (!(config.accessToken || config.apiKey) || !config.userId || !config.projectId) {
    error("Cloud not configured.");
    return;
  }
  const fullId = await resolveTaskId(config, taskId);
  if (!fullId) return;
  try {
    const res = await apiFetch2(config, `/api/tasks/${fullId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "done" })
    });
    if (res.ok) {
      const data = await res.json();
      success(`Completed: "${data.title}"`);
    } else {
      const data = await res.json().catch(() => ({}));
      error(`Failed to complete task: ${data.error ?? `HTTP ${res.status}`}`);
    }
  } catch {
    error("Failed to connect to vibeteamz.");
  }
});
taskCommand.command("create <title>").description("Create a new task").option("--milestone <id>", "Assign to a milestone").option("--assign <user-id>", "Assign to a user (UUID)").action(async (title, opts) => {
  let config;
  try {
    config = readCloudConfig();
  } catch {
    error("Cloud config is corrupted.");
    return;
  }
  if (!(config.accessToken || config.apiKey) || !config.userId || !config.projectId) {
    error("Cloud not configured.");
    return;
  }
  try {
    let milestoneId = null;
    if (opts.milestone) {
      milestoneId = await resolveMilestoneId(config, opts.milestone);
      if (!milestoneId) return;
    }
    const res = await apiFetch2(config, `/api/projects/${config.projectId}/tasks`, {
      method: "POST",
      body: JSON.stringify({
        title,
        milestone_id: milestoneId,
        assigned_to: opts.assign || null
      })
    });
    if (res.ok) {
      const data = await res.json();
      success(`Task created: "${data.title}" (${data.id.slice(0, 8)})`);
    } else {
      const data = await res.json().catch(() => ({}));
      error(`Failed to create task: ${data.error ?? `HTTP ${res.status}`}`);
    }
  } catch {
    error("Failed to connect to vibeteamz.");
  }
});
taskCommand.command("detail <id>").description("View full task details including description").action(async (taskId) => {
  let config;
  try {
    config = readCloudConfig();
  } catch {
    error("Cloud config is corrupted.");
    return;
  }
  if (!(config.accessToken || config.apiKey) || !config.userId || !config.projectId) {
    error("Cloud not configured.");
    return;
  }
  const fullId = await resolveTaskId(config, taskId);
  if (!fullId) return;
  try {
    const [tasksRes, msRes] = await Promise.all([
      apiFetch2(config, `/api/projects/${config.projectId}/tasks`),
      apiFetch2(config, `/api/projects/${config.projectId}/milestones`)
    ]);
    if (!tasksRes.ok) {
      error("Failed to fetch task details.");
      return;
    }
    const tasks = await tasksRes.json();
    const task = tasks.find((t) => t.id === fullId);
    if (!task) {
      error(`Task ${taskId} not found.`);
      return;
    }
    let milestoneName = null;
    if (task.milestone_id && msRes.ok) {
      const msBody = await msRes.json();
      const milestones = Array.isArray(msBody) ? msBody : msBody.milestones ?? [];
      const ms = milestones.find((m) => m.id === task.milestone_id);
      milestoneName = ms?.title ?? null;
    }
    console.log("");
    console.log(`  ${statusIcon(task.status)} ${chalk11.bold(task.title)}`);
    console.log("");
    const rows = [];
    rows.push(["Status", statusLabel(task.status)]);
    rows.push(["Priority", task.priority === "normal" ? d4("normal") : chalk11.bold(task.priority)]);
    if (task.assignee) {
      rows.push(["Assigned to", `@${task.assignee.username}${task.assignee.display_name ? ` (${task.assignee.display_name})` : ""}`]);
    } else {
      rows.push(["Assigned to", d4("unassigned")]);
    }
    if (milestoneName) {
      rows.push(["Milestone", milestoneName]);
    }
    if (task.due_date) {
      const overdue = new Date(task.due_date) < /* @__PURE__ */ new Date() && task.status !== "done";
      rows.push(["Due", overdue ? chalk11.red(task.due_date) : task.due_date]);
    }
    rows.push(["ID", d4(task.id)]);
    for (const [label, value] of rows) {
      console.log(`  ${d4(label.padEnd(14))}${value}`);
    }
    if (task.description) {
      console.log("");
      console.log(d4("  Description"));
      for (const line of task.description.split("\n")) {
        console.log(`  ${line}`);
      }
    }
    console.log("");
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      error("Request timed out.");
    } else {
      error("Failed to connect to vibeteamz.");
    }
  }
});

// src/cloud/commands/notifications.ts
import { Command as Command22 } from "commander";
import chalk12 from "chalk";
var d5 = chalk12.dim;
function typeIcon(type) {
  switch (type) {
    case "mention":
      return chalk12.cyan("@");
    case "task_assigned":
      return chalk12.yellow("\u2192");
    case "task_completed":
      return chalk12.green("\u2713");
    case "member_joined":
      return chalk12.green("+");
    case "milestone_completed":
      return chalk12.magenta("\u2605");
    default:
      return d5("\xB7");
  }
}
function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 6e4);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
function getAuthToken2(config) {
  return config.apiKey ?? config.accessToken;
}
var notificationsCommand = new Command22("notifications").description("List your notifications").option("--all", "Include read notifications").action(async (opts) => {
  let config;
  try {
    config = readCloudConfig();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    error(`Cloud config error: ${msg}`);
    return;
  }
  if (!(config.accessToken || config.apiKey) || !config.userId || !config.projectId) {
    error('Cloud not configured. Run "vf vibeteamz login" then "vf vibeteamz link <id>".');
    return;
  }
  if (!isValidUUID(config.projectId)) {
    error("Invalid project ID in cloud config.");
    return;
  }
  try {
    const token = getAuthToken2(config);
    const res = await fetch(`${config.apiUrl}/api/notifications?project_id=${config.projectId}`, {
      headers: {
        "Authorization": `Bearer ${token}`
      },
      signal: AbortSignal.timeout(1e4)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      error(`Failed to fetch notifications: ${data.error ?? `HTTP ${res.status}`}`);
      return;
    }
    const { notifications, unread_count } = await res.json();
    console.log("");
    if (notifications.length === 0) {
      console.log(d5("  No notifications."));
      console.log("");
      return;
    }
    const filtered = opts.all ? notifications : notifications.filter((n) => !n.read_at);
    if (filtered.length === 0) {
      console.log(d5("  No unread notifications."));
      if (!opts.all) info("Use --all to see read notifications.");
      console.log("");
      return;
    }
    for (const n of filtered) {
      const icon = typeIcon(n.type);
      const actor = n.actor?.display_name || n.actor?.username || "someone";
      const unread = !n.read_at ? chalk12.yellowBright(" \u25CF") : "";
      const age = d5(timeAgo(n.created_at));
      console.log(`  ${icon}${unread} ${chalk12.bold(actor)} ${n.title}  ${age}`);
      if (n.body) {
        console.log(`    ${d5(n.body.slice(0, 80))}`);
      }
    }
    console.log("");
    if (unread_count > 0) {
      console.log(`  ${chalk12.yellowBright(unread_count)} unread`);
    } else {
      console.log(`  ${d5("All caught up")}`);
    }
    console.log("");
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      error("Request timed out. Check your network.");
    } else {
      const msg = e instanceof Error ? e.message : String(e);
      error(`Failed to connect to vibeteamz: ${msg}`);
    }
  }
});
var readAllCommand = new Command22("read-all").description("Mark all notifications as read").action(async () => {
  let config;
  try {
    config = readCloudConfig();
  } catch {
    error("Cloud config is corrupted.");
    return;
  }
  if (!(config.accessToken || config.apiKey) || !config.userId || !config.projectId) {
    error("Cloud not configured.");
    return;
  }
  try {
    const token = getAuthToken2(config);
    const res = await fetch(`${config.apiUrl}/api/notifications/read-all`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ project_id: config.projectId }),
      signal: AbortSignal.timeout(1e4)
    });
    if (res.ok) {
      success("All notifications marked as read.");
    } else {
      const data = await res.json().catch(() => ({}));
      error(`Failed: ${data.error ?? `HTTP ${res.status}`}`);
    }
  } catch {
    error("Failed to connect to vibeteamz.");
  }
});
notificationsCommand.addCommand(readAllCommand);

// src/cloud/commands/activity.ts
import { Command as Command23 } from "commander";
import chalk13 from "chalk";
var d6 = chalk13.dim;
function typeIcon2(type) {
  switch (type) {
    case "task_started":
      return chalk13.cyan("\u25B6");
    case "task_completed":
      return chalk13.green("\u2713");
    case "member_joined":
      return chalk13.green("+");
    case "member_left":
      return chalk13.red("-");
    case "session_started":
      return chalk13.magenta("\u25CF");
    case "commit":
      return chalk13.yellow("\u2022");
    case "note":
      return chalk13.blue("\u2022");
    case "review":
      return chalk13.cyan("\u2022");
    default:
      return d6("\xB7");
  }
}
function timeAgo2(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 6e4);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
function getAuthToken3(config) {
  return config.apiKey ?? config.accessToken;
}
var activityCommand = new Command23("activity").description("View project activity feed").option("--limit <n>", "Number of entries to show", "20").action(async (opts) => {
  let config;
  try {
    config = readCloudConfig();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    error(`Cloud config error: ${msg}`);
    return;
  }
  if (!(config.accessToken || config.apiKey) || !config.userId || !config.projectId) {
    error('Cloud not configured. Run "vf vibeteamz login" then "vf vibeteamz link <id>".');
    return;
  }
  if (!isValidUUID(config.projectId)) {
    error("Invalid project ID in cloud config.");
    return;
  }
  const limit = Math.min(parseInt(opts.limit || "20", 10) || 20, 50);
  try {
    const token = getAuthToken3(config);
    const res = await fetch(`${config.apiUrl}/api/projects/${config.projectId}/activity?limit=${limit}`, {
      headers: { "Authorization": `Bearer ${token}` },
      signal: AbortSignal.timeout(1e4)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      error(`Failed to fetch activity: ${data.error ?? `HTTP ${res.status}`}`);
      return;
    }
    const activities = await res.json();
    console.log("");
    if (activities.length === 0) {
      console.log(d6("  No activity yet."));
      console.log("");
      return;
    }
    console.log(chalk13.bold("  Activity Feed"));
    console.log("");
    for (const a of activities) {
      const icon = typeIcon2(a.type);
      const who = a.profiles?.username ?? "system";
      const age = d6(timeAgo2(a.created_at));
      console.log(`  ${icon} ${chalk13.bold(who)} ${a.message}  ${age}`);
    }
    console.log("");
    console.log(d6(`  ${activities.length} entries shown`));
    if (activities.length >= limit) {
      info(`Use --limit <n> to see more (max 50).`);
    }
    console.log("");
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      error("Request timed out. Check your network.");
    } else {
      const msg = e instanceof Error ? e.message : String(e);
      error(`Failed to connect to vibeteamz: ${msg}`);
    }
  }
});

// src/cloud/commands/members.ts
import { Command as Command24 } from "commander";
import chalk14 from "chalk";
var d7 = chalk14.dim;
function roleColor(role) {
  switch (role) {
    case "owner":
      return chalk14.yellow;
    case "admin":
      return chalk14.cyan;
    case "member":
      return chalk14.white;
    case "viewer":
      return chalk14.dim;
    case "pending":
      return chalk14.dim;
    default:
      return chalk14.white;
  }
}
function availIcon(avail) {
  switch (avail) {
    case "available":
      return chalk14.green("\u25CF");
    case "busy":
      return chalk14.red("\u25CF");
    case "looking":
      return chalk14.yellow("\u25CF");
    default:
      return d7("\u25CB");
  }
}
function getAuthToken4(config) {
  return config.apiKey ?? config.accessToken;
}
var membersCommand = new Command24("members").description("List project members").action(async () => {
  let config;
  try {
    config = readCloudConfig();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    error(`Cloud config error: ${msg}`);
    return;
  }
  if (!(config.accessToken || config.apiKey) || !config.userId || !config.projectId) {
    error('Cloud not configured. Run "vf vibeteamz login" then "vf vibeteamz link <id>".');
    return;
  }
  if (!isValidUUID(config.projectId)) {
    error("Invalid project ID in cloud config.");
    return;
  }
  try {
    const token = getAuthToken4(config);
    const res = await fetch(`${config.apiUrl}/api/projects/${config.projectId}/members`, {
      headers: { "Authorization": `Bearer ${token}` },
      signal: AbortSignal.timeout(1e4)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      error(`Failed to fetch members: ${data.error ?? `HTTP ${res.status}`}`);
      return;
    }
    const members = await res.json();
    console.log("");
    if (members.length === 0) {
      console.log(d7("  No members found."));
      console.log("");
      return;
    }
    const active = members.filter((m) => m.role !== "pending");
    const pending = members.filter((m) => m.role === "pending");
    console.log(chalk14.bold("  Team Members") + d7(` (${active.length})`));
    console.log("");
    for (const m of active) {
      const name = m.profiles?.display_name || m.profiles?.username || m.user_id.slice(0, 8);
      const username = m.profiles?.username ?? m.user_id.slice(0, 8);
      const avail = availIcon(m.profiles?.availability ?? null);
      const role = roleColor(m.role)(m.role.padEnd(8));
      const isYou = m.user_id === config.userId ? chalk14.dim(" (you)") : "";
      const nameStr = name === username ? username : `${name} ${d7(`@${username}`)}`;
      console.log(`  ${avail} ${nameStr.padEnd(28)}${role}${isYou}`);
    }
    if (pending.length > 0) {
      console.log("");
      console.log(chalk14.yellow("  Pending Requests") + d7(` (${pending.length})`));
      for (const m of pending) {
        const name = m.profiles?.display_name || m.profiles?.username || m.user_id.slice(0, 8);
        console.log(`  ${d7("\u25CB")} ${d7(name)}`);
      }
    }
    console.log("");
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      error("Request timed out. Check your network.");
    } else {
      const msg = e instanceof Error ? e.message : String(e);
      error(`Failed to connect to vibeteamz: ${msg}`);
    }
  }
});

// src/cloud/commands/project-info.ts
import { Command as Command25 } from "commander";
import chalk15 from "chalk";
var d8 = chalk15.dim;
function statusColor(status) {
  switch (status) {
    case "recruiting":
      return chalk15.green;
    case "active":
      return chalk15.yellow;
    case "completed":
      return chalk15.dim;
    default:
      return chalk15.white;
  }
}
function getAuthToken5(config) {
  return config.apiKey ?? config.accessToken;
}
var projectInfoCommand = new Command25("project").description("View linked project details").action(async () => {
  let config;
  try {
    config = readCloudConfig();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    error(`Cloud config error: ${msg}`);
    return;
  }
  if (!(config.accessToken || config.apiKey) || !config.userId || !config.projectId) {
    error('Cloud not configured. Run "vf vibeteamz login" then "vf vibeteamz link <id>".');
    return;
  }
  if (!isValidUUID(config.projectId)) {
    error("Invalid project ID in cloud config.");
    return;
  }
  try {
    const token = getAuthToken5(config);
    const res = await fetch(`${config.apiUrl}/api/projects/${config.projectId}`, {
      headers: { "Authorization": `Bearer ${token}` },
      signal: AbortSignal.timeout(1e4)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      error(`Failed to fetch project: ${data.error ?? `HTTP ${res.status}`}`);
      return;
    }
    const project = await res.json();
    console.log("");
    console.log(chalk15.bold(`  ${project.name}`) + "  " + statusColor(project.status)(project.status));
    if (project.owner) {
      const ownerName = project.owner.display_name || project.owner.username;
      console.log(d8(`  by @${project.owner.username}${ownerName !== project.owner.username ? ` (${ownerName})` : ""}`));
    }
    console.log("");
    if (project.tagline) {
      console.log(`  ${project.tagline}`);
      console.log("");
    }
    if (project.description) {
      const desc = project.description.length > 200 ? project.description.slice(0, 197) + "..." : project.description;
      console.log(d8(`  ${desc}`));
      console.log("");
    }
    const rows = [];
    rows.push(["Category", project.category]);
    rows.push(["Max Members", String(project.max_members)]);
    if (project.repo_url) rows.push(["Repo", project.repo_url]);
    rows.push(["ID", d8(project.id)]);
    for (const [label, value] of rows) {
      console.log(`  ${d8(label.padEnd(14))}${value}`);
    }
    if (project.tech_stack.length > 0) {
      console.log("");
      console.log(`  ${d8("Tech Stack")}    ${project.tech_stack.map((t) => chalk15.cyan(t)).join(d8(", "))}`);
    }
    if (project.roles_needed.length > 0) {
      console.log(`  ${d8("Looking for")}   ${project.roles_needed.map((r4) => chalk15.yellow(r4)).join(d8(", "))}`);
    }
    console.log("");
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      error("Request timed out. Check your network.");
    } else {
      const msg = e instanceof Error ? e.message : String(e);
      error(`Failed to connect to vibeteamz: ${msg}`);
    }
  }
});

// src/cloud/commands/org.ts
import { Command as Command26 } from "commander";
import chalk16 from "chalk";
var d9 = chalk16.dim;
function roleColor2(role) {
  switch (role) {
    case "owner":
      return chalk16.yellow;
    case "admin":
      return chalk16.cyan;
    case "member":
      return chalk16.white;
    default:
      return chalk16.white;
  }
}
function getAuthToken6(config) {
  return config.apiKey ?? config.accessToken;
}
async function apiFetch3(config, path8, opts) {
  const token = getAuthToken6(config);
  return fetch(`${config.apiUrl}${path8}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      ...opts?.headers ?? {}
    },
    signal: AbortSignal.timeout(1e4)
  });
}
var orgCommand = new Command26("org").description("Organization management commands");
orgCommand.command("list").description("List your organizations").action(async () => {
  let config;
  try {
    config = readCloudConfig();
  } catch {
    error("Cloud config is corrupted.");
    return;
  }
  if (!(config.accessToken || config.apiKey) || !config.userId) {
    error('Cloud not configured. Run "vf vibeteamz login".');
    return;
  }
  try {
    const res = await apiFetch3(config, "/api/orgs");
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      error(`Failed to fetch orgs: ${data.error ?? `HTTP ${res.status}`}`);
      return;
    }
    const orgs = await res.json();
    console.log("");
    if (orgs.length === 0) {
      console.log(d9("  No organizations found."));
      console.log("");
      return;
    }
    console.log(chalk16.bold("  Organizations") + d9(` (${orgs.length})`));
    console.log("");
    for (const org of orgs) {
      const owner = org.owner?.username ? d9(` @${org.owner.username}`) : "";
      console.log(`  ${chalk16.bold(org.name)}${owner}`);
      if (org.description) {
        console.log(`    ${d9(org.description.slice(0, 60))}`);
      }
      console.log(`    ${d9(org.id.slice(0, 8))}`);
    }
    console.log("");
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      error("Request timed out. Check your network.");
    } else {
      error("Failed to connect to vibeteamz.");
    }
  }
});
orgCommand.command("members <org-id>").description("List members of an organization").action(async (orgId) => {
  let config;
  try {
    config = readCloudConfig();
  } catch {
    error("Cloud config is corrupted.");
    return;
  }
  if (!(config.accessToken || config.apiKey) || !config.userId) {
    error('Cloud not configured. Run "vf vibeteamz login".');
    return;
  }
  try {
    const res = await apiFetch3(config, `/api/orgs/${orgId}/members`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      error(`Failed to fetch members: ${data.error ?? `HTTP ${res.status}`}`);
      return;
    }
    const members = await res.json();
    console.log("");
    if (members.length === 0) {
      console.log(d9("  No members found."));
      console.log("");
      return;
    }
    console.log(chalk16.bold("  Org Members") + d9(` (${members.length})`));
    console.log("");
    for (const m of members) {
      const name = m.profile?.display_name || m.profile?.username || m.user_id.slice(0, 8);
      const username = m.profile?.username ?? m.user_id.slice(0, 8);
      const role = roleColor2(m.role)(m.role.padEnd(8));
      const isYou = m.user_id === config.userId ? chalk16.dim(" (you)") : "";
      console.log(`  ${name.padEnd(24)}${role}  ${d9(`@${username}`)}${isYou}`);
    }
    console.log("");
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      error("Request timed out. Check your network.");
    } else {
      error("Failed to connect to vibeteamz.");
    }
  }
});
orgCommand.command("projects <org-id>").description("List projects in an organization").action(async (orgId) => {
  let config;
  try {
    config = readCloudConfig();
  } catch {
    error("Cloud config is corrupted.");
    return;
  }
  if (!(config.accessToken || config.apiKey) || !config.userId) {
    error('Cloud not configured. Run "vf vibeteamz login".');
    return;
  }
  try {
    const res = await apiFetch3(config, `/api/orgs/${orgId}/projects`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      error(`Failed to fetch projects: ${data.error ?? `HTTP ${res.status}`}`);
      return;
    }
    const projects = await res.json();
    console.log("");
    if (projects.length === 0) {
      console.log(d9("  No projects in this org."));
      console.log("");
      return;
    }
    console.log(chalk16.bold("  Org Projects") + d9(` (${projects.length})`));
    console.log("");
    for (const p of projects) {
      const statusFn = p.status === "recruiting" ? chalk16.green : p.status === "active" ? chalk16.yellow : chalk16.dim;
      console.log(`  ${chalk16.bold(p.name.padEnd(28))}${statusFn(p.status.padEnd(12))}${d9(p.id.slice(0, 8))}`);
    }
    console.log("");
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      error("Request timed out. Check your network.");
    } else {
      error("Failed to connect to vibeteamz.");
    }
  }
});

// src/cloud/register.ts
function registerCloud(program) {
  const primaryCmd = new Command27("vibeteamz").description("vibeteamz cloud integration commands");
  primaryCmd.addCommand(loginCommand);
  primaryCmd.addCommand(linkCommand);
  primaryCmd.addCommand(unlinkCommand);
  primaryCmd.addCommand(statusCommand2);
  primaryCmd.addCommand(teamCommand);
  primaryCmd.addCommand(pullCommand);
  primaryCmd.addCommand(pushCommand);
  primaryCmd.addCommand(msgCommand2);
  primaryCmd.addCommand(milestoneCommand);
  primaryCmd.addCommand(milestonesCommand);
  primaryCmd.addCommand(noteCommand);
  primaryCmd.addCommand(tasksCommand);
  primaryCmd.addCommand(taskCommand);
  primaryCmd.addCommand(notificationsCommand);
  primaryCmd.addCommand(activityCommand);
  primaryCmd.addCommand(membersCommand);
  primaryCmd.addCommand(projectInfoCommand);
  primaryCmd.addCommand(orgCommand);
  program.addCommand(primaryCmd);
  const vtCmd = new Command27("vt").description("Short alias for vibeteamz");
  vtCmd.allowUnknownOption(true);
  vtCmd.allowExcessArguments(true);
  vtCmd.action((_opts, cmd) => {
    primaryCmd.parseAsync(["node", "vf-vt", ...cmd.args]);
  });
  program.addCommand(vtCmd);
  const sayCmd = new Command27("say").description("Send a message to team chat (shortcut for vibeteamz msg)").argument("<message>", "Message to send").option("--to <usernames...>", "Mention users (auto-adds @ prefix)").option("--reply <message-id>", "Reply to a message").action(async (message, opts) => {
    const args = ["node", "vf-say", message];
    if (opts.to?.length) {
      args.push("--to", ...opts.to);
    }
    if (opts.reply) {
      args.push("--reply", opts.reply);
    }
    await msgCommand2.parseAsync(args);
  });
  program.addCommand(sayCmd);
  const aliasCmd = new Command27("cloud").description("Alias for vibeteamz (deprecated)");
  aliasCmd.hidden = true;
  aliasCmd.allowUnknownOption(true);
  aliasCmd.allowExcessArguments(true);
  aliasCmd.action((_opts, cmd) => {
    primaryCmd.parseAsync(["node", "vf-cloud", ...cmd.args]);
  });
  program.addCommand(aliasCmd);
}
export {
  AGENT_CONFIGS,
  buildHeartbeatPayload,
  calculateDailyScore,
  cleanupWorkers,
  clearCloudAuth,
  computeScoreFromFactors,
  createEmptyState,
  createTask,
  createTeamDirs,
  criteriaProgress,
  detectChanges,
  detectConflicts,
  elapsedMinutes,
  error,
  evaluateAdd,
  evaluateScopeAlignment,
  evaluateSwitch,
  exportTasks,
  filterSensitiveFiles,
  fireCloudActivity,
  fireDiscordEvent,
  fireHeartbeat,
  formatChangeBanner,
  formatDuration,
  generateClaudeMd,
  generateCriterionId,
  generateRulesMd,
  generateTaskId,
  getActiveDirectories,
  getActiveFiles,
  getActiveTask,
  getActiveTaskForWorker,
  getAllActiveWorkers,
  getAverageScore,
  getCoworkers,
  getDailyHistory,
  getStateDir,
  getStatePath,
  getStreak,
  getTask,
  getTeamDir,
  getTodayStart,
  getUsername,
  getWorkersDir,
  goOffline,
  importTasks,
  info,
  initProject,
  isCloudLinked,
  isSensitivePath,
  isTeamInitialized,
  isValidAgent,
  isValidHttpsUrl,
  isValidUUID,
  now,
  printChangeBanner,
  printFocusCard,
  printGuardian,
  printProgressBar,
  printTask,
  readAllPresence,
  readCloudConfig,
  readConfig,
  readLocalConfig,
  readState,
  readTeamConfig,
  registerCloud,
  register as registerTeam,
  resolveActiveTask,
  resolveAgent,
  resolveWorker,
  scoreLabel,
  sendHeartbeat,
  stampWorkerMeta,
  success,
  supabaseInsert,
  supabaseQuery,
  testDiscordWebhook,
  unmetDependencies,
  updateConfig,
  updateGitignore,
  updateState,
  updateTask,
  validatePathWithin,
  validateUsername,
  warn,
  writeCloudConfig,
  writeConfig,
  writeLocalConfig,
  writePresence,
  writeState,
  writeTeamConfig
};
