#!/usr/bin/env node
import {
  AGENT_CONFIGS,
  cleanupWorkers,
  createTask,
  criteriaProgress,
  elapsedMinutes,
  error,
  formatDuration,
  generateRulesMd,
  getActiveTask,
  getAllActiveWorkers,
  getStateDir,
  getTask,
  getTodayStart,
  guardCommand,
  info,
  initProject,
  installGuard,
  isValidAgent,
  logContext,
  logTaskAbandoned,
  logTaskCompleted,
  logTaskStarted,
  now,
  printChangeBanner,
  printFocusCard,
  printGuardian,
  printTask,
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
  writeState
} from "./chunk-56SVELN4.js";

// src/index.ts
import { Command as Command49 } from "commander";

// src/commands/init.ts
import path from "path";
import { Command } from "commander";
var initCommand = new Command("init").description("Initialize vibe-focus in the current project").option("--name <name>", "Project name").option("--agent <type>", "AI agent type: claude, cursor, copilot, windsurf, generic").action((opts) => {
  const projectName = opts.name ?? path.basename(process.cwd());
  try {
    const { importedCount } = initProject(projectName);
    if (opts.agent) {
      if (!isValidAgent(opts.agent)) {
        error(`Unknown agent "${opts.agent}". Valid: claude, cursor, copilot, windsurf, generic`);
        return;
      }
      updateConfig({ agent: opts.agent });
    }
    const agent = opts.agent ? resolveAgent(opts.agent) : void 0;
    const agentName = agent ? AGENT_CONFIGS[agent].displayName : void 0;
    success(`vibe-focus initialized for "${projectName}"`);
    if (importedCount > 0) {
      info(`Imported ${importedCount} task${importedCount === 1 ? "" : "s"} from tasks.json`);
    }
    if (agentName) {
      info(`Agent: ${agentName}`);
    }
    console.log("");
    info("Next steps:");
    console.log('  vf add "Your first task"    Add a task');
    console.log("  vf start t1                 Start working on it");
    console.log("  vf scope --define           Define project scope");
    if (agent) {
      console.log(`  vf guard --install          Install guard for ${agentName}`);
    } else {
      console.log("  vf guard --install          Install focus guard");
    }
  } catch (e) {
    error(e.message);
  }
});

// src/commands/add.ts
import { Command as Command2 } from "commander";
import { createInterface } from "readline/promises";

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

// src/commands/add.ts
import chalk from "chalk";
function promptCriteria() {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const criteria = [];
    let index = 1;
    console.log(chalk.cyan("\nEnter acceptance criteria (one per line, empty line to finish):"));
    process.stdout.write(chalk.gray(`  ${index}. `));
    rl.on("line", (line) => {
      if (line.trim() === "") {
        rl.close();
        return;
      }
      criteria.push(line.trim());
      index++;
      process.stdout.write(chalk.gray(`  ${index}. `));
    });
    rl.on("close", () => {
      resolve(criteria);
    });
  });
}
var addCommand = new Command2("add").description("Add a new task to the backlog").argument("<title>", "Task title").option("-d, --description <desc>", "Task description").option("-c, --criteria <criteria...>", "Acceptance criteria").option("-i, --interactive", "Interactively enter acceptance criteria").option("--depends <ids...>", "Dependency task IDs").option("--tag <tags...>", "Tags").option("--start", "Immediately start the task").option("--force", "Skip guardian warnings").action(async (title, opts) => {
  let state = readState();
  if (!opts.force) {
    const scopeCheck = evaluateScopeAlignment(state, title);
    if (scopeCheck && !scopeCheck.allowed) {
      printGuardian(scopeCheck);
      return;
    }
  }
  const active = getActiveTask(state);
  if (active) {
    const response = evaluateAdd(active);
    printGuardian(response);
  }
  let criteria = opts.criteria;
  if (opts.interactive && !criteria) {
    criteria = await promptCriteria();
    if (criteria.length === 0) {
      info('No criteria added. You can add them later with "vf check".');
    }
  }
  const result = createTask(state, title, {
    description: opts.description,
    criteria,
    dependencies: opts.depends,
    tags: opts.tag
  });
  state = result.state;
  if (opts.start && !active) {
    state = {
      ...state,
      activeTaskId: result.task.id,
      tasks: state.tasks.map(
        (t) => t.id === result.task.id ? { ...t, status: "active", startedAt: (/* @__PURE__ */ new Date()).toISOString() } : t
      ),
      currentSession: {
        taskId: result.task.id,
        startedAt: (/* @__PURE__ */ new Date()).toISOString(),
        endedAt: null
      },
      focusEvents: [
        ...state.focusEvents,
        { type: "start", taskId: result.task.id, timestamp: (/* @__PURE__ */ new Date()).toISOString() }
      ]
    };
  }
  writeState(state);
  success(`Added task ${result.task.id}: "${title}"`);
  printTask(result.task);
  if (opts.start && active) {
    info('Cannot auto-start: another task is active. Use "vf switch" first.');
  }
});

// src/commands/start.ts
import { Command as Command3 } from "commander";

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
function stampWorkerMeta(state, worker) {
  return {
    ...state.workerMeta,
    [worker]: {
      lastSeenEventIndex: state.focusEvents.length,
      lastCommandAt: now()
    }
  };
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

// src/team/core/file-tracker.ts
import { execSync } from "child_process";
import path2 from "path";
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
    const dir = path2.dirname(file);
    if (dir !== ".") {
      dirs.add(dir + "/");
    }
  }
  return [...dirs].sort();
}

// src/team/core/validation.ts
import path3 from "path";
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
  const resolved = path3.resolve(filePath);
  const resolvedDir = path3.resolve(expectedDir);
  if (!resolved.startsWith(resolvedDir + path3.sep) && resolved !== resolvedDir) {
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

// src/cloud/core/cloud-state.ts
import fs from "fs";
import path4 from "path";
import crypto from "crypto";
var CLOUD_FILE = "cloud.json";
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var HTTPS_URL_RE = /^https:\/\/[a-zA-Z0-9][a-zA-Z0-9.-]+[a-zA-Z0-9](:\d{1,5})?(\/[^\s]*)?$/;
function getCloudPath() {
  return path4.join(getStateDir(), CLOUD_FILE);
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
  if (!fs.existsSync(filePath)) {
    return defaultConfig();
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw);
  return validateConfig(parsed);
}
function writeCloudConfig(config) {
  const validated = validateConfig(config);
  const filePath = getCloudPath();
  const tmpPath = filePath + "." + crypto.randomBytes(4).toString("hex") + ".tmp";
  const content = JSON.stringify(validated, null, 2);
  fs.writeFileSync(tmpPath, content, { mode: 384 });
  fs.renameSync(tmpPath, filePath);
}
function isCloudLinked() {
  try {
    const config = readCloudConfig();
    return !!((config.accessToken || config.apiKey) && config.userId && config.projectId);
  } catch {
    return false;
  }
}
function isValidUUID(value) {
  return UUID_RE.test(value);
}
function isValidHttpsUrl(value) {
  return HTTPS_URL_RE.test(value);
}

// src/cloud/core/cloud-cache.ts
import fs2 from "fs";
import path5 from "path";
import crypto2 from "crypto";
var CACHE_FILE = "cloud-cache.json";
var MAX_CACHE_AGE_MS = 10 * 60 * 1e3;
function getCachePath() {
  return path5.join(getStateDir(), CACHE_FILE);
}
function writeCloudCache(cache) {
  const filePath = getCachePath();
  const tmpPath = filePath + "." + crypto2.randomBytes(4).toString("hex") + ".tmp";
  const content = JSON.stringify(cache, null, 2);
  fs2.writeFileSync(tmpPath, content, { mode: 384 });
  fs2.renameSync(tmpPath, filePath);
}
function readCloudCache(maxAge = MAX_CACHE_AGE_MS) {
  const filePath = getCachePath();
  if (!fs2.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs2.readFileSync(filePath, "utf-8"));
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

// src/team/core/team-state.ts
import fs3 from "fs";
import path6 from "path";
var TEAM_DIR = "team";
var CONFIG_FILE = "config.json";
var LOCAL_FILE = "local.json";
var WORKERS_DIR = "workers";
function getTeamDir() {
  return path6.join(getStateDir(), TEAM_DIR);
}
function getWorkersDir() {
  return path6.join(getTeamDir(), WORKERS_DIR);
}
function isTeamInitialized() {
  return fs3.existsSync(path6.join(getTeamDir(), CONFIG_FILE));
}
function readTeamConfig() {
  const filePath = path6.join(getTeamDir(), CONFIG_FILE);
  if (!fs3.existsSync(filePath)) {
    throw new Error('Team not initialized. Run "vf team init --user <name>" first.');
  }
  try {
    const parsed = JSON.parse(fs3.readFileSync(filePath, "utf-8"));
    if (typeof parsed.version !== "number" || !parsed.settings) {
      throw new Error("Invalid team config format.");
    }
    return parsed;
  } catch (e) {
    throw new Error(`Corrupt team config: ${e.message}. Re-run "vf team init".`);
  }
}
function writeTeamConfig(config) {
  const filePath = path6.join(getTeamDir(), CONFIG_FILE);
  const tmpPath = filePath + ".tmp";
  fs3.writeFileSync(tmpPath, JSON.stringify(config, null, 2));
  fs3.renameSync(tmpPath, filePath);
}
function readLocalConfig() {
  const filePath = path6.join(getTeamDir(), LOCAL_FILE);
  if (!fs3.existsSync(filePath)) {
    throw new Error('Local config not found. Run "vf team init --user <name>" first.');
  }
  try {
    const parsed = JSON.parse(fs3.readFileSync(filePath, "utf-8"));
    if (typeof parsed.username !== "string") {
      throw new Error("Missing username field.");
    }
    return parsed;
  } catch (e) {
    throw new Error(`Corrupt local config: ${e.message}. Re-run "vf team init --user <name>".`);
  }
}
function writeLocalConfig(config) {
  const filePath = path6.join(getTeamDir(), LOCAL_FILE);
  const tmpPath = filePath + ".tmp";
  fs3.writeFileSync(tmpPath, JSON.stringify(config, null, 2));
  fs3.renameSync(tmpPath, filePath);
}
function getUsername() {
  const username = readLocalConfig().username;
  validateUsername(username);
  return username;
}
function createTeamDirs() {
  const teamDir = getTeamDir();
  const workersDir = getWorkersDir();
  fs3.mkdirSync(teamDir, { recursive: true });
  fs3.mkdirSync(workersDir, { recursive: true });
}
function updateGitignore() {
  const gitignorePath = path6.join(getStateDir(), ".gitignore");
  const content = `# Personal state - never commit
*
# Team coordination - shared via Git
!team/
!team/**
# But ignore local config
team/local.json
`;
  fs3.writeFileSync(gitignorePath, content);
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

// src/commands/start.ts
import chalk2 from "chalk";
var startCommand = new Command3("start").description("Start working on a task").argument("<id>", "Task ID (e.g. t1)").option("--force", "Force start even if another task is active").option("--worker <name>", "Assign to a named worker/tab (multi-tab support)").action((id, opts) => {
  let state = readState();
  const task = getTask(state, id);
  const worker = resolveWorker(opts);
  const workerKey = worker ?? "__default__";
  const changes = detectChanges(state, workerKey);
  printChangeBanner(changes);
  if (!task) {
    error(`Task ${id} not found.`);
    return;
  }
  if (task.status === "done") {
    error(`Task ${id} is already done.`);
    return;
  }
  if (task.status === "active") {
    info(`Task ${id} is already active.`);
    printFocusCard(task);
    return;
  }
  const unmet = unmetDependencies(state, task);
  if (unmet.length > 0) {
    error(`Task ${id} has unmet dependencies: ${unmet.join(", ")}`);
    info("Complete those tasks first.");
    return;
  }
  const active = resolveActiveTask(state, worker);
  if (active && active.id !== id) {
    if (!opts.force) {
      const response = evaluateSwitch(state, active, id);
      printGuardian(response);
      return;
    }
    state = updateTask(state, active.id, {
      status: "backlog",
      switchCount: active.switchCount + 1,
      worker: null
    });
    state = {
      ...state,
      focusEvents: [
        ...state.focusEvents,
        { type: "switch_away", taskId: active.id, timestamp: now(), worker: workerKey },
        { type: "pushback_override", taskId: active.id, timestamp: now(), worker: workerKey }
      ]
    };
  }
  const timestamp = now();
  state = updateTask(state, id, {
    status: "active",
    startedAt: task.startedAt ?? timestamp,
    worker: worker ?? null
  });
  const newWorkers = { ...state.activeWorkers };
  if (worker) {
    newWorkers[worker] = id;
  }
  state = {
    ...state,
    activeTaskId: worker ? state.activeTaskId : id,
    // only set default if no worker
    activeWorkers: newWorkers,
    currentSession: { taskId: id, startedAt: timestamp, endedAt: null },
    focusEvents: [
      ...state.focusEvents,
      { type: "start", taskId: id, timestamp, worker: workerKey }
    ]
  };
  state.workerMeta = stampWorkerMeta(state, workerKey);
  writeState(state);
  fireHeartbeat();
  fireCloudActivity({ type: "task_started", message: `Started ${id}: "${task.title}"` });
  fireDiscordEvent({ type: "task_started", taskId: id, taskTitle: task.title, worker: workerKey });
  logTaskStarted(id, task.title, workerKey);
  const updated = state.tasks.find((t) => t.id === id);
  success(`Started task ${id}` + (worker ? ` [worker: ${worker}]` : ""));
  printFocusCard(updated);
  if (isCloudLinked()) {
    console.log(chalk2.green("  \u2665 vibeteamz: connected"));
  } else {
    console.log(chalk2.dim("  \u2665 vibeteamz: not linked") + chalk2.dim(" (run vf setup)"));
  }
  console.log("");
  if (worker) {
    info(`Worker "${worker}" is now focused on this task.`);
    info(`Set VF_WORKER=${worker} in your shell for guard hook enforcement.`);
  }
  info('Run "vf prompt" to get a focused Claude Code prompt.');
  info('Run "vf done"' + (worker ? ` --worker ${worker}` : "") + " when all criteria are met.");
});

// src/commands/done.ts
import { Command as Command6 } from "commander";
import chalk5 from "chalk";

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
  days.sort((a, b6) => a.date.localeCompare(b6.date));
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
  const sum = history.reduce((acc, d13) => acc + d13.score, 0);
  return Math.round(sum / history.length);
}

// src/commands/flow.ts
import fs4 from "fs";
import path7 from "path";
import { Command as Command4 } from "commander";
import chalk3 from "chalk";
var DEFAULT_ALLOWED_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "NotebookEdit",
  "WebFetch",
  "WebSearch",
  "Task",
  "Bash(npm run *)",
  "Bash(npm test *)",
  "Bash(npx *)",
  "Bash(node *)",
  "Bash(git status*)",
  "Bash(git diff*)",
  "Bash(git log*)",
  "Bash(git add *)",
  "Bash(git commit *)",
  "Bash(ls *)",
  "Bash(cat *)",
  "Bash(wc *)",
  "Bash(which *)",
  "Bash(tsc *)",
  "Bash(python *)",
  "Bash(pip *)",
  "Bash(cargo *)",
  "Bash(go *)",
  "Bash(make *)",
  "Bash(mkdir *)",
  "Bash(cp *)",
  "Bash(mv *)"
];
function getSettingsPath() {
  return path7.join(process.cwd(), ".claude", "settings.json");
}
function readFlowSettings() {
  const settingsPath = getSettingsPath();
  if (fs4.existsSync(settingsPath)) {
    return JSON.parse(fs4.readFileSync(settingsPath, "utf-8"));
  }
  return {};
}
function writeFlowSettings(settings) {
  const dir = path7.dirname(getSettingsPath());
  fs4.mkdirSync(dir, { recursive: true });
  fs4.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2));
}
function getFlowMode() {
  const settings = readFlowSettings();
  if (!settings._vibeFocus?.flowActive) return false;
  return settings._vibeFocus.flowMode || "task";
}
function disableFlowSilent() {
  const settings = readFlowSettings();
  if (!settings._vibeFocus?.flowActive) return false;
  delete settings.allowedTools;
  delete settings._vibeFocus;
  writeFlowSettings(settings);
  return true;
}
function enableFlow(mode, extras) {
  const agent = resolveAgent();
  if (agent !== "claude") {
    const name = AGENT_CONFIGS[agent].displayName;
    warn(`Flow mode requires Claude Code (.claude/settings.json). Current agent: ${name}.`);
    info("Flow mode auto-approves tool permissions, which is Claude Code-specific.");
    return;
  }
  const settings = readFlowSettings();
  let allowedTools = [...DEFAULT_ALLOWED_TOOLS];
  for (const extra of extras) {
    const pattern = extra.includes("(") ? extra : `Bash(${extra})`;
    if (!allowedTools.includes(pattern)) {
      allowedTools.push(pattern);
    }
  }
  if (settings.allowedTools && Array.isArray(settings.allowedTools)) {
    for (const existing of settings.allowedTools) {
      if (!allowedTools.includes(existing)) {
        allowedTools.push(existing);
      }
    }
  }
  settings.allowedTools = allowedTools;
  if (!settings._vibeFocus) settings._vibeFocus = {};
  settings._vibeFocus.flowActive = true;
  settings._vibeFocus.flowMode = mode;
  settings._vibeFocus.flowEnabledAt = (/* @__PURE__ */ new Date()).toISOString();
  settings._vibeFocus.flowToolCount = allowedTools.length;
  writeFlowSettings(settings);
  const isSuper = mode === "super";
  const title = isSuper ? "SUPERFLOW ACTIVATED" : "FLOW MODE ACTIVATED";
  const scope = isSuper ? "Active until ALL tasks are done." : "Active until current task is done.";
  const color = isSuper ? chalk3.cyanBright : chalk3.greenBright;
  const colorB = isSuper ? chalk3.bold.cyan : chalk3.bold.green;
  console.log("");
  console.log(color("  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"));
  console.log(color("  \u2551") + colorB(`   ${title}`.padEnd(43)) + color("\u2551"));
  console.log(color("  \u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"));
  console.log(color("  \u2551") + "                                           " + color("\u2551"));
  console.log(color("  \u2551") + chalk3.dim("  Auto-approve active tools:               ") + color("\u2551"));
  console.log(color("  \u2551") + "                                           " + color("\u2551"));
  console.log(color("  \u2551") + chalk3.cyan("  [\u2713]") + chalk3.dim(" Read, Write, Edit files           ") + color("\u2551"));
  console.log(color("  \u2551") + chalk3.cyan("  [\u2713]") + chalk3.dim(" Search (Glob, Grep)               ") + color("\u2551"));
  console.log(color("  \u2551") + chalk3.cyan("  [\u2713]") + chalk3.dim(" Build & test commands              ") + color("\u2551"));
  console.log(color("  \u2551") + chalk3.cyan("  [\u2713]") + chalk3.dim(" Git operations (status/diff/add)   ") + color("\u2551"));
  console.log(color("  \u2551") + chalk3.cyan("  [\u2713]") + chalk3.dim(" Common dev tools (node, tsc, etc)  ") + color("\u2551"));
  console.log(color("  \u2551") + "                                           " + color("\u2551"));
  console.log(color("  \u2551") + chalk3.dim(`  ${allowedTools.length} tool patterns whitelisted`) + "          " + color("\u2551"));
  console.log(color("  \u2551") + chalk3.dim(`  ${scope}`.padEnd(43)) + color("\u2551"));
  console.log(color("  \u2551") + "                                           " + color("\u2551"));
  if (isSuper) {
    console.log(color("  \u2551") + chalk3.yellow("  CAREFUL MODE: Review before destructive  ") + color("\u2551"));
    console.log(color("  \u2551") + chalk3.yellow("  operations. Think twice, execute once.    ") + color("\u2551"));
    console.log(color("  \u2551") + "                                           " + color("\u2551"));
  }
  console.log(color("  \u2551") + chalk3.yellow("  Restart your AI agent to activate.      ") + color("\u2551"));
  console.log(color("  \u2551") + "                                           " + color("\u2551"));
  console.log(color("  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D"));
  console.log("");
  if (isSuper) {
    info("Superflow: auto-approve until all tasks done. Stay careful.");
  } else {
    info('Flow: auto-approve until "vf done". Then permissions reset.');
  }
}
function disableFlow() {
  const settings = readFlowSettings();
  if (!settings._vibeFocus?.flowActive) {
    warn("Flow mode is not active.");
    return;
  }
  delete settings.allowedTools;
  delete settings._vibeFocus;
  writeFlowSettings(settings);
  success("Flow mode disabled.");
  info("Your AI agent will ask for permission again.");
  info("Restart your AI agent to apply changes.");
}
function showStatus() {
  const settings = readFlowSettings();
  const isActive = settings._vibeFocus?.flowActive === true;
  const mode = settings._vibeFocus?.flowMode || "task";
  console.log("");
  console.log(chalk3.bold("Flow Mode Status:"));
  console.log("");
  if (isActive) {
    const toolCount = settings.allowedTools?.length || 0;
    const enabledAt = settings._vibeFocus?.flowEnabledAt;
    const modeLabel = mode === "super" ? chalk3.cyanBright("SUPERFLOW (until all tasks done)") : chalk3.green("FLOW (until current task done)");
    console.log(`  Status:    ${chalk3.green("ACTIVE")}`);
    console.log(`  Mode:      ${modeLabel}`);
    console.log(`  Tools:     ${chalk3.cyan(toolCount + " patterns")} whitelisted`);
    if (enabledAt) {
      console.log(`  Since:     ${chalk3.dim(new Date(enabledAt).toLocaleString())}`);
    }
  } else {
    console.log(`  Status:    ${chalk3.yellow("INACTIVE")}`);
    console.log("");
    info("vf flow --on        (until current task done)");
    info("vf superflow --on   (until all tasks done)");
  }
  console.log("");
}
var flowCommand = new Command4("flow").description("Auto-approve tool permissions until current task is done").option("--on", "Enable flow mode (scoped to current task)").option("--off", "Disable flow mode").option("--status", "Check flow status").option("--add <patterns...>", "Add extra Bash patterns").action((opts) => {
  if (opts.off) {
    disableFlow();
  } else if (opts.on || !opts.off && !opts.status) {
    enableFlow("task", opts.add || []);
  } else {
    showStatus();
  }
});
var superflowCommand = new Command4("superflow").description("Auto-approve tool permissions until ALL tasks are done (careful mode)").option("--on", "Enable superflow").option("--off", "Disable superflow").option("--status", "Check flow status").option("--add <patterns...>", "Add extra Bash patterns").action((opts) => {
  if (opts.off) {
    disableFlow();
  } else if (opts.on || !opts.off && !opts.status) {
    enableFlow("super", opts.add || []);
  } else {
    showStatus();
  }
});

// src/commands/context.ts
import { Command as Command5 } from "commander";
import { createInterface as createInterface2 } from "readline/promises";
import chalk4 from "chalk";
var MAX_CONTEXTS = 5;
var contextCommand = new Command5("context").description("Save and restore session context across AI coding sessions").argument("[summary...]", "Session summary to save").option("--show", "Show the most recent saved context").option("--list", "List all saved session contexts").option("--clear", "Clear all saved contexts").option("--decisions <decisions...>", "Key decisions made").option("--questions <questions...>", "Open/unresolved questions").option("--project-state <state>", 'Current project state (e.g. "lokal in dev")').option("--tech-stack <stack...>", "Active tech stack").option("-i, --interactive", "Interactively enter structured context fields").action(async (summaryParts, opts) => {
  if (opts.show) {
    showContext();
    return;
  }
  if (opts.list) {
    listContexts();
    return;
  }
  if (opts.clear) {
    clearContexts();
    return;
  }
  if (opts.interactive) {
    await saveContextInteractive();
    return;
  }
  const summary = summaryParts?.join(" ")?.trim();
  if (!summary) {
    showContext();
    return;
  }
  saveContext(summary, {
    decisions: opts.decisions,
    openQuestions: opts.questions,
    projectState: opts.projectState,
    techStack: opts.techStack
  });
});
async function promptMultiLine(rl, label) {
  const items = [];
  console.log(chalk4.cyan(`
${label} (one per line, empty line to skip/finish):`));
  let index = 1;
  process.stdout.write(chalk4.gray(`  ${index}. `));
  return new Promise((resolve) => {
    rl.on("line", (line) => {
      if (line.trim() === "") {
        rl.removeAllListeners("line");
        resolve(items);
        return;
      }
      items.push(line.trim());
      index++;
      process.stdout.write(chalk4.gray(`  ${index}. `));
    });
  });
}
async function saveContextInteractive() {
  const rl = createInterface2({ input: process.stdin, output: process.stdout });
  try {
    const summary = await rl.question(chalk4.cyan("Session summary: "));
    if (!summary.trim()) {
      info("No summary provided. Context not saved.");
      rl.close();
      return;
    }
    const decisions = await promptMultiLine(rl, "Decisions");
    const openQuestions = await promptMultiLine(rl, "Open questions");
    const projectState = await rl.question(chalk4.cyan('\nProject state (e.g. "lokal in dev", empty to skip): '));
    const techStack = await promptMultiLine(rl, "Tech stack");
    rl.close();
    saveContext(summary.trim(), {
      decisions: decisions.length > 0 ? decisions : void 0,
      openQuestions: openQuestions.length > 0 ? openQuestions : void 0,
      projectState: projectState.trim() || void 0,
      techStack: techStack.length > 0 ? techStack : void 0
    });
  } catch {
    rl.close();
  }
}
function saveContext(summary, fields = {}, explicitTaskId, quiet = false) {
  const state = readState();
  const active = getActiveTask(state);
  const ctx = {
    id: `ctx-${state.nextContextNumber}`,
    taskId: explicitTaskId ?? active?.id ?? null,
    savedAt: (/* @__PURE__ */ new Date()).toISOString(),
    summary,
    ...fields.decisions && { decisions: fields.decisions },
    ...fields.openQuestions && { openQuestions: fields.openQuestions },
    ...fields.projectState && { projectState: fields.projectState },
    ...fields.techStack && { techStack: fields.techStack }
  };
  state.sessionContexts.push(ctx);
  state.nextContextNumber++;
  if (state.sessionContexts.length > MAX_CONTEXTS) {
    state.sessionContexts = state.sessionContexts.slice(-MAX_CONTEXTS);
  }
  writeState(state);
  logContext(summary, ctx.taskId, "__default__");
  if (quiet) {
    info(`Session context saved (${ctx.id}).`);
    return;
  }
  const gB9 = chalk4.greenBright;
  const gD7 = chalk4.dim.green;
  const c7 = chalk4.cyan;
  const d13 = chalk4.dim;
  console.log("");
  console.log(gD7("  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"));
  console.log(gD7("  \u2551") + gB9("   SESSION CONTEXT SAVED                 ") + gD7("\u2551"));
  console.log(gD7("  \u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"));
  console.log(gD7("  \u2551") + "                                           " + gD7("\u2551"));
  printWrapped(summary, gD7);
  console.log(gD7("  \u2551") + "                                           " + gD7("\u2551"));
  console.log(gD7("  \u2551") + d13(`  ID: ${ctx.id}`) + " ".repeat(Math.max(0, 35 - ctx.id.length)) + gD7("\u2551"));
  const taskRef = explicitTaskId ? state.tasks.find((t) => t.id === explicitTaskId) : active;
  if (taskRef) {
    const taskInfo = `  Task: ${taskRef.id} - ${taskRef.title}`;
    console.log(gD7("  \u2551") + d13(taskInfo.slice(0, 41).padEnd(41)) + gD7("\u2551"));
  }
  if (ctx.decisions?.length) {
    console.log(gD7("  \u2551") + "                                           " + gD7("\u2551"));
    console.log(gD7("  \u2551") + c7("  Decisions:".padEnd(41)) + gD7("\u2551"));
    for (const dec of ctx.decisions) {
      console.log(gD7("  \u2551") + d13(`    - ${dec}`.slice(0, 41).padEnd(41)) + gD7("\u2551"));
    }
  }
  if (ctx.openQuestions?.length) {
    console.log(gD7("  \u2551") + c7("  Open Questions:".padEnd(41)) + gD7("\u2551"));
    for (const q of ctx.openQuestions) {
      console.log(gD7("  \u2551") + d13(`    ? ${q}`.slice(0, 41).padEnd(41)) + gD7("\u2551"));
    }
  }
  if (ctx.projectState) {
    console.log(gD7("  \u2551") + c7("  State: ") + d13(ctx.projectState.slice(0, 32).padEnd(32)) + gD7("\u2551"));
  }
  if (ctx.techStack?.length) {
    console.log(gD7("  \u2551") + c7("  Stack: ") + d13(ctx.techStack.join(", ").slice(0, 32).padEnd(32)) + gD7("\u2551"));
  }
  console.log(gD7("  \u2551") + "                                           " + gD7("\u2551"));
  console.log(gD7("  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D"));
  console.log("");
  info("This context will auto-inject into your next AI coding session via the guard hook.");
  info(`${state.sessionContexts.length}/${MAX_CONTEXTS} context slots used.`);
}
function printWrapped(text, gD7) {
  const maxLine = 39;
  const words = text.split(" ");
  let line = "";
  const lines = [];
  for (const word of words) {
    if (line.length + word.length + 1 > maxLine) {
      lines.push(line);
      line = word;
    } else {
      line = line ? line + " " + word : word;
    }
  }
  if (line) lines.push(line);
  for (const l of lines) {
    console.log(gD7("  \u2551") + `  ${l.padEnd(41)}` + gD7("\u2551"));
  }
}
function showContext() {
  const state = readState();
  if (state.sessionContexts.length === 0) {
    info("No session context saved yet.");
    info('Save one with: vf context "what was accomplished, decisions made, next steps..."');
    return;
  }
  const latest = state.sessionContexts[state.sessionContexts.length - 1];
  const age = getTimeAgo(latest.savedAt);
  const gB9 = chalk4.greenBright;
  const gD7 = chalk4.dim.green;
  const c7 = chalk4.cyan;
  const d13 = chalk4.dim;
  console.log("");
  console.log(gD7("  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"));
  console.log(gD7("  \u2551") + gB9("   LAST SESSION CONTEXT                  ") + gD7("\u2551"));
  console.log(gD7("  \u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"));
  console.log(gD7("  \u2551") + "                                           " + gD7("\u2551"));
  console.log(gD7("  \u2551") + c7(`  ${latest.id}`) + d13(` saved ${age}`.padEnd(41 - latest.id.length)) + gD7("\u2551"));
  if (latest.taskId) {
    const task = state.tasks.find((t) => t.id === latest.taskId);
    const taskInfo = task ? `  Task: ${task.id} - ${task.title}` : `  Task: ${latest.taskId}`;
    console.log(gD7("  \u2551") + d13(taskInfo.slice(0, 41).padEnd(41)) + gD7("\u2551"));
  }
  console.log(gD7("  \u2551") + "                                           " + gD7("\u2551"));
  printWrapped(latest.summary, gD7);
  if (latest.decisions?.length) {
    console.log(gD7("  \u2551") + "                                           " + gD7("\u2551"));
    console.log(gD7("  \u2551") + c7("  Decisions:".padEnd(41)) + gD7("\u2551"));
    for (const dec of latest.decisions) {
      console.log(gD7("  \u2551") + d13(`    - ${dec}`.slice(0, 41).padEnd(41)) + gD7("\u2551"));
    }
  }
  if (latest.openQuestions?.length) {
    console.log(gD7("  \u2551") + c7("  Open Questions:".padEnd(41)) + gD7("\u2551"));
    for (const q of latest.openQuestions) {
      console.log(gD7("  \u2551") + d13(`    ? ${q}`.slice(0, 41).padEnd(41)) + gD7("\u2551"));
    }
  }
  if (latest.projectState) {
    console.log(gD7("  \u2551") + c7("  State: ") + d13(latest.projectState.slice(0, 32).padEnd(32)) + gD7("\u2551"));
  }
  if (latest.techStack?.length) {
    console.log(gD7("  \u2551") + c7("  Stack: ") + d13(latest.techStack.join(", ").slice(0, 32).padEnd(32)) + gD7("\u2551"));
  }
  console.log(gD7("  \u2551") + "                                           " + gD7("\u2551"));
  console.log(gD7("  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D"));
  console.log("");
}
function listContexts() {
  const state = readState();
  if (state.sessionContexts.length === 0) {
    info("No session contexts saved yet.");
    info('Save one with: vf context "summary of what was done..."');
    return;
  }
  const gB9 = chalk4.greenBright;
  const d13 = chalk4.dim;
  const c7 = chalk4.cyan;
  const y8 = chalk4.yellow;
  console.log("");
  console.log(gB9("  SESSION CONTEXTS"));
  console.log(d13("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  console.log("");
  for (const ctx of state.sessionContexts) {
    const age = getTimeAgo(ctx.savedAt);
    const taskInfo = ctx.taskId ? d13(` (${ctx.taskId})`) : "";
    const preview = ctx.summary.length > 50 ? ctx.summary.slice(0, 47) + "..." : ctx.summary;
    console.log(`  ${c7(ctx.id)}${taskInfo}  ${d13(age)}`);
    console.log(`  ${preview}`);
    if (ctx.projectState) {
      console.log(`  ${y8("state:")} ${ctx.projectState}`);
    }
    if (ctx.techStack?.length) {
      console.log(`  ${y8("stack:")} ${ctx.techStack.join(", ")}`);
    }
    console.log("");
  }
  console.log(d13(`  ${state.sessionContexts.length}/${MAX_CONTEXTS} slots used`));
  console.log("");
}
function clearContexts() {
  const state = readState();
  const count = state.sessionContexts.length;
  state.sessionContexts = [];
  writeState(state);
  if (count > 0) {
    success(`Cleared ${count} saved context${count > 1 ? "s" : ""}.`);
  } else {
    info("No contexts to clear.");
  }
}
function getTimeAgo(isoDate) {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 6e4);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

// src/commands/done.ts
var doneCommand = new Command6("done").description("Complete the current active task").option("--force", "Skip criteria check").option("--worker <name>", "Complete the task for a specific worker/tab").action((opts) => {
  let state = readState();
  const worker = resolveWorker(opts);
  const workerKey = worker ?? "__default__";
  const task = resolveActiveTask(state, worker);
  const changes = detectChanges(state, workerKey);
  printChangeBanner(changes);
  if (!task) {
    error(
      worker ? `No active task for worker "${worker}". Use "vf start <id> --worker ${worker}" to begin one.` : 'No active task. Use "vf start <id>" to begin one.'
    );
    return;
  }
  const { met, total } = criteriaProgress(task);
  if (total > 0 && met < total && !opts.force) {
    warn(`Not all criteria met (${met}/${total}).`);
    for (const c7 of task.acceptanceCriteria) {
      const icon = c7.met ? "  [\u2713]" : "  [ ]";
      console.log(`${icon} ${c7.text}`);
    }
    console.log("");
    info('Use --force to complete anyway, or check criteria with "vf check".');
    return;
  }
  const timestamp = now();
  const elapsed = task.startedAt ? elapsedMinutes(task.startedAt) : 0;
  state = updateTask(state, task.id, {
    status: "done",
    completedAt: timestamp,
    acceptanceCriteria: task.acceptanceCriteria.map((c7) => ({ ...c7, met: true }))
  });
  state = {
    ...state,
    ...cleanupWorkers(state, task.id, worker),
    currentSession: null,
    focusEvents: [
      ...state.focusEvents,
      { type: "complete", taskId: task.id, timestamp, worker: workerKey }
    ]
  };
  state.workerMeta = stampWorkerMeta(state, workerKey);
  writeState(state);
  fireHeartbeat({ status: "idle" });
  fireCloudActivity({ type: "task_completed", message: `Completed ${task.id}: "${task.title}"` });
  fireDiscordEvent({
    type: "task_completed",
    taskId: task.id,
    taskTitle: task.title,
    worker: workerKey,
    progress: `${total}/${total} criteria met`
  });
  const lastCtx = state.sessionContexts.length > 0 ? state.sessionContexts[state.sessionContexts.length - 1] : null;
  const carried = {};
  if (lastCtx?.projectState) carried.projectState = lastCtx.projectState;
  if (lastCtx?.techStack?.length) carried.techStack = lastCtx.techStack;
  const completedCriteria = task.acceptanceCriteria.filter((c7) => c7.met).map((c7) => c7.text);
  if (completedCriteria.length > 0) {
    carried.decisions = completedCriteria.map((c7) => `Done: ${c7}`);
  }
  saveContext(
    `Completed ${task.id}: "${task.title}"`,
    carried,
    task.id,
    true
  );
  logTaskCompleted(task.id, task.title, workerKey, formatDuration(elapsed));
  success(`Task ${task.id} completed: "${task.title}"`);
  if (total > 0) console.log(`  Criteria: ${total}/${total} met`);
  console.log(`  Time spent: ${formatDuration(elapsed)}`);
  const score = calculateDailyScore(state);
  const history = getDailyHistory(state);
  const streak = getStreak(history);
  console.log(`  Focus score: ${score} (${scoreLabel(score)})`);
  if (streak > 0) {
    console.log(`  Streak: ${streak}d ${"\u{1F525}".repeat(Math.min(streak, 5))}`);
  }
  const flowMode = getFlowMode();
  const backlog = state.tasks.filter((t) => t.status === "backlog");
  if (flowMode === "task") {
    disableFlowSilent();
    console.log("");
    console.log(chalk5.yellow("  Flow mode auto-disabled (task completed)."));
    info("Restart your AI agent to apply. Re-enable with: vf flow --on");
  } else if (flowMode === "super") {
    if (backlog.length === 0) {
      disableFlowSilent();
      console.log("");
      console.log(chalk5.cyanBright("  Superflow auto-disabled (all tasks done)."));
      info("Restart your AI agent to apply.");
    } else {
      console.log("");
      console.log(chalk5.cyan(`  Superflow active: ${backlog.length} task${backlog.length > 1 ? "s" : ""} remaining.`));
    }
  }
  if (backlog.length > 0) {
    console.log("");
    info("Next up in backlog:");
    for (const t of backlog.slice(0, 3)) {
      console.log(`  ${t.id}  ${t.title}`);
    }
    console.log("");
    info(`Run "vf start ${backlog[0].id}" to continue.`);
  }
});

// src/commands/status.ts
import chalk6 from "chalk";
import { Command as Command7 } from "commander";
var W = 62;
var g = chalk6.green;
var gB = chalk6.greenBright;
var gD = chalk6.dim.green;
var c = chalk6.cyan;
var cB = chalk6.cyanBright;
var y = chalk6.yellow;
var r = chalk6.red;
var d = chalk6.dim;
var b = chalk6.bold;
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
  const deco = hLine("\u2500", 2);
  const visible = label.length;
  const remaining = w - 6 - visible - 4;
  return gD("\u2560\u2500\u2500") + " " + gB(label) + " " + gD(hLine("\u2500", Math.max(1, remaining)) + "\u2563");
}
function progressBar(percent, width = 20) {
  const filled = Math.round(percent / 100 * width);
  const empty = width - filled;
  return g("[") + gB("\u2588".repeat(filled)) + gD("\u2591".repeat(empty)) + g("]");
}
function scoreGraph(score) {
  const w = 20;
  const filled = Math.round(score / 100 * w);
  const empty = w - filled;
  const color = score >= 70 ? gB : score >= 50 ? y : r;
  return g("[") + color("\u2593".repeat(filled)) + gD("\u2591".repeat(empty)) + g("]");
}
function sparkline(events) {
  return events.slice(-20).map((e) => {
    switch (e.type) {
      case "start":
        return gB("\u25B2");
      case "complete":
        return cB("\u25CF");
      case "abandon":
        return r("\u2715");
      case "switch_away":
        return y("\u25C6");
      case "pushback_override":
        return r("!");
      default:
        return d("\xB7");
    }
  }).join("");
}
var statusCommand = new Command7("status").description("Show the focus dashboard").option("--json", "Output as JSON").option("--worker <name>", "Identity for cross-tab sync").action(async (opts) => {
  const state = readState();
  const worker = resolveWorker(opts);
  const workerKey = worker ?? "__default__";
  const changes = detectChanges(state, workerKey);
  printChangeBanner(changes);
  if (opts.json) {
    const active2 = getActiveTask(state);
    console.log(JSON.stringify({
      projectName: state.projectName,
      projectScope: state.projectScope,
      activeTask: active2 ? {
        id: active2.id,
        title: active2.title,
        ...criteriaProgress(active2),
        elapsed: active2.startedAt ? elapsedMinutes(active2.startedAt) : 0
      } : null,
      totalTasks: state.tasks.length,
      doneTasks: state.tasks.filter((t) => t.status === "done").length,
      score: calculateDailyScore(state)
    }, null, 2));
    return;
  }
  const active = getActiveTask(state);
  const doneTasks = state.tasks.filter((t) => t.status === "done");
  const backlogTasks = state.tasks.filter((t) => t.status === "backlog");
  const abandonedCount = state.tasks.filter((t) => t.status === "abandoned").length;
  const total = state.tasks.length;
  const score = calculateDailyScore(state);
  const now2 = /* @__PURE__ */ new Date();
  const timeStr = now2.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = now2.toLocaleDateString("de-DE");
  const todayStart = getTodayStart();
  const todayEvents = state.focusEvents.filter(
    (e) => new Date(e.timestamp) >= todayStart
  );
  const todaySwitches = todayEvents.filter((e) => e.type === "switch_away").length;
  const todayCompleted = todayEvents.filter((e) => e.type === "complete").length;
  const lines = [];
  lines.push("");
  lines.push(gB("  \u2588\u2588\u2557   \u2588\u2588\u2557\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557    \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2557   \u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557"));
  lines.push(gB("  \u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D    \u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2554\u2550\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D"));
  lines.push(g("  \u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2588\u2588\u2588\u2557      \u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2551     \u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557"));
  lines.push(gD("  \u255A\u2588\u2588\u2557 \u2588\u2588\u2554\u255D\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u255D      \u2588\u2588\u2554\u2550\u2550\u255D  \u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2551     \u2588\u2588\u2551   \u2588\u2588\u2551\u255A\u2550\u2550\u2550\u2550\u2588\u2588\u2551"));
  lines.push(gD("   \u255A\u2588\u2588\u2588\u2588\u2554\u255D \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557    \u2588\u2588\u2551     \u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551"));
  lines.push(gD("    \u255A\u2550\u2550\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D    \u255A\u2550\u255D      \u255A\u2550\u2550\u2550\u2550\u2550\u255D  \u255A\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D"));
  lines.push(d(`  ${hLine("\u2500", 56)} v0.1.0`));
  lines.push("");
  lines.push(boxTop(W));
  lines.push(boxRow(
    gB("SYS") + d("://") + c(state.projectName) + d(" ".repeat(Math.max(0, 20 - state.projectName.length))) + d("\u2502 ") + d(dateStr) + d(" ") + g(timeStr),
    W
  ));
  if (state.projectScope && state.projectScope.purpose) {
    lines.push(sectionHeader("PROJECT SCOPE", W));
    lines.push(boxEmpty(W));
    lines.push(boxRow(d("PURPOSE ") + c("> ") + state.projectScope.purpose, W));
    if (state.projectScope.inScope.length > 0) {
      lines.push(boxRow(d("IN      ") + state.projectScope.inScope.map((i) => g("[") + gB("+") + g("] ") + i).join(d(" | ")), W));
    }
    if (state.projectScope.outOfScope.length > 0) {
      lines.push(boxRow(d("OUT     ") + state.projectScope.outOfScope.map((i) => r("[") + r("x") + r("] ") + d(i)).join(d(" | ")), W));
    }
    if (state.projectScope.boundaries.length > 0) {
      lines.push(boxRow(d("BOUNDS  ") + state.projectScope.boundaries.map((i) => y("~ ") + d(i)).join(d(" | ")), W));
    }
  }
  const activeWorkers = getAllActiveWorkers(state);
  if (activeWorkers.length > 0) {
    lines.push(sectionHeader("ACTIVE WORKERS", W));
    lines.push(boxEmpty(W));
    for (const { worker: worker2, task: wTask } of activeWorkers) {
      const { met: wMet, total: wTotal } = criteriaProgress(wTask);
      const wPct = wTotal > 0 ? Math.round(wMet / wTotal * 100) : 0;
      lines.push(boxRow(
        cB(worker2.padEnd(12)) + d("\u2192 ") + gB(wTask.id) + d(" ") + wTask.title.slice(0, 25) + d("  ") + g(`${wPct}%`),
        W
      ));
    }
  }
  lines.push(sectionHeader("ACTIVE TASK", W));
  lines.push(boxEmpty(W));
  if (active) {
    const { met, total: critTotal } = criteriaProgress(active);
    const elapsed = active.startedAt ? elapsedMinutes(active.startedAt) : 0;
    const percent = critTotal > 0 ? Math.round(met / critTotal * 100) : 0;
    const workerTag = active.worker ? d(` [${active.worker}]`) : "";
    lines.push(boxRow(gB(">> ") + b(active.id.toUpperCase()) + d(" :: ") + cB(active.title) + workerTag, W));
    lines.push(boxRow(
      d("   ELAPSED ") + g(formatDuration(elapsed).padEnd(8)) + d("SWITCHES ") + (active.switchCount > 0 ? r(String(active.switchCount)) : g("0")) + d("   STATUS ") + gB("RUNNING"),
      W
    ));
    if (critTotal > 0) {
      lines.push(boxEmpty(W));
      lines.push(boxRow(d("   CRITERIA ") + progressBar(percent, 25) + " " + gB(`${percent}%`) + d(` (${met}/${critTotal})`), W));
      for (const cr of active.acceptanceCriteria) {
        const icon = cr.met ? gB(" [PASS] ") : y(" [    ] ");
        const text = cr.met ? d(cr.text) : cr.text;
        lines.push(boxRow("  " + icon + text, W));
      }
    }
  } else if (activeWorkers.length > 0) {
    lines.push(boxRow(d(">> ") + d("No default active task") + d("  |  ") + c("Workers active above"), W));
  } else {
    lines.push(boxRow(y(">> ") + d("NO ACTIVE TASK") + d("   |   ") + d("run ") + c("vf start <id>") + d(" to begin"), W));
  }
  lines.push(sectionHeader("TASK PIPELINE", W));
  lines.push(boxEmpty(W));
  if (total === 0) {
    lines.push(boxRow(d("   (empty) ") + d("run ") + c('vf add "..."') + d(" to create tasks"), W));
  } else {
    lines.push(boxRow(
      d("   ST  ID    TASK" + " ".repeat(26) + "CRIT    PROG"),
      W
    ));
    lines.push(boxRow(d("   " + hLine("\u2500", W - 8)), W));
    const visibleTasks = state.tasks.filter((t) => t.status !== "abandoned");
    for (const t of visibleTasks) {
      const { met, total: ct } = criteriaProgress(t);
      const icon = t.status === "active" ? gB("\u25B6") : t.status === "done" ? d("\u2713") : y("\u25CB");
      const idStr = (t.status === "active" ? gB : t.status === "done" ? d : y)(t.id.padEnd(6));
      const titleRaw = t.title.length > 27 ? t.title.slice(0, 24) + "..." : t.title;
      const titleStr = t.status === "active" ? cB(titleRaw.padEnd(27)) : t.status === "done" ? d(titleRaw.padEnd(27)) : titleRaw.padEnd(27);
      const critStr = ct > 0 ? `${met}/${ct}`.padEnd(8) : d("--".padEnd(8));
      let progStr = "";
      if (ct > 0) {
        const pct = Math.round(met / ct * 100);
        const mini = Math.round(pct / 10);
        progStr = g("\u2593".repeat(mini)) + gD("\u2591".repeat(10 - mini));
      } else {
        progStr = d("\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
      }
      lines.push(boxRow(`   ${icon} ${idStr}${titleStr}${critStr}${progStr}`, W));
    }
  }
  lines.push(sectionHeader("FOCUS METRICS", W));
  lines.push(boxEmpty(W));
  const scoreText = scoreLabel(score).toUpperCase();
  const scoreColor2 = score >= 70 ? gB : score >= 50 ? y : r;
  lines.push(boxRow(
    d("   SCORE    ") + scoreGraph(score) + " " + scoreColor2(b(String(score).padStart(3))) + d("/100") + "  " + scoreColor2(scoreText),
    W
  ));
  lines.push(boxRow(
    d("   TODAY    ") + g("\u25B2") + d(" completed:") + gB(String(todayCompleted).padStart(2)) + d("   ") + y("\u25C6") + d(" switches:") + (todaySwitches > 0 ? r : g)(String(todaySwitches).padStart(2)) + d("   ") + c("\u25CF") + d(" done:") + c(`${doneTasks.length}/${total}`),
    W
  ));
  if (state.focusEvents.length > 0) {
    lines.push(boxRow(
      d("   ACTIVITY ") + sparkline(state.focusEvents) + d("  ") + d("\u25B2start ") + cB("\u25CFdone ") + y("\u25C6switch") + r(" !force"),
      W
    ));
  }
  lines.push(sectionHeader("VIBETEAMZ", W));
  lines.push(boxEmpty(W));
  try {
    if (isCloudLinked()) {
      const cloudCfg = readCloudConfig();
      const cache = readCloudCache(60 * 60 * 1e3);
      if (cache) {
        if (cache.team && cache.team.length > 0) {
          const onlineTeam = cache.team.filter((t) => {
            const ageMs = Date.now() - new Date(t.last_heartbeat).getTime();
            return ageMs < 60 * 60 * 1e3;
          });
          if (onlineTeam.length > 0) {
            const teamNames = onlineTeam.map((t) => {
              const name = t.profiles?.username ?? t.user_id.slice(0, 8);
              const icon = t.status === "active" ? gB("\u25CF") : y("\u25D0");
              return icon + " " + c(name);
            }).join(d("  "));
            lines.push(boxRow(d("   TEAM    ") + teamNames, W));
            lines.push(boxEmpty(W));
          }
        }
      }
      const pid = cloudCfg.projectId;
      const bearerToken = cloudCfg.apiKey ?? cloudCfg.accessToken;
      if (pid && bearerToken) {
        const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${bearerToken}` };
        const baseUrl = cloudCfg.apiUrl;
        let allTasks = [];
        let milestones = [];
        try {
          const [tasksResp, msResp] = await Promise.all([
            fetch(`${baseUrl}/api/projects/${pid}/tasks`, { headers, signal: AbortSignal.timeout(8e3) }),
            fetch(`${baseUrl}/api/projects/${pid}/milestones`, { headers, signal: AbortSignal.timeout(8e3) })
          ]);
          if (tasksResp.ok) allTasks = await tasksResp.json();
          if (msResp.ok) {
            const msBody = await msResp.json();
            milestones = Array.isArray(msBody) ? msBody : msBody.milestones ?? [];
          }
        } catch {
        }
        if (allTasks.length > 0) {
          const msMap = /* @__PURE__ */ new Map();
          for (const ms of milestones) msMap.set(ms.id, ms);
          const byMs = /* @__PURE__ */ new Map();
          for (const t of allTasks) {
            const key = t.milestone_id;
            if (!byMs.has(key)) byMs.set(key, []);
            byMs.get(key).push(t);
          }
          const msKeys = [...byMs.keys()].sort((a, b6) => {
            if (a === null) return 1;
            if (b6 === null) return -1;
            return 0;
          });
          for (const msId of msKeys) {
            const group = byMs.get(msId);
            const doneN = group.filter((t) => t.status === "done").length;
            const totalN = group.length;
            const pct = totalN > 0 ? Math.round(doneN / totalN * 100) : 0;
            const msTitle = msId ? msMap.get(msId)?.title ?? msId.slice(0, 8) : "Backlog";
            const msIcon = msId ? y("\u25C9") : d("\u2261");
            const barW = 12;
            const filled = totalN > 0 ? Math.round(doneN / totalN * barW) : 0;
            const bar = y("\u2588".repeat(filled)) + d("\u2591".repeat(barW - filled));
            lines.push(boxRow(
              "   " + msIcon + " " + b(msTitle.length > 20 ? msTitle.slice(0, 17) + "..." : msTitle).padEnd(20) + " " + bar + " " + d(`${doneN}/${totalN}`) + " " + (pct > 0 ? y(`${pct}%`) : d("0%")),
              W
            ));
            const openTasks = group.filter((t) => t.status !== "done");
            for (const t of openTasks) {
              const icon = t.status === "in_progress" ? c("\u25D0") : "\u25CB";
              const title = t.title.length > 32 ? t.title.slice(0, 29) + "..." : t.title;
              const owner = t.assigned_to === cloudCfg.userId ? d(" @you") : "";
              lines.push(boxRow("      " + icon + " " + title + owner, W));
            }
          }
          lines.push(boxEmpty(W));
          const totalAll = allTasks.length;
          const totalDone = allTasks.filter((t) => t.status === "done").length;
          lines.push(boxRow(d(`   ${totalDone}/${totalAll} tasks done \xB7 ${milestones.length} milestone${milestones.length !== 1 ? "s" : ""}`), W));
        } else {
          lines.push(boxRow(d("   No tasks yet."), W));
        }
      }
      if (cache?.suggestions && cache.suggestions.length > 0) {
        lines.push(boxEmpty(W));
        for (const s of cache.suggestions.slice(0, 2)) {
          const urgIcon = s.urgency === "high" ? r("!") : s.urgency === "medium" ? y("~") : d("\xB7");
          const msg = s.message.length > 45 ? s.message.slice(0, 42) + "..." : s.message;
          lines.push(boxRow("   " + urgIcon + " " + d(msg), W));
        }
      }
    } else {
      lines.push(boxRow(
        d("   STATUS  ") + y("\u2665") + d(" not linked") + d("   run ") + c("vf setup") + d(" to connect"),
        W
      ));
    }
  } catch {
    lines.push(boxRow(d("   ") + d("\u2665 offline"), W));
  }
  const recent = state.focusEvents.slice(-5).reverse();
  if (recent.length > 0) {
    lines.push(sectionHeader("EVENT LOG", W));
    lines.push(boxEmpty(W));
    for (const e of recent) {
      const time = new Date(e.timestamp).toLocaleTimeString("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
      const icon = e.type === "start" ? gB(">>>") : e.type === "complete" ? cB("[+]") : e.type === "abandon" ? r("[x]") : e.type === "switch_away" ? y("[~]") : e.type === "switch_to" ? c("[>]") : r("[!]");
      const label = e.type === "start" ? "STARTED" : e.type === "complete" ? "COMPLETED" : e.type === "abandon" ? "ABANDONED" : e.type === "switch_away" ? "SWITCH_OUT" : e.type === "switch_to" ? "SWITCH_IN" : "OVERRIDE";
      lines.push(boxRow(
        d("   ") + d(time) + " " + icon + " " + d(label.padEnd(12)) + c(e.taskId),
        W
      ));
    }
  }
  lines.push(sectionHeader("COMMANDS", W));
  lines.push(boxEmpty(W));
  if (active) {
    lines.push(boxRow(d("   ") + g("$") + c(" vf check <id>") + d("  mark criteria as met"), W));
    lines.push(boxRow(d("   ") + g("$") + c(" vf done") + d("        complete current task"), W));
    lines.push(boxRow(d("   ") + g("$") + c(" vf prompt") + d("      generate focused prompt"), W));
    lines.push(boxRow(d("   ") + g("$") + c(" vf scope --rules") + d(" write .claude/rules/"), W));
  } else if (backlogTasks.length > 0) {
    const next = backlogTasks[0];
    lines.push(boxRow(d("   ") + g("$") + c(` vf start ${next.id}`) + d(`    start "${next.title}"`), W));
  } else {
    lines.push(boxRow(d("   ") + g("$") + c(' vf add "..."') + d("   add your first task"), W));
  }
  lines.push(boxEmpty(W));
  lines.push(boxBot(W));
  lines.push("");
  console.log(lines.join("\n"));
  updateState((s) => ({ ...s, workerMeta: stampWorkerMeta(s, workerKey) }));
});

// src/commands/list.ts
import chalk7 from "chalk";
import { Command as Command8 } from "commander";
var listCommand = new Command8("list").description("List all tasks").option("--status <status>", "Filter by status").option("--all", "Include abandoned tasks").option("--json", "Output as JSON").action((opts) => {
  const state = readState();
  let tasks = state.tasks;
  if (opts.status) {
    tasks = tasks.filter((t) => t.status === opts.status);
  } else if (!opts.all) {
    tasks = tasks.filter((t) => t.status !== "abandoned");
  }
  if (opts.json) {
    console.log(JSON.stringify(tasks, null, 2));
    return;
  }
  if (tasks.length === 0) {
    console.log(chalk7.dim('No tasks. Run "vf add" to create one.'));
    return;
  }
  const groups = {};
  for (const t of tasks) {
    (groups[t.status] ??= []).push(t);
  }
  const order = ["active", "backlog", "done", "abandoned"];
  for (const status of order) {
    const group = groups[status];
    if (!group || group.length === 0) continue;
    const label = status === "active" ? chalk7.green.bold("Active") : status === "backlog" ? chalk7.yellow.bold("Backlog") : status === "done" ? chalk7.gray.bold("Done") : chalk7.red.bold("Abandoned");
    console.log(`
 ${label}:`);
    for (const t of group) {
      const { met, total } = criteriaProgress(t);
      const prefix = t.id === state.activeTaskId ? chalk7.green(">") : " ";
      const id = chalk7.dim(t.id);
      const criteria = total > 0 ? chalk7.dim(` ${met}/${total}`) : "";
      let elapsed = "";
      if (t.status === "active" && t.startedAt) {
        elapsed = chalk7.dim(` ${formatDuration(elapsedMinutes(t.startedAt))}`);
      }
      const deps = t.dependencies.length > 0 ? chalk7.dim(` depends: ${t.dependencies.join(", ")}`) : "";
      const workerTag = t.worker ? chalk7.cyan(` [${t.worker}]`) : "";
      console.log(`  ${prefix} ${id}  ${t.title}${criteria}${elapsed}${deps}${workerTag}`);
    }
  }
  const done = state.tasks.filter((t) => t.status === "done").length;
  console.log(
    chalk7.dim(`
 Total: ${state.tasks.length} tasks (${done} done, ${state.tasks.length - done} remaining)`)
  );
});

// src/commands/switch.ts
import { Command as Command9 } from "commander";
var switchCommand = new Command9("switch").description("Switch to a different task (Focus Guardian will push back!)").argument("<id>", "Target task ID").option("--force", "Override guardian pushback").option("--yolo", "Override even strong pushback").option("--reason <reason>", "Reason for switching").option("--worker <name>", "Switch within a specific worker/tab").action((id, opts) => {
  let state = readState();
  const target = getTask(state, id);
  const worker = resolveWorker(opts);
  const workerKey = worker ?? "__default__";
  const changes = detectChanges(state, workerKey);
  printChangeBanner(changes);
  if (!target) {
    error(`Task ${id} not found.`);
    return;
  }
  if (target.status === "done") {
    error(`Task ${id} is already done.`);
    return;
  }
  const active = resolveActiveTask(state, worker);
  if (!active) {
    info('No active task. Use "vf start" instead.');
    return;
  }
  if (active.id === id) {
    info(`Already working on ${id}.`);
    return;
  }
  if (!opts.force && !opts.yolo) {
    const response = evaluateSwitch(state, active, id);
    printGuardian(response);
    return;
  }
  const timestamp = now();
  state = updateTask(state, active.id, {
    status: "backlog",
    switchCount: active.switchCount + 1,
    worker: null
  });
  state = updateTask(state, id, {
    status: "active",
    startedAt: target.startedAt ?? timestamp,
    worker: worker ?? null
  });
  const newWorkers = { ...state.activeWorkers };
  if (worker) {
    newWorkers[worker] = id;
  }
  state = {
    ...state,
    activeTaskId: worker ? state.activeTaskId : id,
    activeWorkers: newWorkers,
    currentSession: { taskId: id, startedAt: timestamp, endedAt: null },
    focusEvents: [
      ...state.focusEvents,
      { type: "switch_away", taskId: active.id, timestamp, details: opts.reason, worker: workerKey },
      { type: "pushback_override", taskId: active.id, timestamp, worker: workerKey },
      { type: "switch_to", taskId: id, timestamp, worker: workerKey }
    ]
  };
  state.workerMeta = stampWorkerMeta(state, workerKey);
  writeState(state);
  success(`Switched from ${active.id} to ${id}` + (worker ? ` [worker: ${worker}]` : ""));
  if (opts.reason) {
    console.log(`  Reason: ${opts.reason}`);
  }
  const updated = state.tasks.find((t) => t.id === id);
  printFocusCard(updated);
});

// src/commands/abandon.ts
import { Command as Command10 } from "commander";
var abandonCommand = new Command10("abandon").description("Abandon the current active task").option("--reason <reason>", "Reason for abandoning").option("--backlog", "Move back to backlog instead of abandoning").option("--worker <name>", "Abandon the task for a specific worker/tab").action((opts) => {
  let state = readState();
  const worker = resolveWorker(opts);
  const workerKey = worker ?? "__default__";
  const task = resolveActiveTask(state, worker);
  const changes = detectChanges(state, workerKey);
  printChangeBanner(changes);
  if (!task) {
    error(worker ? `No active task for worker "${worker}".` : "No active task to abandon.");
    return;
  }
  const timestamp = now();
  const newStatus = opts.backlog ? "backlog" : "abandoned";
  state = updateTask(state, task.id, {
    status: newStatus,
    abandonedAt: opts.backlog ? null : timestamp,
    abandonReason: opts.reason ?? null,
    worker: null
  });
  state = {
    ...state,
    ...cleanupWorkers(state, task.id, worker),
    currentSession: null,
    focusEvents: [
      ...state.focusEvents,
      {
        type: "abandon",
        taskId: task.id,
        timestamp,
        details: opts.reason,
        worker: workerKey
      }
    ]
  };
  state.workerMeta = stampWorkerMeta(state, workerKey);
  writeState(state);
  fireDiscordEvent({ type: "task_abandoned", taskId: task.id, taskTitle: task.title, worker: workerKey });
  if (!opts.backlog) {
    logTaskAbandoned(task.id, task.title, workerKey, opts.reason);
  }
  if (opts.backlog) {
    success(`Task ${task.id} moved back to backlog: "${task.title}"`);
  } else {
    success(`Abandoned ${task.id}: "${task.title}"`);
    if (opts.reason) console.log(`  Reason: ${opts.reason}`);
  }
  const backlog = state.tasks.filter((t) => t.status === "backlog");
  if (backlog.length > 0) {
    console.log("");
    info(`Next up: ${backlog[0].id} - ${backlog[0].title}`);
    info(`Run "vf start ${backlog[0].id}" to continue.`);
  }
});

// src/commands/check.ts
import { Command as Command11 } from "commander";
import chalk8 from "chalk";
var checkCommand = new Command11("check").description("Mark acceptance criteria as met on the active task").argument("[criteria-ids...]", "Criterion IDs to check (e.g. t1-c1 t1-c2)").option("--all", "Mark all criteria as met").option("--worker <name>", "Check criteria for a specific worker/tab").action((criteriaIds, opts) => {
  let state = readState();
  const worker = resolveWorker(opts);
  const workerKey = worker ?? "__default__";
  const task = resolveActiveTask(state, worker);
  const changes = detectChanges(state, workerKey);
  printChangeBanner(changes);
  if (!task) {
    error('No active task. Use "vf start <id>" first.');
    return;
  }
  if (task.acceptanceCriteria.length === 0) {
    info("This task has no acceptance criteria.");
    return;
  }
  if (opts.all) {
    criteriaIds = task.acceptanceCriteria.map((c7) => c7.id);
  }
  if (criteriaIds.length === 0) {
    console.log(chalk8.bold(`Criteria for ${task.id}: "${task.title}"`));
    console.log("");
    for (const c7 of task.acceptanceCriteria) {
      const icon = c7.met ? chalk8.green("[\u2713]") : chalk8.gray("[ ]");
      console.log(`  ${icon} ${chalk8.dim(c7.id)} ${c7.text}`);
    }
    console.log("");
    info('Use "vf check <id>" to mark criteria as met.');
    info('Use "vf check --all" to mark all as met.');
    return;
  }
  const updatedCriteria = task.acceptanceCriteria.map((c7) => ({
    ...c7,
    met: criteriaIds.includes(c7.id) ? true : c7.met
  }));
  state = updateTask(state, task.id, { acceptanceCriteria: updatedCriteria });
  state.workerMeta = stampWorkerMeta(state, workerKey);
  writeState(state);
  fireHeartbeat();
  const checked = criteriaIds.filter(
    (id) => task.acceptanceCriteria.some((c7) => c7.id === id)
  );
  const met = updatedCriteria.filter((c7) => c7.met).length;
  const total = updatedCriteria.length;
  fireCloudActivity({ type: "criterion_checked", message: `Checked ${checked.length} criteria on ${task.id}` });
  fireDiscordEvent({
    type: "criterion_checked",
    taskId: task.id,
    taskTitle: task.title,
    worker: workerKey,
    progress: `${met}/${total}`
  });
  success(`Checked ${checked.length} criteria (${met}/${total} total)`);
  if (met === total) {
    console.log("");
    info('All criteria met! Run "vf done" to complete the task.');
  }
});

// src/commands/scope.ts
import fs5 from "fs";
import path8 from "path";
import chalk9 from "chalk";
import { Command as Command12 } from "commander";
var MARKER_START = "<!-- vibe-focus:start -->";
var MARKER_END = "<!-- vibe-focus:end -->";
var scopeCommand = new Command12("scope").description("Define project scope or generate rules for your AI agent").option("--define", "Interactively define or update project scope").option("--purpose <purpose>", "Set project purpose").option("--in <items...>", "Add items to in-scope").option("--out <items...>", "Add items to out-of-scope").option("--boundary <items...>", "Add scope boundaries").option("--show", "Show current project scope").option("--rules", "Write rules file for AI agent").option("--claude-md", "Append to CLAUDE.md").option("--agent <type>", "AI agent type: claude, cursor, copilot, windsurf, generic").action((opts) => {
  let state = readState();
  const agent = resolveAgent(opts.agent);
  const agentConfig = AGENT_CONFIGS[agent];
  if (opts.show || !opts.define && !opts.purpose && !opts.in && !opts.out && !opts.boundary && !opts.rules && !opts.claudeMd) {
    if (!state.projectScope) {
      info("No project scope defined yet.");
      info('Run "vf scope --define" to set it up.');
      console.log("");
      info("Or set individual fields:");
      console.log('  vf scope --purpose "Build a task tracking CLI"');
      console.log('  vf scope --in "CLI commands" "State management"');
      console.log('  vf scope --out "Web UI" "Mobile app"');
      return;
    }
    console.log(chalk9.bold(`
Project Scope: ${state.projectName}`));
    console.log("");
    console.log(chalk9.cyan("Purpose:"));
    console.log(`  ${state.projectScope.purpose}`);
    if (state.projectScope.boundaries.length > 0) {
      console.log("");
      console.log(chalk9.cyan("Boundaries:"));
      for (const b6 of state.projectScope.boundaries) {
        console.log(`  - ${b6}`);
      }
    }
    if (state.projectScope.inScope.length > 0) {
      console.log("");
      console.log(chalk9.green("In Scope:"));
      for (const item of state.projectScope.inScope) {
        console.log(`  + ${item}`);
      }
    }
    if (state.projectScope.outOfScope.length > 0) {
      console.log("");
      console.log(chalk9.red("Out of Scope:"));
      for (const item of state.projectScope.outOfScope) {
        console.log(`  - ${item}`);
      }
    }
    if (opts.rules || opts.claudeMd) {
      const content = generateRulesMd(state);
      if (opts.rules) {
        writeAgentRules(content, agent);
      }
      if (opts.claudeMd) {
        appendClaudeMd(content);
      }
    }
    return;
  }
  if (!state.projectScope) {
    state = {
      ...state,
      projectScope: {
        purpose: "",
        boundaries: [],
        inScope: [],
        outOfScope: []
      }
    };
  }
  const scope = state.projectScope;
  if (opts.purpose) {
    scope.purpose = opts.purpose;
  }
  if (opts.in) {
    scope.inScope = [.../* @__PURE__ */ new Set([...scope.inScope, ...opts.in])];
  }
  if (opts.out) {
    scope.outOfScope = [.../* @__PURE__ */ new Set([...scope.outOfScope, ...opts.out])];
  }
  if (opts.boundary) {
    scope.boundaries = [.../* @__PURE__ */ new Set([...scope.boundaries, ...opts.boundary])];
  }
  state = { ...state, projectScope: scope };
  writeState(state);
  success("Project scope updated.");
  if (scope.purpose) console.log(`  Purpose: ${scope.purpose}`);
  if (scope.inScope.length > 0) console.log(`  In scope: ${scope.inScope.join(", ")}`);
  if (scope.outOfScope.length > 0) console.log(`  Out of scope: ${scope.outOfScope.join(", ")}`);
  if (opts.rules || opts.claudeMd) {
    const content = generateRulesMd(state);
    if (opts.rules) writeAgentRules(content, agent);
    if (opts.claudeMd) appendClaudeMd(content);
  }
});
function writeAgentRules(content, agent) {
  const config = AGENT_CONFIGS[agent];
  if (agent === "generic") {
    console.log("");
    console.log(content);
    console.log("");
    info("Copy the above rules into your AI agent's system prompt.");
    return;
  }
  if (agent === "copilot") {
    const filePath2 = path8.join(process.cwd(), config.rulesDir, config.rulesFile);
    appendWithMarkers(filePath2, content);
    success(`Written to ${config.rulesDir}/${config.rulesFile}`);
    return;
  }
  const dir = path8.join(process.cwd(), config.rulesDir);
  fs5.mkdirSync(dir, { recursive: true });
  const filePath = path8.join(dir, config.rulesFile);
  fs5.writeFileSync(filePath, content);
  success(`Written to ${filePath}`);
}
function appendWithMarkers(filePath, content) {
  const wrapped = `${MARKER_START}
${content}
${MARKER_END}`;
  if (fs5.existsSync(filePath)) {
    let existing = fs5.readFileSync(filePath, "utf-8");
    const startIdx = existing.indexOf(MARKER_START);
    const endIdx = existing.indexOf(MARKER_END);
    if (startIdx >= 0 && endIdx >= 0) {
      existing = existing.slice(0, startIdx) + wrapped + existing.slice(endIdx + MARKER_END.length);
    } else {
      existing += "\n\n" + wrapped;
    }
    fs5.writeFileSync(filePath, existing);
  } else {
    fs5.mkdirSync(path8.dirname(filePath), { recursive: true });
    fs5.writeFileSync(filePath, wrapped + "\n");
  }
}
function appendClaudeMd(content) {
  const filePath = path8.join(process.cwd(), "CLAUDE.md");
  appendWithMarkers(filePath, content);
  success(`Written to ${filePath}`);
}

// src/commands/prompt.ts
import { execSync as execSync2 } from "child_process";
import { Command as Command13 } from "commander";

// src/generators/prompt-template.ts
function generatePrompt(state, task, style = "detailed") {
  if (style === "concise") {
    return generateConcise(state, task);
  }
  if (style === "checklist") {
    return generateChecklist(state, task);
  }
  return generateDetailed(state, task);
}
function generateConcise(state, task) {
  const lines = [];
  lines.push(`Task: ${task.title}`);
  if (task.description) lines.push(task.description);
  if (task.acceptanceCriteria.length > 0) {
    lines.push("");
    lines.push("Criteria:");
    for (const c7 of task.acceptanceCriteria) {
      lines.push(`- ${c7.text}`);
    }
  }
  lines.push("");
  lines.push("Stay focused on this task only. Do not add unrelated changes.");
  return lines.join("\n");
}
function generateDetailed(state, task) {
  const lines = [];
  lines.push(`## Task: ${task.title}`);
  lines.push("");
  if (task.description) {
    lines.push(task.description);
    lines.push("");
  }
  if (state.projectScope) {
    lines.push(`### Project Context`);
    lines.push(`${state.projectScope.purpose}`);
    lines.push("");
  }
  if (task.acceptanceCriteria.length > 0) {
    lines.push("### Acceptance Criteria");
    for (const c7 of task.acceptanceCriteria) {
      lines.push(`- [ ] ${c7.text}`);
    }
    lines.push("");
  }
  lines.push("### Scope");
  lines.push("ONLY work on the task described above.");
  lines.push("Do NOT refactor unrelated code.");
  lines.push("Do NOT add features not in the criteria.");
  lines.push("Do NOT start other tasks.");
  lines.push("");
  lines.push("If you encounter something that should be fixed");
  lines.push("but is outside this scope, note it as a TODO");
  lines.push("comment and move on.");
  if (state.projectScope?.outOfScope && state.projectScope.outOfScope.length > 0) {
    lines.push("");
    lines.push("Explicitly out of scope:");
    for (const item of state.projectScope.outOfScope) {
      lines.push(`- ${item}`);
    }
  }
  lines.push("");
  lines.push("### When done");
  lines.push("Confirm each acceptance criterion is met");
  lines.push("and explain how it was verified.");
  return lines.join("\n");
}
function generateChecklist(state, task) {
  const lines = [];
  lines.push(`# ${task.title}`);
  lines.push("");
  if (task.description) {
    lines.push(task.description);
    lines.push("");
  }
  lines.push("## Checklist");
  for (const c7 of task.acceptanceCriteria) {
    lines.push(`- [ ] ${c7.text}`);
  }
  lines.push("- [ ] All criteria verified");
  lines.push("- [ ] No unrelated changes introduced");
  lines.push("- [ ] Code is within project scope");
  lines.push("");
  lines.push("## Rules");
  lines.push("- Work through the checklist top to bottom");
  lines.push("- Do not skip ahead or work on other things");
  lines.push("- Mark each item done as you complete it");
  return lines.join("\n");
}

// src/commands/prompt.ts
function copyToClipboard(text) {
  const commands = ["pbcopy", "xclip -selection clipboard", "xsel --clipboard --input", "clip.exe"];
  for (const cmd of commands) {
    try {
      execSync2(cmd.split(" ")[0], { input: text, stdio: ["pipe", "ignore", "ignore"] });
      return true;
    } catch {
      continue;
    }
  }
  return false;
}
var promptCommand = new Command13("prompt").description("Generate a focused AI agent prompt for the current task").option("--style <style>", "Prompt style: concise, detailed, checklist", "detailed").option("--agent <type>", "AI agent type: claude, copilot, cursor, generic").action((opts) => {
  const state = readState();
  const task = getActiveTask(state);
  const agent = resolveAgent(opts.agent);
  const config = AGENT_CONFIGS[agent];
  if (!task) {
    error('No active task. Use "vf start <id>" first.');
    return;
  }
  const prompt = generatePrompt(state, task, opts.style);
  console.log("");
  info(`Generated prompt for: ${task.id} - ${task.title}`);
  info(`Agent: ${config.displayName}`);
  console.log("");
  console.log("\u2500".repeat(50));
  console.log(prompt);
  console.log("\u2500".repeat(50));
  console.log("");
  if (copyToClipboard(prompt)) {
    success("Copied to clipboard.");
  } else {
    info(`Copy the prompt above into your ${config.displayName} session.`);
  }
});

// src/commands/dash.ts
import { execSync as execSync3 } from "child_process";
import chalk10 from "chalk";
import { Command as Command14 } from "commander";
function generatePromptSync(state, task) {
  return generatePrompt(state, task, "detailed");
}
var g2 = chalk10.green;
var gB2 = chalk10.greenBright;
var gD2 = chalk10.dim.green;
var c2 = chalk10.cyan;
var cB2 = chalk10.cyanBright;
var y2 = chalk10.yellow;
var rr = chalk10.red;
var dd = chalk10.dim;
var bb = chalk10.bold;
function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}
function boxTop2(w) {
  return gD2("\u2554" + "\u2550".repeat(w - 2) + "\u2557");
}
function boxBot2(w) {
  return gD2("\u255A" + "\u2550".repeat(w - 2) + "\u255D");
}
function boxRow2(content, w) {
  const vis = stripAnsi(content);
  const p = Math.max(0, w - 4 - vis);
  return gD2("\u2551") + " " + content + " ".repeat(p) + " " + gD2("\u2551");
}
function boxEmpty2(w) {
  return gD2("\u2551") + " ".repeat(w - 2) + gD2("\u2551");
}
function section(label, w) {
  const rem = w - 6 - label.length - 4;
  return gD2("\u2560\u2500\u2500") + " " + gB2(label) + " " + gD2("\u2500".repeat(Math.max(1, rem)) + "\u2563");
}
function progressBar2(pct, w = 20) {
  const f = Math.round(pct / 100 * w);
  return g2("[") + gB2("\u2588".repeat(f)) + gD2("\u2591".repeat(w - f)) + g2("]");
}
function scoreGraph2(score) {
  const w = 15;
  const f = Math.round(score / 100 * w);
  const color = score >= 70 ? gB2 : score >= 50 ? y2 : rr;
  return g2("[") + color("\u2593".repeat(f)) + gD2("\u2591".repeat(w - f)) + g2("]");
}
function render(state, ds) {
  const W2 = Math.min(72, process.stdout.columns || 72);
  const lines = [];
  const active = getActiveTask(state);
  const visibleTasks = state.tasks.filter((t) => t.status !== "abandoned");
  const score = calculateDailyScore(state);
  const nowDate = /* @__PURE__ */ new Date();
  const timeStr = nowDate.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  lines.push(gB2("  \u250C\u2500\u2510\u250C\u2500\u2510\u250C\u2500\u2510\u250C\u2500\u2510  \u250C\u2500\u2510\u250C\u2500\u2510\u250C\u2500\u2510\u250C\u2500\u2510\u250C\u2500\u2510"));
  lines.push(gB2("  \u2514\u2510\u2518\u251C\u2500\u2524\u251C\u2524 \u251C\u2524   \u251C\u2524 \u2502 \u2502\u2502  \u2502 \u2502\u2502\u2514\u2500"));
  lines.push(gD2("   \u2514 \u2514\u2500\u2518\u2514\u2500\u2518\u2514\u2500\u2518  \u2514  \u2514\u2500\u2518\u2514\u2500\u2518\u2514\u2500\u2518\u2514\u2500\u2500\u2518") + dd("  " + timeStr));
  lines.push("");
  lines.push(boxTop2(W2));
  lines.push(boxRow2(
    gB2("SYS") + dd("://") + c2(state.projectName) + dd(" ".repeat(Math.max(1, W2 - 30 - state.projectName.length))) + dd("SCORE ") + scoreGraph2(score) + " " + (score >= 70 ? gB2 : score >= 50 ? y2 : rr)(bb(String(score))),
    W2
  ));
  lines.push(section("ACTIVE TASK", W2));
  if (active) {
    const { met, total } = criteriaProgress(active);
    const elapsed = active.startedAt ? elapsedMinutes(active.startedAt) : 0;
    const pct = total > 0 ? Math.round(met / total * 100) : 0;
    lines.push(boxRow2(gB2(">> ") + bb(active.id.toUpperCase()) + dd(" :: ") + cB2(active.title), W2));
    lines.push(boxRow2(
      dd("   ELAPSED ") + g2(formatDuration(elapsed).padEnd(6)) + dd(" SWITCHES ") + (active.switchCount > 0 ? rr(String(active.switchCount)) : g2("0")) + dd("  ") + progressBar2(pct, 15) + " " + gB2(`${pct}%`),
      W2
    ));
    if (total > 0 && ds.panel === "criteria") {
      lines.push(boxEmpty2(W2));
      active.acceptanceCriteria.forEach((cr, i) => {
        const sel = ds.critCursor === i ? cB2("> ") : "  ";
        const icon = cr.met ? gB2("[PASS]") : y2("[    ]");
        const text = cr.met ? dd(cr.text) : cr.text;
        const highlight = ds.critCursor === i && ds.panel === "criteria" ? chalk10.bgGray : (s) => s;
        lines.push(boxRow2(highlight(sel + icon + " " + text), W2));
      });
    } else if (total > 0) {
      lines.push(boxRow2(
        dd("   ") + active.acceptanceCriteria.map(
          (cr) => cr.met ? gB2("[\u2713]") : dd("[ ]")
        ).join(" ") + dd(` ${met}/${total}`),
        W2
      ));
    }
  } else {
    lines.push(boxRow2(y2(">>") + dd(" NO ACTIVE TASK  ") + dd("press ") + c2("ENTER") + dd(" on a task to start"), W2));
  }
  lines.push(section(ds.panel === "tasks" ? "TASK PIPELINE  [navigate]" : "TASK PIPELINE", W2));
  lines.push(boxEmpty2(W2));
  if (visibleTasks.length === 0) {
    lines.push(boxRow2(dd("   (empty)"), W2));
  } else {
    visibleTasks.forEach((t, i) => {
      const { met, total: ct } = criteriaProgress(t);
      const isSelected = ds.panel === "tasks" && ds.taskCursor === i;
      const cursor = isSelected ? cB2("> ") : "  ";
      const icon = t.status === "active" ? gB2("\u25B6") : t.status === "done" ? dd("\u2713") : y2("\u25CB");
      const idStr = (t.status === "active" ? gB2 : t.status === "done" ? dd : y2)(t.id.padEnd(5));
      const maxTitle = W2 - 30;
      const titleRaw = t.title.length > maxTitle ? t.title.slice(0, maxTitle - 3) + "..." : t.title;
      const titleStr = t.status === "active" ? cB2(titleRaw.padEnd(maxTitle)) : t.status === "done" ? chalk10.strikethrough.dim(titleRaw.padEnd(maxTitle)) : titleRaw.padEnd(maxTitle);
      const critStr = ct > 0 ? dd(`${met}/${ct}`) : dd("--");
      let miniBar2 = "";
      if (ct > 0) {
        const p = Math.round(met / ct * 5);
        miniBar2 = g2("\u2593".repeat(p)) + gD2("\u2591".repeat(5 - p));
      }
      const highlight = isSelected ? chalk10.bgGray : (s) => s;
      lines.push(boxRow2(highlight(cursor + icon + " " + idStr + titleStr + critStr + " " + miniBar2), W2));
    });
  }
  lines.push(section("KEYS", W2));
  lines.push(boxRow2(
    dd("  ") + g2("\u2191\u2193") + dd(" navigate  ") + g2("ENTER") + dd(" start/select  ") + g2("SPACE") + dd(" check  ") + g2("d") + dd(" done  ") + g2("q") + dd(" quit"),
    W2
  ));
  lines.push(boxRow2(
    dd("  ") + g2("TAB") + dd(" switch panel  ") + g2("a") + dd(" abandon  ") + g2("p") + dd(" prompt  ") + g2("r") + dd(" refresh"),
    W2
  ));
  if (ds.message) {
    lines.push(section("", W2));
    lines.push(boxRow2(dd("  ") + ds.messageColor(ds.message), W2));
  }
  lines.push(boxBot2(W2));
  return lines.join("\n");
}
function startInteractive() {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    console.log(chalk10.red("Interactive dashboard requires a TTY terminal."));
    console.log(chalk10.dim('Use "vf status" for non-interactive view.'));
    process.exit(1);
  }
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  let appState = readState();
  const visibleTasks = () => appState.tasks.filter((t) => t.status !== "abandoned");
  const ds = {
    panel: "tasks",
    taskCursor: 0,
    critCursor: 0,
    message: "",
    messageColor: dd,
    messageTimeout: null
  };
  function flash(msg, color = g2, duration = 3e3) {
    ds.message = msg;
    ds.messageColor = color;
    if (ds.messageTimeout) clearTimeout(ds.messageTimeout);
    ds.messageTimeout = setTimeout(() => {
      ds.message = "";
      draw();
    }, duration);
  }
  function draw() {
    appState = readState();
    const output = render(appState, ds);
    process.stdout.write("\x1B[2J\x1B[H");
    process.stdout.write(output + "\n");
  }
  const refreshTimer = setInterval(draw, 3e4);
  function cleanup() {
    clearInterval(refreshTimer);
    if (ds.messageTimeout) clearTimeout(ds.messageTimeout);
    stdin.setRawMode(false);
    stdin.pause();
    process.stdout.write("\x1B[?25h");
    console.log(gD2("\nvibe-focus dashboard closed.\n"));
  }
  process.stdout.write("\x1B[?25l");
  stdin.on("data", (key) => {
    const tasks = visibleTasks();
    const active = getActiveTask(appState);
    if (key === "" || key === "q" || key === "Q") {
      cleanup();
      process.exit(0);
    }
    if (key === "	") {
      if (active && active.acceptanceCriteria.length > 0) {
        ds.panel = ds.panel === "tasks" ? "criteria" : "tasks";
        ds.critCursor = 0;
        flash(ds.panel === "criteria" ? "PANEL: Criteria" : "PANEL: Tasks", c2);
      }
      draw();
      return;
    }
    if (key === "\x1B[A") {
      if (ds.panel === "tasks" && ds.taskCursor > 0) {
        ds.taskCursor--;
      } else if (ds.panel === "criteria" && ds.critCursor > 0) {
        ds.critCursor--;
      }
      draw();
      return;
    }
    if (key === "\x1B[B") {
      if (ds.panel === "tasks" && ds.taskCursor < tasks.length - 1) {
        ds.taskCursor++;
      } else if (ds.panel === "criteria" && active) {
        if (ds.critCursor < active.acceptanceCriteria.length - 1) {
          ds.critCursor++;
        }
      }
      draw();
      return;
    }
    if (key === "\r" || key === "\n") {
      if (ds.panel === "tasks" && tasks.length > 0) {
        const target = tasks[ds.taskCursor];
        if (!target) {
          draw();
          return;
        }
        if (target.status === "done") {
          flash("Task already done.", y2);
          draw();
          return;
        }
        if (active && active.id === target.id) {
          if (active.acceptanceCriteria.length > 0) {
            ds.panel = "criteria";
            ds.critCursor = 0;
            flash("PANEL: Criteria - use SPACE to check", c2);
          }
          draw();
          return;
        }
        if (active && active.id !== target.id) {
          const response = evaluateSwitch(appState, active, target.id);
          flash(`GUARDIAN: ${response.message}`, rr, 5e3);
          draw();
          return;
        }
        const timestamp = now();
        appState = updateTask(appState, target.id, {
          status: "active",
          startedAt: target.startedAt ?? timestamp
        });
        appState = {
          ...appState,
          activeTaskId: target.id,
          currentSession: { taskId: target.id, startedAt: timestamp, endedAt: null },
          focusEvents: [
            ...appState.focusEvents,
            { type: "start", taskId: target.id, timestamp }
          ]
        };
        writeState(appState);
        flash(`STARTED: ${target.title}`, gB2);
      }
      draw();
      return;
    }
    if (key === " ") {
      if (ds.panel === "criteria" && active) {
        const cr = active.acceptanceCriteria[ds.critCursor];
        if (cr) {
          const updated = active.acceptanceCriteria.map(
            (c7, i) => i === ds.critCursor ? { ...c7, met: !c7.met } : c7
          );
          appState = updateTask(appState, active.id, { acceptanceCriteria: updated });
          writeState(appState);
          const newMet = updated.filter((c7) => c7.met).length;
          flash(`${cr.met ? "UNCHECKED" : "CHECKED"}: ${cr.text} (${newMet}/${updated.length})`, cr.met ? y2 : gB2);
        }
      } else if (ds.panel === "tasks") {
        flash("Switch to criteria panel with TAB first", y2);
      }
      draw();
      return;
    }
    if (key === "d" || key === "D") {
      if (active) {
        const { met, total } = criteriaProgress(active);
        if (total > 0 && met < total) {
          flash(`NOT ALL CRITERIA MET (${met}/${total}). Check remaining criteria first.`, rr);
          draw();
          return;
        }
        const timestamp = now();
        appState = updateTask(appState, active.id, {
          status: "done",
          completedAt: timestamp,
          acceptanceCriteria: active.acceptanceCriteria.map((c7) => ({ ...c7, met: true }))
        });
        appState = {
          ...appState,
          activeTaskId: null,
          currentSession: null,
          focusEvents: [
            ...appState.focusEvents,
            { type: "complete", taskId: active.id, timestamp }
          ]
        };
        writeState(appState);
        ds.panel = "tasks";
        const s = calculateDailyScore(appState);
        flash(`COMPLETED: ${active.title} | Score: ${s} (${scoreLabel(s)})`, gB2, 5e3);
      } else {
        flash("No active task.", y2);
      }
      draw();
      return;
    }
    if (key === "a" || key === "A") {
      if (active) {
        const timestamp = now();
        appState = updateTask(appState, active.id, {
          status: "backlog"
        });
        appState = {
          ...appState,
          activeTaskId: null,
          currentSession: null,
          focusEvents: [
            ...appState.focusEvents,
            { type: "abandon", taskId: active.id, timestamp }
          ]
        };
        writeState(appState);
        ds.panel = "tasks";
        flash(`MOVED TO BACKLOG: ${active.title}`, y2);
      } else {
        flash("No active task.", y2);
      }
      draw();
      return;
    }
    if (key === "p" || key === "P") {
      if (active) {
        try {
          const prompt = generatePromptSync(appState, active);
          execSync3("pbcopy", { input: prompt });
          flash("PROMPT COPIED TO CLIPBOARD", gB2);
        } catch {
          flash("Could not copy prompt.", rr);
        }
      } else {
        flash("No active task.", y2);
      }
      draw();
      return;
    }
    if (key === "r" || key === "R") {
      flash("REFRESHED", c2);
      draw();
      return;
    }
    if (key === "f" || key === "F") {
      if (ds.panel === "tasks" && active && tasks.length > 0) {
        const target = tasks[ds.taskCursor];
        if (target && target.id !== active.id && target.status !== "done") {
          const timestamp = now();
          appState = updateTask(appState, active.id, {
            status: "backlog",
            switchCount: active.switchCount + 1
          });
          appState = updateTask(appState, target.id, {
            status: "active",
            startedAt: target.startedAt ?? timestamp
          });
          appState = {
            ...appState,
            activeTaskId: target.id,
            currentSession: { taskId: target.id, startedAt: timestamp, endedAt: null },
            focusEvents: [
              ...appState.focusEvents,
              { type: "switch_away", taskId: active.id, timestamp },
              { type: "pushback_override", taskId: active.id, timestamp },
              { type: "switch_to", taskId: target.id, timestamp }
            ]
          };
          writeState(appState);
          ds.panel = "tasks";
          flash(`FORCE SWITCH: ${active.id} -> ${target.id} (score impacted!)`, rr, 5e3);
        }
      }
      draw();
      return;
    }
  });
  draw();
}
var dashCommand = new Command14("dash").description("Interactive focus dashboard (TUI)").action(() => {
  startInteractive();
});

// src/commands/note.ts
import { Command as Command15 } from "commander";
import chalk11 from "chalk";
var noteCommand = new Command15("note").description("Quick-capture an idea without losing focus (parking lot)").argument("[text]", "The idea or note to capture").option("--promote <id>", "Promote a note to a backlog task").option("--list", "List all notes").option("--clear", "Clear all promoted notes").action((text, opts) => {
  if (opts.list) {
    listNotes();
    return;
  }
  if (opts.promote) {
    promoteNote(opts.promote);
    return;
  }
  if (opts.clear) {
    clearPromoted();
    return;
  }
  if (!text) {
    listNotes();
    return;
  }
  captureNote(text);
});
function captureNote(text) {
  const state = readState();
  const active = getActiveTask(state);
  const note = {
    id: `n${state.nextNoteNumber}`,
    text,
    capturedDuring: active?.id || null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    promoted: false,
    promotedToTaskId: null
  };
  state.notes.push(note);
  state.nextNoteNumber++;
  writeState(state);
  console.log("");
  console.log(chalk11.dim("  \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510"));
  console.log(chalk11.dim("  \u2502") + chalk11.yellow(" NOTE CAPTURED") + chalk11.dim("                          \u2502"));
  console.log(chalk11.dim("  \u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524"));
  console.log(chalk11.dim("  \u2502") + ` ${chalk11.cyan(note.id)} ${text.length > 34 ? text.slice(0, 31) + "..." : text.padEnd(34)}` + chalk11.dim(" \u2502"));
  if (active) {
    console.log(chalk11.dim("  \u2502") + chalk11.dim(` saved during: ${active.id} - ${active.title}`.slice(0, 39).padEnd(39)) + chalk11.dim(" \u2502"));
  }
  console.log(chalk11.dim("  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518"));
  console.log("");
  if (active) {
    info(`Back to work: "${active.title}"`);
  }
  const unpromoted = state.notes.filter((n) => !n.promoted).length;
  if (unpromoted >= 5) {
    warn(`${unpromoted} notes parked. Run "vf note --list" to review.`);
  }
}
function listNotes() {
  const state = readState();
  const unpromoted = state.notes.filter((n) => !n.promoted);
  const promoted = state.notes.filter((n) => n.promoted);
  if (unpromoted.length === 0 && promoted.length === 0) {
    info('No notes captured yet. Use: vf note "your idea"');
    return;
  }
  console.log("");
  console.log(chalk11.bold.greenBright("  PARKING LOT"));
  console.log(chalk11.dim("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  if (unpromoted.length > 0) {
    console.log("");
    for (const note of unpromoted) {
      const during = note.capturedDuring ? chalk11.dim(` (during ${note.capturedDuring})`) : "";
      console.log(`  ${chalk11.cyan(note.id)}  ${note.text}${during}`);
    }
    console.log("");
    console.log(chalk11.dim(`  ${unpromoted.length} note${unpromoted.length > 1 ? "s" : ""} waiting. Promote to task: vf note --promote <id>`));
  }
  if (promoted.length > 0) {
    console.log("");
    console.log(chalk11.dim("  Already promoted:"));
    for (const note of promoted) {
      console.log(chalk11.dim(`  ${note.id}  ${note.text} \u2192 ${note.promotedToTaskId}`));
    }
  }
  console.log("");
}
function promoteNote(noteId) {
  const state = readState();
  const note = state.notes.find((n) => n.id === noteId);
  if (!note) {
    warn(`Note "${noteId}" not found. Use "vf note --list" to see notes.`);
    return;
  }
  if (note.promoted) {
    info(`Note "${noteId}" was already promoted to task ${note.promotedToTaskId}.`);
    return;
  }
  const result = createTask(state, note.text, {});
  const updatedNotes = state.notes.map(
    (n) => n.id === noteId ? { ...n, promoted: true, promotedToTaskId: result.task.id } : n
  );
  const finalState = { ...result.state, notes: updatedNotes };
  writeState(finalState);
  success(`Promoted ${noteId} \u2192 task ${result.task.id}: "${note.text}"`);
  info("Add criteria with: vf add is not needed - task is already created.");
  info(`Start when ready: vf start ${result.task.id}`);
}
function clearPromoted() {
  const state = readState();
  const before = state.notes.length;
  state.notes = state.notes.filter((n) => !n.promoted);
  const removed = before - state.notes.length;
  writeState(state);
  if (removed > 0) {
    success(`Cleared ${removed} promoted note${removed > 1 ? "s" : ""}.`);
  } else {
    info("No promoted notes to clear.");
  }
}

// src/commands/history.ts
import chalk12 from "chalk";
import { Command as Command16 } from "commander";
var g3 = chalk12.green;
var gB3 = chalk12.greenBright;
var gD3 = chalk12.dim.green;
var c3 = chalk12.cyan;
var cB3 = chalk12.cyanBright;
var y3 = chalk12.yellow;
var r2 = chalk12.red;
var d2 = chalk12.dim;
var b2 = chalk12.bold;
function hLine2(char, width) {
  return char.repeat(width);
}
function boxTop3(w) {
  return gD3("\u2554" + hLine2("\u2550", w - 2) + "\u2557");
}
function boxBot3(w) {
  return gD3("\u255A" + hLine2("\u2550", w - 2) + "\u255D");
}
function boxRow3(content, w) {
  const visible = content.replace(/\x1b\[[0-9;]*m/g, "");
  const pad = Math.max(0, w - 4 - visible.length);
  return gD3("\u2551") + " " + content + " ".repeat(pad) + " " + gD3("\u2551");
}
function boxEmpty3(w) {
  return gD3("\u2551") + " ".repeat(w - 2) + gD3("\u2551");
}
function sectionHeader2(label, w) {
  const remaining = w - 6 - label.length - 4;
  return gD3("\u2560\u2500\u2500") + " " + gB3(label) + " " + gD3(hLine2("\u2500", Math.max(1, remaining)) + "\u2563");
}
function scoreColor(score) {
  return score >= 70 ? gB3 : score >= 50 ? y3 : r2;
}
function miniBar(score, width = 15) {
  const filled = Math.round(score / 100 * width);
  const color = scoreColor(score);
  return g3("[") + color("\u2593".repeat(filled)) + gD3("\u2591".repeat(width - filled)) + g3("]");
}
function trendArrow(history) {
  if (history.length < 2) return d2("\u2014");
  const last = history[history.length - 1].score;
  const prev = history[history.length - 2].score;
  const diff = last - prev;
  if (diff > 5) return gB3("\u25B2 +" + diff);
  if (diff < -5) return r2("\u25BC " + diff);
  return y3("\u25BA " + (diff >= 0 ? "+" : "") + diff);
}
function formatDate(dateStr) {
  const [, month, day] = dateStr.split("-");
  const weekday = (/* @__PURE__ */ new Date(dateStr + "T12:00:00Z")).toLocaleDateString("de-DE", { weekday: "short" });
  return `${weekday} ${day}.${month}`;
}
var historyCommand = new Command16("history").description("Show focus history and trends").option("-n, --days <n>", "Number of days to show", "14").option("--json", "Output as JSON").action((opts) => {
  const state = readState();
  const maxDays = parseInt(opts.days, 10) || 14;
  const history = getDailyHistory(state, maxDays);
  if (opts.json) {
    console.log(JSON.stringify({
      history,
      averageScore: getAverageScore(history),
      streak: getStreak(history)
    }, null, 2));
    return;
  }
  const W2 = 62;
  const lines = [];
  lines.push("");
  lines.push(boxTop3(W2));
  lines.push(boxRow3(gB3("SYS") + d2("://") + c3(state.projectName) + d2(" > ") + cB3("FOCUS HISTORY"), W2));
  if (history.length === 0) {
    lines.push(sectionHeader2("NO DATA", W2));
    lines.push(boxEmpty3(W2));
    lines.push(boxRow3(d2("   Noch keine Focus-Events. Starte mit ") + c3("vf start <id>"), W2));
    lines.push(boxEmpty3(W2));
    lines.push(boxBot3(W2));
    console.log(lines.join("\n"));
    return;
  }
  const avg = getAverageScore(history);
  const streak = getStreak(history);
  const totalCompleted = history.reduce((s, h) => s + h.tasksCompleted, 0);
  const totalSwitches = history.reduce((s, h) => s + h.tasksSwitched, 0);
  lines.push(sectionHeader2("SUMMARY", W2));
  lines.push(boxEmpty3(W2));
  lines.push(boxRow3(
    d2("   AVG SCORE  ") + miniBar(avg, 12) + " " + scoreColor(avg)(b2(String(avg))) + d2("   STREAK ") + (streak > 0 ? gB3(b2(streak + "d")) : r2("0d")) + d2("   TREND ") + trendArrow(history),
    W2
  ));
  lines.push(boxRow3(
    d2("   COMPLETED  ") + gB3(String(totalCompleted)) + d2("   SWITCHES ") + (totalSwitches > 0 ? r2(String(totalSwitches)) : g3("0")) + d2("   DAYS ") + c3(String(history.length)),
    W2
  ));
  lines.push(sectionHeader2("DAILY SCORES", W2));
  lines.push(boxEmpty3(W2));
  const sparkline2 = history.map((h) => {
    const char = h.score >= 70 ? "\u2588" : h.score >= 50 ? "\u2593" : h.score >= 25 ? "\u2592" : "\u2591";
    return scoreColor(h.score)(char);
  }).join("");
  lines.push(boxRow3(d2("   TREND ") + sparkline2 + d2("  (" + history.length + " days)"), W2));
  lines.push(boxEmpty3(W2));
  lines.push(boxRow3(
    d2("   DATE        SCORE  BAR              DONE  SW  ABN"),
    W2
  ));
  lines.push(boxRow3(d2("   " + hLine2("\u2500", W2 - 8)), W2));
  for (const day of history) {
    const dateStr = formatDate(day.date);
    const sc = scoreColor(day.score);
    const bar = miniBar(day.score, 10);
    const doneStr = day.tasksCompleted > 0 ? gB3(String(day.tasksCompleted).padStart(3)) : d2("  0");
    const swStr = day.tasksSwitched > 0 ? r2(String(day.tasksSwitched).padStart(3)) : d2("  0");
    const abnStr = day.tasksAbandoned > 0 ? r2(String(day.tasksAbandoned).padStart(3)) : d2("  0");
    lines.push(boxRow3(
      d2("   ") + c3(dateStr.padEnd(11)) + sc(String(day.score).padStart(4)) + d2("  ") + bar + "  " + doneStr + swStr + abnStr,
      W2
    ));
  }
  lines.push(boxEmpty3(W2));
  lines.push(boxRow3(
    d2("   ") + gB3("90-100") + d2(" Deep Focus  ") + g3("70-89") + d2(" Good  ") + y3("50-69") + d2(" Moderate  ") + r2("<50") + d2(" Collapse"),
    W2
  ));
  lines.push(boxEmpty3(W2));
  lines.push(boxBot3(W2));
  lines.push("");
  console.log(lines.join("\n"));
});

// src/commands/watch.ts
import fs6 from "fs";
import path9 from "path";
import { Command as Command17 } from "commander";
import chalk13 from "chalk";
var HEARTBEAT_INTERVAL_MS = 3e4;
var IGNORE_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  ".vibe-focus",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".cache",
  "__pycache__",
  ".tox",
  "coverage",
  ".nyc_output",
  ".turbo",
  ".vercel"
]);
var IGNORE_EXTENSIONS = /* @__PURE__ */ new Set([
  ".log",
  ".lock",
  ".tmp",
  ".swp",
  ".swo"
]);
function shouldIgnore(filePath) {
  const parts = filePath.split(path9.sep);
  if (parts.some((p) => IGNORE_DIRS.has(p))) return true;
  const ext = path9.extname(filePath).toLowerCase();
  if (IGNORE_EXTENSIONS.has(ext)) return true;
  if (parts.some((p) => p.startsWith("."))) return true;
  return false;
}
var watchCommand = new Command17("watch").description("Watch for file changes + cross-tab sync, auto-send heartbeats").option("--worker <name>", "Identity for this watcher (default: __watcher__)").option("--interval <ms>", "Polling interval in ms (default: 2000, min: 500, max: 10000)", "2000").option("--no-heartbeat", "Disable auto-heartbeat on file changes").action((opts) => {
  const worker = resolveWorker(opts) ?? "__watcher__";
  const interval = Math.max(500, Math.min(1e4, parseInt(opts.interval, 10) || 2e3));
  const heartbeatEnabled = opts.heartbeat !== false;
  console.log(chalk13.cyan(`
  vf watch \u2014 file monitor + cloud sync`));
  console.log(chalk13.dim(`  worker: ${worker} | poll: ${interval}ms | heartbeat: ${heartbeatEnabled ? "on" : "off"}`));
  console.log(chalk13.dim("  Press Ctrl+C to stop.\n"));
  updateState((s) => ({ ...s, workerMeta: stampWorkerMeta(s, worker) }));
  const syncTimer = setInterval(() => {
    try {
      const state = readState();
      const changes = detectChanges(state, worker);
      if (changes.length > 0) {
        for (const c7 of changes) {
          const icon = c7.type === "start" ? chalk13.greenBright("\u25B6") : c7.type === "complete" ? chalk13.cyanBright("\u2713") : c7.type === "abandon" ? chalk13.red("\u2717") : c7.type === "switch_away" ? chalk13.yellow("\u25C0") : c7.type === "switch_to" ? chalk13.green("\u25B6") : c7.type === "pushback_override" ? chalk13.red("!") : c7.type === "message" ? chalk13.magentaBright("\u{1F4AC}") : chalk13.dim("\xB7");
          const time = new Date(c7.timestamp).toLocaleTimeString("de-DE", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
          });
          console.log(`  ${chalk13.dim(time)} ${icon} ${chalk13.bold(c7.worker)}: ${c7.description}`);
        }
        updateState((s) => ({ ...s, workerMeta: stampWorkerMeta(s, worker) }));
      }
    } catch {
    }
  }, interval);
  let lastHeartbeatAt = 0;
  let lastSuggestionAt = 0;
  const SUGGESTION_DEBOUNCE_MS = 10 * 60 * 1e3;
  let recentFiles = [];
  let pendingHeartbeat = null;
  let watcher = null;
  const seenNotificationIds = /* @__PURE__ */ new Set();
  function showNotifications(notifications) {
    if (!notifications || notifications.length === 0) return;
    const time = (/* @__PURE__ */ new Date()).toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    for (const n of notifications) {
      if (seenNotificationIds.has(n.id)) continue;
      seenNotificationIds.add(n.id);
      const typeIcon3 = n.type === "mention" ? chalk13.cyan("@") : n.type === "task_assigned" ? chalk13.yellow("\u2192") : n.type === "task_completed" ? chalk13.green("\u2713") : n.type === "member_joined" ? chalk13.green("+") : chalk13.magenta("\u2605");
      const actor = n.actor?.username ? chalk13.bold(n.actor.username) : "someone";
      console.log(`  ${chalk13.dim(time)} ${typeIcon3} ${chalk13.yellowBright("\u{1F514}")} ${actor} ${n.title}${n.body ? chalk13.dim(` \u2014 ${n.body.slice(0, 60)}`) : ""}`);
    }
  }
  function showSuggestions(suggestions) {
    if (!suggestions || suggestions.length === 0) return;
    const now2 = Date.now();
    if (now2 - lastSuggestionAt < SUGGESTION_DEBOUNCE_MS) return;
    lastSuggestionAt = now2;
    const time = (/* @__PURE__ */ new Date()).toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    const top = suggestions[0];
    const icon = top.urgency === "high" ? chalk13.red("\u25CF") : top.urgency === "medium" ? chalk13.yellow("\u25CF") : chalk13.green("\u25CF");
    console.log(`  ${chalk13.dim(time)} ${icon} ${chalk13.cyan("suggestion:")} ${top.message}`);
  }
  function throttledHeartbeat() {
    if (!heartbeatEnabled) return;
    const now2 = Date.now();
    if (now2 - lastHeartbeatAt < HEARTBEAT_INTERVAL_MS) {
      if (!pendingHeartbeat) {
        const delay = HEARTBEAT_INTERVAL_MS - (now2 - lastHeartbeatAt) + 100;
        pendingHeartbeat = setTimeout(() => {
          pendingHeartbeat = null;
          throttledHeartbeat();
        }, delay);
      }
      return;
    }
    lastHeartbeatAt = now2;
    const filesToSend = [...new Set(recentFiles)].slice(0, 20);
    recentFiles = [];
    const payload = buildHeartbeatPayload();
    if (!payload) return;
    if (filesToSend.length > 0) {
      const combined = /* @__PURE__ */ new Set([...filesToSend, ...payload.active_files]);
      payload.active_files = [...combined].slice(0, 50);
    }
    const time = (/* @__PURE__ */ new Date()).toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    sendHeartbeat(payload).then((result) => {
      if (result.ok) {
        console.log(`  ${chalk13.dim(time)} ${chalk13.magenta("\u2665")} heartbeat sent (${filesToSend.length} files)`);
        showSuggestions(result.suggestions);
        showNotifications(result.notifications);
      }
    }).catch(() => {
    });
  }
  try {
    const cwd = process.cwd();
    watcher = fs6.watch(cwd, { recursive: true }, (_event, filename) => {
      if (!filename || shouldIgnore(filename)) return;
      recentFiles.push(filename);
      throttledHeartbeat();
    });
    watcher.on("error", () => {
    });
    success("Watching file changes...");
    if (heartbeatEnabled) {
      const payload = buildHeartbeatPayload();
      if (payload) {
        sendHeartbeat(payload).then((r6) => {
          if (r6.ok) {
            const time = (/* @__PURE__ */ new Date()).toLocaleTimeString("de-DE", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit"
            });
            console.log(`  ${chalk13.dim(time)} ${chalk13.magenta("\u2665")} initial heartbeat sent`);
            showSuggestions(r6.suggestions);
            showNotifications(r6.notifications);
          }
        }).catch(() => {
        });
        lastHeartbeatAt = Date.now();
      }
    }
  } catch (e) {
    info(`File watching unavailable (${e.message}). Cross-tab sync still active.`);
  }
  let keepAliveTimer = null;
  if (heartbeatEnabled) {
    keepAliveTimer = setInterval(() => {
      const now2 = Date.now();
      if (now2 - lastHeartbeatAt >= 12e4) {
        const payload = buildHeartbeatPayload({ status: "idle" });
        if (payload) {
          lastHeartbeatAt = now2;
          sendHeartbeat(payload).catch(() => {
          });
        }
      }
    }, 6e4);
  }
  const cleanup = () => {
    clearInterval(syncTimer);
    if (keepAliveTimer) clearInterval(keepAliveTimer);
    if (pendingHeartbeat) clearTimeout(pendingHeartbeat);
    if (watcher) watcher.close();
    if (heartbeatEnabled) {
      const payload = buildHeartbeatPayload({ status: "offline" });
      if (payload) {
        sendHeartbeat(payload).catch(() => {
        });
      }
    }
    console.log(chalk13.dim("\nStopped watching."));
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  info("Watching...");
});

// src/commands/hook.ts
import fs7 from "fs";
import path10 from "path";
import { fileURLToPath } from "url";
import { Command as Command18 } from "commander";
import chalk14 from "chalk";
var GIT_HOOK_MARKER = "# vibe-focus:post-commit";
var BUNDLED_SCRIPT_NAME = "git-post-commit.mjs";
function getBundledGitHookPath() {
  const thisFile = fileURLToPath(import.meta.url);
  return path10.join(path10.dirname(thisFile), BUNDLED_SCRIPT_NAME);
}
function findGitDir(startDir) {
  let dir = startDir;
  while (dir !== path10.dirname(dir)) {
    const gitDir = path10.join(dir, ".git");
    if (fs7.existsSync(gitDir)) return gitDir;
    dir = path10.dirname(dir);
  }
  return null;
}
var hookCommand = new Command18("hook").description("Install/remove git hooks for auto-tracking").option("--install-git", "Install git post-commit hook").option("--remove-git", "Remove git post-commit hook").option("--status", "Check installed hooks").action((opts) => {
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
  const hooksDir = path10.join(gitDir, "hooks");
  fs7.mkdirSync(hooksDir, { recursive: true });
  const vfDir = path10.join(cwd, ".vibe-focus");
  fs7.mkdirSync(vfDir, { recursive: true });
  const scriptDest = path10.join(vfDir, BUNDLED_SCRIPT_NAME);
  const bundledPath = getBundledGitHookPath();
  if (fs7.existsSync(bundledPath)) {
    fs7.copyFileSync(bundledPath, scriptDest);
    fs7.chmodSync(scriptDest, "755");
  } else {
    error(`Hook script not found at ${bundledPath}. Run "npm run build" first.`);
    return false;
  }
  const hookFile = path10.join(hooksDir, "post-commit");
  const invocation = `
${GIT_HOOK_MARKER}
node "${scriptDest}" &
`;
  if (fs7.existsSync(hookFile)) {
    const content = fs7.readFileSync(hookFile, "utf-8");
    if (content.includes(GIT_HOOK_MARKER)) {
      info("Git post-commit hook already installed.");
      return true;
    }
    fs7.appendFileSync(hookFile, invocation);
  } else {
    fs7.writeFileSync(hookFile, `#!/bin/sh
${invocation}`);
  }
  fs7.chmodSync(hookFile, "755");
  console.log("");
  console.log(chalk14.greenBright("  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"));
  console.log(chalk14.greenBright("  \u2551") + chalk14.bold.green("   GIT HOOK INSTALLED                  ") + chalk14.greenBright("\u2551"));
  console.log(chalk14.greenBright("  \u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"));
  console.log(chalk14.greenBright("  \u2551") + "                                           " + chalk14.greenBright("\u2551"));
  console.log(chalk14.greenBright("  \u2551") + chalk14.cyan("  Hook:   ") + chalk14.dim(".git/hooks/post-commit         ") + chalk14.greenBright("\u2551"));
  console.log(chalk14.greenBright("  \u2551") + chalk14.cyan("  Script: ") + chalk14.dim(".vibe-focus/git-post-commit.mjs") + chalk14.greenBright("\u2551"));
  console.log(chalk14.greenBright("  \u2551") + "                                           " + chalk14.greenBright("\u2551"));
  console.log(chalk14.greenBright("  \u2551") + chalk14.dim("  Every commit will auto-push activity  ") + chalk14.greenBright("\u2551"));
  console.log(chalk14.greenBright("  \u2551") + chalk14.dim("  and heartbeats to vibeteamz.          ") + chalk14.greenBright("\u2551"));
  console.log(chalk14.greenBright("  \u2551") + "                                           " + chalk14.greenBright("\u2551"));
  console.log(chalk14.greenBright("  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D"));
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
  const hookFile = path10.join(gitDir, "hooks", "post-commit");
  if (!fs7.existsSync(hookFile)) {
    info("No post-commit hook found.");
    return;
  }
  const content = fs7.readFileSync(hookFile, "utf-8");
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
    fs7.unlinkSync(hookFile);
  } else {
    fs7.writeFileSync(hookFile, cleaned + "\n");
  }
  const scriptPath = path10.join(cwd, ".vibe-focus", BUNDLED_SCRIPT_NAME);
  if (fs7.existsSync(scriptPath)) {
    fs7.unlinkSync(scriptPath);
  }
  success("Git post-commit hook removed.");
}
function checkHookStatus() {
  const cwd = process.cwd();
  const gitDir = findGitDir(cwd);
  console.log("");
  console.log(chalk14.bold("Hook Status:"));
  console.log("");
  if (gitDir) {
    const hookFile = path10.join(gitDir, "hooks", "post-commit");
    const hasHook = fs7.existsSync(hookFile) && fs7.readFileSync(hookFile, "utf-8").includes(GIT_HOOK_MARKER);
    console.log(`  Git post-commit:  ${hasHook ? chalk14.green("installed") : chalk14.dim("not installed")}`);
  } else {
    console.log(`  Git post-commit:  ${chalk14.dim("no git repo")}`);
  }
  const claudeSettings = path10.join(cwd, ".claude", "settings.json");
  if (fs7.existsSync(claudeSettings)) {
    try {
      const settings = JSON.parse(fs7.readFileSync(claudeSettings, "utf-8"));
      const hasGuard = settings.hooks?.UserPromptSubmit?.some(
        (e) => e.hooks?.some((h) => h.command?.includes("vibe-focus-guard"))
      );
      const hasAutoTrack = settings.hooks?.PostToolUse?.some(
        (e) => e.hooks?.some((h) => h.command?.includes("vibe-focus-auto-track"))
      );
      console.log(`  Claude guard:     ${hasGuard ? chalk14.green("installed") : chalk14.dim("not installed")}`);
      console.log(`  Claude auto-track:${hasAutoTrack ? chalk14.green(" installed") : chalk14.dim(" not installed")}`);
    } catch {
      console.log(`  Claude hooks:     ${chalk14.dim("settings unreadable")}`);
    }
  } else {
    console.log(`  Claude hooks:     ${chalk14.dim("no .claude/settings.json")}`);
  }
  console.log("");
  info("Install git hook:    vf hook --install-git");
  info("Install Claude hook: vf guard --install --agent claude");
  console.log("");
}

// src/commands/msg.ts
import { Command as Command19 } from "commander";
var msgCommand = new Command19("msg").description("Send a message to other tabs/workers").argument("<message>", "Message text").option("--worker <name>", "Your worker identity").action((message, opts) => {
  let state = readState();
  const worker = resolveWorker(opts);
  const workerKey = worker ?? "__default__";
  const changes = detectChanges(state, workerKey);
  printChangeBanner(changes);
  state = {
    ...state,
    focusEvents: [
      ...state.focusEvents,
      {
        type: "message",
        taskId: "",
        timestamp: now(),
        details: message,
        worker: workerKey
      }
    ]
  };
  state.workerMeta = stampWorkerMeta(state, workerKey);
  writeState(state);
  fireCloudActivity({ type: "message", message: `${workerKey}: ${message}` });
  success(`Message sent: "${message}"`);
});

// src/commands/setup.ts
import { Command as Command21 } from "commander";

// src/commands/onboarding.ts
import fs8 from "fs";
import path11 from "path";
import chalk15 from "chalk";

// src/cloud/commands/login.ts
import { Command as Command20 } from "commander";
import { exec } from "child_process";
import { platform } from "os";
import { createInterface as createInterface3 } from "readline";
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
  const rl = createInterface3({ input: process.stdin, output: process.stdout });
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
var loginCommand = new Command20("login").description("Authenticate with vibeteamz via Supabase").option("--github", "Authenticate via GitHub in your browser (recommended)").option("--email <email>", "Your email address (for email/password login)").option("--password <password>", "Your password (for email/password login)").option("--supabase-url <url>", "Supabase project URL (HTTPS)").option("--supabase-key <key>", "Supabase anon key").option("--api-url <url>", "vibeteamz API URL (HTTPS)").action(async (opts) => {
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

// src/commands/onboarding.ts
var STATE_DIR = ".vibe-focus";
var STATE_FILE = "state.json";
function isInitialized() {
  return fs8.existsSync(path11.join(process.cwd(), STATE_DIR, STATE_FILE));
}
function stepLabel(step, total, label) {
  return chalk15.dim(`Step ${step}/${total}`) + "  " + label;
}
async function runOnboarding(opts) {
  const result = {
    initialized: false,
    loggedIn: false,
    linked: false,
    guardInstalled: false,
    hookInstalled: false
  };
  const totalSteps = 5 - (opts.skipLogin ? 1 : 0) - (opts.skipGuard ? 1 : 0) - (opts.skipHook ? 1 : 0);
  let step = 0;
  const verb = opts.isJoin ? "Joining" : "Setting up";
  console.log("");
  console.log(chalk15.greenBright(`  ${verb} vibe-focus...`));
  console.log("");
  step++;
  if (isInitialized()) {
    console.log(stepLabel(step, totalSteps, chalk15.green("Project already initialized") + chalk15.dim(" (skipped)")));
    result.initialized = true;
    if (opts.isJoin) {
      const tasksPath = path11.join(process.cwd(), STATE_DIR, "tasks.json");
      if (fs8.existsSync(tasksPath)) {
        try {
          const tasks = JSON.parse(fs8.readFileSync(tasksPath, "utf-8"));
          if (Array.isArray(tasks) && tasks.length > 0) {
            info(`Found ${tasks.length} task${tasks.length === 1 ? "" : "s"} in team backlog`);
          }
        } catch {
        }
      }
    }
  } else {
    const projectName = opts.projectName ?? path11.basename(process.cwd());
    console.log(stepLabel(step, totalSteps, opts.isJoin ? "Joining project..." : "Initialize project"));
    try {
      const { importedCount } = initProject(projectName);
      result.initialized = true;
      success(`Initialized "${projectName}"`);
      if (importedCount > 0) {
        info(`Imported ${importedCount} task${importedCount === 1 ? "" : "s"} from team backlog`);
      }
    } catch (e) {
      error(e.message);
      return result;
    }
  }
  const agentType = opts.agent && isValidAgent(opts.agent) ? opts.agent : void 0;
  if (agentType) {
    updateConfig({ agent: agentType });
  }
  if (!opts.skipLogin) {
    step++;
    const config = readCloudConfig();
    if (config.accessToken && config.userId) {
      console.log(stepLabel(step, totalSteps, chalk15.green("Already logged in") + chalk15.dim(" (skipped)")));
      result.loggedIn = true;
      if (!config.projectId) {
        result.linked = await autoLinkProject(config);
      } else {
        result.linked = true;
      }
    } else {
      console.log(stepLabel(step, totalSteps, "Login to vibeteamz (GitHub)"));
      result.loggedIn = await githubDeviceFlow(config);
      if (result.loggedIn) {
        const updated = readCloudConfig();
        result.linked = !!updated.projectId;
      }
    }
  }
  if (!opts.skipGuard) {
    step++;
    const agent = agentType ?? resolveAgent();
    const agentName = AGENT_CONFIGS[agent].displayName;
    console.log(stepLabel(step, totalSteps, `Install focus guardian (${agentName})`));
    try {
      installGuard(agent);
      result.guardInstalled = true;
    } catch {
      warn("Guard installation failed. Install manually with: vf guard --install");
    }
  }
  if (!opts.skipHook) {
    step++;
    console.log(stepLabel(step, totalSteps, "Install git hook"));
    try {
      result.hookInstalled = installGitHook();
    } catch {
      warn("Git hook installation failed. Install manually with: vf hook --install-git");
    }
  }
  console.log("");
  if (result.linked) {
    fireHeartbeat();
    console.log(chalk15.greenBright("  \u2665 Connected to vibeteamz!"));
  } else if (result.loggedIn) {
    console.log(chalk15.yellow("  \u2665 Logged in but not linked to a project"));
    info("Link with: vf vibeteamz link <project-id>");
  } else if (!opts.skipLogin) {
    console.log(chalk15.dim("  \u2665 vibeteamz: not connected"));
    info("Login later with: vf vibeteamz login --github");
  }
  console.log("");
  if (result.initialized) {
    info('Next: vf add "Your first task" && vf start t1');
  }
  console.log("");
  return result;
}

// src/commands/setup.ts
var setupCommand = new Command21("setup").description("One-command project setup wizard").option("--name <name>", "Project name").option("--agent <type>", "AI agent type: claude, cursor, copilot, windsurf, generic").option("--skip-login", "Skip vibeteamz login").option("--skip-guard", "Skip focus guardian installation").option("--skip-hook", "Skip git hook installation").action(async (opts) => {
  await runOnboarding({
    projectName: opts.name,
    agent: opts.agent,
    skipLogin: opts.skipLogin,
    skipGuard: opts.skipGuard,
    skipHook: opts.skipHook,
    isJoin: false
  });
});

// src/commands/join.ts
import { Command as Command22 } from "commander";
var joinCommand = new Command22("join").description("Join an existing project (team member onboarding)").option("--name <name>", "Project name").option("--agent <type>", "AI agent type: claude, cursor, copilot, windsurf, generic").option("--skip-login", "Skip vibeteamz login").option("--skip-guard", "Skip focus guardian installation").option("--skip-hook", "Skip git hook installation").action(async (opts) => {
  await runOnboarding({
    projectName: opts.name,
    agent: opts.agent,
    skipLogin: opts.skipLogin,
    skipGuard: opts.skipGuard,
    skipHook: opts.skipHook,
    isJoin: true
  });
});

// src/commands/all.ts
import chalk16 from "chalk";
import { Command as Command23 } from "commander";
var g4 = chalk16.green;
var gB4 = chalk16.greenBright;
var gD4 = chalk16.dim.green;
var c4 = chalk16.cyan;
var cB4 = chalk16.cyanBright;
var y4 = chalk16.yellow;
var d3 = chalk16.dim;
var b3 = chalk16.bold;
function hLine3(char, width) {
  return char.repeat(width);
}
var allCommand = new Command23("all").description("Show all tasks: local + vibeteamz").action(async () => {
  const state = readState();
  const active = state.tasks.find((t) => t.status === "active");
  const backlog = state.tasks.filter((t) => t.status === "backlog");
  const doneCount = state.tasks.filter((t) => t.status === "done").length;
  const total = state.tasks.length;
  const lines = [];
  lines.push("");
  lines.push(gB4("  LOCAL TASKS") + d3(` (${doneCount}/${total} done)`));
  lines.push(d3("  " + hLine3("\u2500", 54)));
  if (active) {
    const elapsed = active.startedAt ? elapsedMinutes(active.startedAt) : 0;
    const { met, total: ct } = criteriaProgress(active);
    const pctStr = ct > 0 ? ` ${Math.round(met / ct * 100)}%` : "";
    lines.push("  " + gB4("\u25B6") + " " + cB4(active.id.padEnd(6)) + b3(active.title.slice(0, 40)) + d3(` ${formatDuration(elapsed)}`) + g4(pctStr));
  }
  for (const t of backlog) {
    lines.push("  " + y4("\u25CB") + " " + y4(t.id.padEnd(6)) + t.title.slice(0, 46));
  }
  if (!active && backlog.length === 0) {
    lines.push(d3("  No active or backlog tasks."));
  }
  lines.push("");
  try {
    if (isCloudLinked()) {
      const cfg = readCloudConfig();
      const pid = cfg.projectId;
      const token = cfg.apiKey ?? cfg.accessToken;
      if (pid && token) {
        const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${token}` };
        const [tasksResp, msResp] = await Promise.all([
          fetch(`${cfg.apiUrl}/api/projects/${pid}/tasks`, { headers, signal: AbortSignal.timeout(8e3) }),
          fetch(`${cfg.apiUrl}/api/projects/${pid}/milestones`, { headers, signal: AbortSignal.timeout(8e3) })
        ]);
        let tasks = [];
        let milestones = [];
        if (tasksResp.ok) tasks = await tasksResp.json();
        if (msResp.ok) {
          const body = await msResp.json();
          milestones = Array.isArray(body) ? body : body.milestones ?? [];
        }
        const tasksDone = tasks.filter((t) => t.status === "done").length;
        lines.push(gB4("  VIBETEAMZ TASKS") + d3(` (${tasksDone}/${tasks.length} done)`));
        lines.push(d3("  " + hLine3("\u2500", 54)));
        if (tasks.length > 0) {
          const msMap = /* @__PURE__ */ new Map();
          for (const ms of milestones) msMap.set(ms.id, ms);
          const byMs = /* @__PURE__ */ new Map();
          for (const t of tasks) {
            const key = t.milestone_id;
            if (!byMs.has(key)) byMs.set(key, []);
            byMs.get(key).push(t);
          }
          const msKeys = [...byMs.keys()].sort((a, b6) => {
            if (a === null) return 1;
            if (b6 === null) return -1;
            return 0;
          });
          for (const msId of msKeys) {
            const group = byMs.get(msId);
            const dn = group.filter((t) => t.status === "done").length;
            const tn = group.length;
            const pct = tn > 0 ? Math.round(dn / tn * 100) : 0;
            const msTitle = msId ? msMap.get(msId)?.title ?? msId.slice(0, 8) : "Backlog";
            const msIcon = msId ? y4("\u25C9") : d3("\u2261");
            const barW = 10;
            const filled = tn > 0 ? Math.round(dn / tn * barW) : 0;
            const bar = y4("\u2588".repeat(filled)) + d3("\u2591".repeat(barW - filled));
            lines.push("  " + msIcon + " " + b3(msTitle.padEnd(22)) + bar + " " + d3(`${dn}/${tn}`) + " " + (pct > 0 ? y4(`${pct}%`) : d3("0%")));
            for (const t of group) {
              const icon = t.status === "done" ? gB4("\u2713") : t.status === "in_progress" ? c4("\u25D0") : "\u25CB";
              const title = t.status === "done" ? d3(t.title.slice(0, 38)) : t.title.slice(0, 38);
              const owner = t.assigned_to === cfg.userId ? d3(" @you") : "";
              lines.push("     " + icon + " " + title + owner);
            }
          }
        } else {
          lines.push(d3("  No vibeteamz tasks."));
        }
      }
    } else {
      lines.push(d3("  vibeteamz not linked. Run ") + c4("vf setup"));
    }
  } catch {
    lines.push(d3("  vibeteamz offline"));
  }
  lines.push("");
  console.log(lines.join("\n"));
});

// src/team/register.ts
import { Command as Command31 } from "commander";

// src/team/commands/init.ts
import os from "os";
import { Command as Command24 } from "commander";
var initCommand2 = new Command24("init").description("Initialize team mode for this vibe-focus project").requiredOption("--user <name>", "Your username (only letters, numbers, hyphens, underscores)").option("--team-name <name>", "Team name", "team").option("--skip-guard", "Skip auto-installing the focus guard").action(async (opts) => {
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
    machine: os.hostname(),
    autoSync: false
  };
  writeLocalConfig(localConfig);
  console.log("");
  console.log(`  Username:  ${opts.user}`);
  console.log(`  Machine:   ${os.hostname()}`);
  console.log(`  Team:      ${opts.teamName}`);
  if (!opts.skipGuard) {
    try {
      const { installGuard: installGuard2 } = await import("./guard-C3NBOAAH.js");
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
import chalk17 from "chalk";
import { Command as Command25 } from "commander";

// src/team/core/presence.ts
import fs9 from "fs";
import path12 from "path";
import os2 from "os";
function safePresencePath(username) {
  validateUsername(username);
  const workersDir = getWorkersDir();
  const filePath = path12.join(workersDir, `${username}.json`);
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
    machine: os2.hostname().split(".")[0],
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
  fs9.writeFileSync(tmpPath, JSON.stringify(presence, null, 2));
  fs9.renameSync(tmpPath, filePath);
}
function readAllPresence() {
  const workersDir = getWorkersDir();
  if (!fs9.existsSync(workersDir)) return [];
  const files = fs9.readdirSync(workersDir).filter((f) => f.endsWith(".json"));
  const results = [];
  for (const file of files) {
    try {
      const raw = fs9.readFileSync(path12.join(workersDir, file), "utf-8");
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
  const myDirs = new Set(myFiles.map((f) => path12.dirname(f)));
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
    const dirOverlaps = [...myDirs].filter((d13) => theirDirs.has(d13 + "/") || theirDirs.has(d13));
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
  if (fs9.existsSync(filePath)) {
    fs9.unlinkSync(filePath);
  }
}

// src/team/commands/status.ts
var g5 = chalk17.green;
var gB5 = chalk17.greenBright;
var gD5 = chalk17.dim.green;
var c5 = chalk17.cyan;
var cB5 = chalk17.cyanBright;
var y5 = chalk17.yellow;
var r3 = chalk17.red;
var d4 = chalk17.dim;
var b4 = chalk17.bold;
function stalenessColor(level) {
  switch (level) {
    case "active":
      return gB5;
    case "idle":
      return y5;
    case "away":
      return r3;
    case "offline":
      return d4;
  }
}
function stalenessIcon(level) {
  switch (level) {
    case "active":
      return gB5("\u25CF");
    case "idle":
      return y5("\u25D0");
    case "away":
      return r3("\u25CB");
    case "offline":
      return d4("\u25CB");
  }
}
function formatAge(minutes) {
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
function hLine4(char, width) {
  return char.repeat(width);
}
function boxTop4(w) {
  return gD5("\u2554" + hLine4("\u2550", w - 2) + "\u2557");
}
function boxBot4(w) {
  return gD5("\u255A" + hLine4("\u2550", w - 2) + "\u255D");
}
function boxRow4(content, w) {
  const visible = content.replace(/\x1b\[[0-9;]*m/g, "");
  const pad = Math.max(0, w - 4 - visible.length);
  return gD5("\u2551") + " " + content + " ".repeat(pad) + " " + gD5("\u2551");
}
function boxEmpty4(w) {
  return gD5("\u2551") + " ".repeat(w - 2) + gD5("\u2551");
}
function sectionHeader3(label, w) {
  const remaining = w - 6 - label.length - 4;
  return gD5("\u2560\u2500\u2500") + " " + gB5(label) + " " + gD5(hLine4("\u2500", Math.max(1, remaining)) + "\u2563");
}
var statusCommand2 = new Command25("status").description("Show team members and their current focus state").option("--json", "Output as JSON").action((opts) => {
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
  const W2 = 68;
  const lines = [];
  lines.push("");
  lines.push(boxTop4(W2));
  lines.push(boxRow4(
    gB5("TEAM") + d4("://") + c5(teamConfig.teamName) + d4(" > ") + cB5("COWORKER AWARENESS"),
    W2
  ));
  lines.push(sectionHeader3("TEAM MEMBERS", W2));
  lines.push(boxEmpty4(W2));
  if (allPresence.length === 0) {
    lines.push(boxRow4(d4("   No team members found. Run: vf team init --user <name>"), W2));
  } else {
    lines.push(boxRow4(
      d4("   USER          STATUS    TASK                  PROGRESS  HEARTBEAT"),
      W2
    ));
    lines.push(boxRow4(d4("   " + hLine4("\u2500", W2 - 8)), W2));
    for (const presence of allPresence) {
      const isMe = presence.username === username;
      const cw = coworkers.find((c7) => c7.presence.username === presence.username);
      const staleness = cw?.staleness ?? "active";
      const age = cw?.heartbeatAge ?? 0;
      const icon = stalenessIcon(isMe ? "active" : staleness);
      const nameColor = isMe ? cB5 : stalenessColor(staleness);
      const nameStr = nameColor((presence.username + (isMe ? " (you)" : "")).padEnd(14));
      const statusStr = presence.taskStatus === "active" ? g5("active".padEnd(10)) : d4("idle".padEnd(10));
      const taskStr = presence.taskId ? (b4(presence.taskId) + " " + (presence.taskTitle ?? "").slice(0, 16)).padEnd(22) : d4("\u2014".padEnd(22));
      const pctStr = presence.taskId ? (presence.progress.percent + "%").padEnd(10) : d4("\u2014".padEnd(10));
      const ageStr = isMe ? g5("now".padEnd(9)) : stalenessColor(staleness)(formatAge(age).padEnd(9));
      lines.push(boxRow4(
        "   " + icon + " " + nameStr + statusStr + taskStr + pctStr + ageStr,
        W2
      ));
    }
  }
  if (conflicts.length > 0) {
    lines.push(sectionHeader3("CONFLICTS", W2));
    lines.push(boxEmpty4(W2));
    for (const conflict of conflicts) {
      const severity = conflict.type === "file_collision" ? r3("FILE") : y5("DIR");
      const who = conflict.coworkers.join(", ");
      lines.push(boxRow4(
        "   " + severity + d4(" ") + r3(conflict.files.join(", ").slice(0, 35)) + d4(" \u2190 ") + c5(who),
        W2
      ));
    }
  }
  if (myFiles.length > 0) {
    lines.push(sectionHeader3("YOUR ACTIVE FILES", W2));
    lines.push(boxEmpty4(W2));
    for (const file of myFiles.slice(0, 8)) {
      lines.push(boxRow4("   " + d4(file), W2));
    }
    if (myFiles.length > 8) {
      lines.push(boxRow4("   " + d4(`... and ${myFiles.length - 8} more`), W2));
    }
  }
  lines.push(boxEmpty4(W2));
  lines.push(boxBot4(W2));
  lines.push("");
  console.log(lines.join("\n"));
});

// src/team/commands/sync.ts
import { execFileSync } from "child_process";
import { Command as Command26 } from "commander";
var syncCommand = new Command26("sync").description("Sync team presence files via Git (commit + pull + push)").option("--quiet", "Suppress output").action((opts) => {
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
import chalk18 from "chalk";
import { Command as Command27 } from "commander";
var whoCommand = new Command27("who").description("Check who is working on a specific file or directory").argument("<path>", "File or directory path to check").action((targetPath) => {
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
    touching.push(`${chalk18.cyanBright(username)} (you)`);
  }
  for (const cw of coworkers) {
    if (cw.staleness === "offline") continue;
    const match = cw.presence.activeFiles.some(
      (f) => f === targetPath || f.startsWith(targetPath)
    );
    if (match) {
      touching.push(chalk18.yellow(cw.presence.username));
    }
  }
  if (touching.length === 0) {
    console.log(chalk18.dim(`  No one is currently working on ${targetPath}`));
  } else {
    console.log(`  ${chalk18.bold(targetPath)}: ${touching.join(", ")}`);
    if (touching.length > 1) {
      console.log(chalk18.red("  \u26A0 Multiple people touching this path - coordinate!"));
    }
  }
});

// src/team/commands/offline.ts
import chalk19 from "chalk";
import { Command as Command28 } from "commander";
var offlineCommand = new Command28("offline").description("Mark yourself as offline (removes your presence file)").action(() => {
  const username = getUsername();
  goOffline();
  console.log(chalk19.dim(`  ${username} marked as offline. Presence file removed.`));
});

// src/team/commands/msg.ts
import chalk20 from "chalk";
import { Command as Command29 } from "commander";
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
var msgCommand2 = new Command29("msg").description("Send or read team messages").argument("[message]", "Message to send (omit to read recent messages)").action(async (message) => {
  const cfg = getCloudConfig();
  if (!cfg) {
    console.log(chalk20.red("  Cloud not linked. Run: vf cloud login && vf cloud link"));
    return;
  }
  if (message) {
    const trimmed = message.trim();
    if (trimmed.length === 0 || trimmed.length > 500) {
      console.log(chalk20.red("  Message must be 1-500 characters."));
      return;
    }
    const result = await supabaseInsert("messages", {
      project_id: cfg.projectId,
      user_id: cfg.userId,
      body: trimmed
    });
    if (result.success) {
      console.log(chalk20.green("  \u2713 Message sent to team"));
      fireDiscordEvent({ type: "message", message: trimmed });
    } else {
      console.log(chalk20.red(`  Failed to send: ${result.error}`));
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
      console.log(chalk20.red(`  Failed to fetch messages: ${result.error}`));
      return;
    }
    if (result.data.length === 0) {
      console.log(chalk20.dim("  No team messages yet."));
      return;
    }
    console.log(chalk20.bold("\n  Team Messages (last 10)\n"));
    const msgs = [...result.data].reverse();
    const maxNameLen = Math.max(...msgs.map((m) => (m.profiles?.username || "?").length));
    for (const msg of msgs) {
      const name = (msg.profiles?.username || "?").padEnd(maxNameLen);
      const age = formatAge2(msg.created_at);
      console.log(`  ${chalk20.cyanBright(name)}  ${msg.body}  ${chalk20.dim(age)}`);
    }
    console.log("");
  }
});

// src/team/commands/discord.ts
import { Command as Command30 } from "commander";
import chalk21 from "chalk";
var discordCommand = new Command30("discord").description("Configure Discord webhook for team notifications").argument("[webhook-url]", "Discord webhook URL (omit to show status)").option("--off", "Disable Discord notifications").action(async (webhookUrl, opts) => {
  if (!isTeamInitialized()) {
    console.log(chalk21.red("  Team not initialized. Run: vf team init --user <name>"));
    return;
  }
  const config = readTeamConfig();
  if (opts?.off) {
    if (!config.settings.discordWebhookUrl) {
      console.log(chalk21.dim("  Discord notifications are already off."));
      return;
    }
    delete config.settings.discordWebhookUrl;
    writeTeamConfig(config);
    console.log(chalk21.green("  \u2713 Discord notifications disabled."));
    return;
  }
  if (!webhookUrl) {
    if (config.settings.discordWebhookUrl) {
      const masked = config.settings.discordWebhookUrl.replace(/\/[\w-]+$/, "/****");
      console.log(chalk21.green("  \u2713 Discord notifications enabled"));
      console.log(chalk21.dim(`  Webhook: ${masked}`));
    } else {
      console.log(chalk21.dim("  Discord notifications are off."));
      console.log(chalk21.dim('  Run: vf team discord "https://discord.com/api/webhooks/..."'));
    }
    return;
  }
  try {
    const url = new URL(webhookUrl);
    if (url.protocol !== "https:") {
      console.log(chalk21.red("  Webhook URL must use HTTPS."));
      return;
    }
    if (!url.hostname.includes("discord.com") && !url.hostname.includes("discordapp.com")) {
      console.log(chalk21.yellow("  Warning: URL does not look like a Discord webhook."));
      console.log(chalk21.dim("  Expected: https://discord.com/api/webhooks/..."));
    }
  } catch {
    console.log(chalk21.red("  Invalid URL format."));
    return;
  }
  console.log(chalk21.dim("  Testing webhook..."));
  const ok = await testDiscordWebhook(webhookUrl, config.teamName);
  if (!ok) {
    console.log(chalk21.red("  Webhook test failed. Check the URL and try again."));
    return;
  }
  config.settings.discordWebhookUrl = webhookUrl;
  writeTeamConfig(config);
  console.log(chalk21.green("  \u2713 Discord notifications enabled!"));
  console.log(chalk21.dim("  A test message was sent to your channel."));
  console.log(chalk21.dim("  Task events will now post automatically."));
});

// src/team/register.ts
function register(program2) {
  const teamCmd = new Command31("team").description("Team collaboration commands");
  teamCmd.addCommand(initCommand2);
  teamCmd.addCommand(statusCommand2);
  teamCmd.addCommand(syncCommand);
  teamCmd.addCommand(whoCommand);
  teamCmd.addCommand(offlineCommand);
  teamCmd.addCommand(msgCommand2);
  teamCmd.addCommand(discordCommand);
  program2.addCommand(teamCmd);
}

// src/cloud/register.ts
import { Command as Command48 } from "commander";

// src/cloud/commands/link.ts
import { Command as Command32 } from "commander";
var linkCommand = new Command32("link").description("Link this project to a vibeteamz project").argument("<project-id>", "vibeteamz project UUID").action(async (projectId) => {
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
import { Command as Command33 } from "commander";
var unlinkCommand = new Command33("unlink").description("Remove the vibeteamz project link (stops heartbeats)").action(() => {
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
import { Command as Command34 } from "commander";
import chalk22 from "chalk";
var statusCommand3 = new Command34("status").description("Show cloud connection status").option("--ping", "Send a test heartbeat to verify connectivity").action(async (opts) => {
  let config;
  try {
    config = readCloudConfig();
  } catch (e) {
    error('Cloud config is corrupted. Re-run "vf cloud login".');
    return;
  }
  console.log(chalk22.bold("Cloud Status"));
  console.log("");
  console.log(`  API URL:      ${config.apiUrl}`);
  console.log(`  Supabase:     ${config.supabaseUrl ?? chalk22.dim("not set")}`);
  console.log(`  Logged in:    ${config.userId ? chalk22.green("yes") : chalk22.red("no")}`);
  console.log(`  Project:      ${config.projectId ?? chalk22.dim("not linked")}`);
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
import { Command as Command35 } from "commander";
import chalk23 from "chalk";
var g6 = chalk23.green;
var gB6 = chalk23.greenBright;
var y6 = chalk23.yellow;
var r4 = chalk23.red;
var d5 = chalk23.dim;
function presenceIcon(status) {
  switch (status) {
    case "active":
      return gB6("\u25CF");
    case "idle":
      return y6("\u25D0");
    case "away":
      return r4("\u25CB");
  }
}
function presenceColor(status) {
  switch (status) {
    case "active":
      return gB6;
    case "idle":
      return y6;
    case "away":
      return r4;
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
var teamCommand = new Command35("team").description("Show who is online in your vibeteamz project").action(async () => {
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
  online.sort((a, b6) => order[a.presence] - order[b6.presence]);
  console.log("");
  if (online.length === 0) {
    console.log(d5("  No teammates online."));
    console.log("");
    info('Use "vf cloud pull" for the full project dashboard.');
    return;
  }
  console.log(gB6("  ONLINE") + d5(" (vibeteamz)"));
  for (const row of online) {
    const username = row.profiles?.username ?? row.user_id.slice(0, 8);
    const icon = presenceIcon(row.presence);
    const color = presenceColor(row.presence);
    const nameStr = color(username.padEnd(12));
    const statusStr = color(row.presence.padEnd(8));
    const taskStr = row.task_id ? (chalk23.bold(row.task_id) + ": " + (row.task_title ?? "").slice(0, 20)).padEnd(28) : d5("\u2014".padEnd(28));
    const pctStr = row.progress_total > 0 ? `${Math.round(row.progress_met / row.progress_total * 100)}%`.padEnd(6) : d5("\u2014".padEnd(6));
    const ageStr = formatAge3(row.last_heartbeat);
    console.log(`  ${icon} ${nameStr}${statusStr}${taskStr}${pctStr}${d5(ageStr)}`);
  }
  const counts = { active: 0, idle: 0, away: 0 };
  for (const row of online) counts[row.presence]++;
  const parts = [];
  if (counts.active > 0) parts.push(`${counts.active} ${g6("active")}`);
  if (counts.idle > 0) parts.push(`${counts.idle} ${y6("idle")}`);
  if (counts.away > 0) parts.push(`${counts.away} ${r4("away")}`);
  console.log("");
  console.log(`  ${parts.join(", ")}`);
  const cache = readCloudCache();
  const suggestions = cache?.suggestions;
  if (suggestions && suggestions.length > 0) {
    console.log("");
    console.log(d5("  SUGGESTIONS"));
    for (const s of suggestions) {
      const icon = s.urgency === "high" ? r4("\u25CF") : s.urgency === "medium" ? y6("\u25CF") : g6("\u25CF");
      console.log(`  ${icon} ${s.message}`);
    }
  }
  console.log("");
});

// src/cloud/commands/pull.ts
import { Command as Command36 } from "commander";
import chalk24 from "chalk";
async function apiFetch(baseUrl, path13, token) {
  try {
    const res = await fetch(`${baseUrl}${path13}`, {
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
var g7 = chalk24.green;
var gB7 = chalk24.greenBright;
var gD6 = chalk24.dim.green;
var c6 = chalk24.cyan;
var cB6 = chalk24.cyanBright;
var y7 = chalk24.yellow;
var r5 = chalk24.red;
var d6 = chalk24.dim;
var b5 = chalk24.bold;
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
      return gB7("\u25CF");
    case "idle":
      return y7("\u25D0");
    case "away":
      return r5("\u25CB");
  }
}
function presenceColor2(status) {
  switch (status) {
    case "active":
      return gB7;
    case "idle":
      return y7;
    case "away":
      return r5;
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
function hLine5(char, width) {
  return char.repeat(width);
}
function boxTop5(w) {
  return gD6("\u2554" + hLine5("\u2550", w - 2) + "\u2557");
}
function boxBot5(w) {
  return gD6("\u255A" + hLine5("\u2550", w - 2) + "\u255D");
}
function boxRow5(content, w) {
  const visible = content.replace(/\x1b\[[0-9;]*m/g, "");
  const pad = Math.max(0, w - 4 - visible.length);
  return gD6("\u2551") + " " + content + " ".repeat(pad) + " " + gD6("\u2551");
}
function boxEmpty5(w) {
  return gD6("\u2551") + " ".repeat(w - 2) + gD6("\u2551");
}
function sectionHeader4(label, w) {
  const remaining = w - 6 - label.length - 4;
  return gD6("\u2560\u2500\u2500") + " " + gB7(label) + " " + gD6(hLine5("\u2500", Math.max(1, remaining)) + "\u2563");
}
var pullCommand = new Command36("pull").description("Show full project dashboard from vibeteamz").option("--json", "Output as JSON").action(async (opts) => {
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
  const W2 = 68;
  const lines = [];
  lines.push("");
  lines.push(boxTop5(W2));
  lines.push(boxRow5(
    gB7("CLOUD") + d6("://") + c6("vibeteamz") + d6(" > ") + cB6("PROJECT DASHBOARD"),
    W2
  ));
  lines.push(sectionHeader4("TEAM MEMBERS", W2));
  lines.push(boxEmpty5(W2));
  if (membersResult.success && membersResult.data.length > 0) {
    for (const m of membersResult.data) {
      const username = m.profiles?.username ?? m.user_id.slice(0, 8);
      const role = d6(m.role.padEnd(8));
      const avail = m.profiles?.availability ?? "unknown";
      const availColor = avail === "available" ? g7 : avail === "busy" ? y7 : d6;
      const availStr = availColor(avail.padEnd(14));
      const score = String(m.profiles?.score ?? 0).padEnd(7);
      const streak = m.profiles?.streak_days ? `${m.profiles.streak_days}d streak` : "";
      lines.push(boxRow5(
        "   " + gB7("\u25CF") + " " + cB6(username.padEnd(12)) + role + availStr + score + d6(streak),
        W2
      ));
    }
  } else {
    lines.push(boxRow5(d6("   No members found."), W2));
  }
  lines.push(sectionHeader4("ONLINE NOW", W2));
  lines.push(boxEmpty5(W2));
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
      onlineRows.sort((a, b6) => order[a.ps] - order[b6.ps]);
      for (const row of onlineRows) {
        const username = row.profiles?.username ?? row.user_id.slice(0, 8);
        const icon = presenceIcon2(row.ps);
        const color = presenceColor2(row.ps);
        const nameStr = color(username.padEnd(12));
        const statusStr = color(row.ps.padEnd(8));
        const taskStr = row.task_id ? (b5(row.task_id) + ": " + (row.task_title ?? "").slice(0, 16)).padEnd(24) : d6("\u2014".padEnd(24));
        const pctStr = row.progress_total > 0 ? `${Math.round(row.progress_met / row.progress_total * 100)}%`.padEnd(6) : d6("\u2014".padEnd(6));
        const ageStr = formatAge4(row.last_heartbeat);
        lines.push(boxRow5(
          "   " + icon + " " + nameStr + statusStr + taskStr + pctStr + d6(ageStr),
          W2
        ));
      }
    } else {
      lines.push(boxRow5(d6("   No teammates online."), W2));
    }
  } else {
    lines.push(boxRow5(d6("   No presence data."), W2));
  }
  lines.push(sectionHeader4("TASKS", W2));
  lines.push(boxEmpty5(W2));
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
    const msKeys = [...byMilestone.keys()].sort((a, b6) => {
      if (a === null) return 1;
      if (b6 === null) return -1;
      return 0;
    });
    for (const msId of msKeys) {
      const groupTasks = byMilestone.get(msId);
      const doneCount = groupTasks.filter((t) => t.status === "done").length;
      const total = groupTasks.length;
      const pct = total > 0 ? Math.round(doneCount / total * 100) : 0;
      const msTitle = msId ? msMap.get(msId)?.title ?? msId.slice(0, 8) : "Backlog";
      const msIcon = msId ? y7("\u25C9") : d6("\u2261");
      const progressWidth = 16;
      const filled = total > 0 ? Math.round(doneCount / total * progressWidth) : 0;
      const bar = y7("\u2588".repeat(filled)) + d6("\u2591".repeat(progressWidth - filled));
      const statsStr = d6(`${doneCount}/${total}`) + " " + (pct > 0 ? y7(`${pct}%`) : d6("0%"));
      lines.push(boxRow5(
        "   " + msIcon + " " + b5(msTitle.padEnd(24)) + bar + " " + statsStr,
        W2
      ));
      const openTasks = groupTasks.filter((t) => t.status !== "done");
      for (const t of openTasks) {
        const icon = t.status === "in_progress" ? c6("\u25D0") : chalk24.white("\u25CB");
        const title = t.title.length > 36 ? t.title.slice(0, 33) + "..." : t.title;
        const owner = t.assigned_to === config.userId ? d6("@you") : t.assigned_to ? d6(t.assigned_to.slice(0, 8)) : d6("");
        lines.push(boxRow5(
          "      " + icon + " " + title.padEnd(38) + owner,
          W2
        ));
      }
      lines.push(boxEmpty5(W2));
    }
    const totalAll = allTasks.length;
    const totalDone = allTasks.filter((t) => t.status === "done").length;
    const totalActive = allTasks.filter((t) => t.status === "in_progress").length;
    const parts = [];
    parts.push(`${totalDone}/${totalAll} done`);
    if (totalActive > 0) parts.push(c6(`${totalActive} active`));
    if (milestones.length > 0) parts.push(`${milestones.length} milestone${milestones.length > 1 ? "s" : ""}`);
    lines.push(boxRow5(d6("   " + parts.join(" \xB7 ")), W2));
  } else {
    lines.push(boxRow5(d6("   No tasks."), W2));
  }
  lines.push(sectionHeader4("RECENT ACTIVITY", W2));
  lines.push(boxEmpty5(W2));
  if (activityResult.success && activityResult.data.length > 0) {
    for (const a of activityResult.data.slice(0, 8)) {
      const username = a.profiles?.username ?? "???";
      const msg = a.message ?? a.type;
      const age = formatAge4(a.created_at);
      const msgTrimmed = msg.length > 38 ? msg.slice(0, 35) + "..." : msg;
      lines.push(boxRow5(
        "   " + cB6(username.padEnd(8)) + d6(msgTrimmed.padEnd(40)) + d6(age),
        W2
      ));
    }
  } else {
    lines.push(boxRow5(d6("   No recent activity."), W2));
  }
  if (sessionsResult.success && sessionsResult.data.length > 0) {
    const activeSessions = sessionsResult.data.filter((s) => !s.ended_at);
    if (activeSessions.length > 0) {
      lines.push(sectionHeader4("ACTIVE SESSIONS", W2));
      lines.push(boxEmpty5(W2));
      for (const s of activeSessions) {
        const started = formatAge4(s.started_at);
        const participants = Array.isArray(s.participants) ? s.participants.length : 0;
        lines.push(boxRow5(
          "   " + g7("\u25B6") + d6(` Started ${started}`) + d6(` \xB7 ${participants} participant${participants !== 1 ? "s" : ""}`),
          W2
        ));
      }
    }
  }
  lines.push(boxEmpty5(W2));
  lines.push(boxBot5(W2));
  lines.push("");
  console.log(lines.join("\n"));
});

// src/cloud/commands/push.ts
import { Command as Command37 } from "commander";
var pushCommand = new Command37("push").description("Post a message to your vibeteamz project team chat").argument("<message>", "Message to post").action(async (message) => {
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
import { Command as Command38 } from "commander";
var msgCommand3 = new Command38("msg").description("Send a message to your project team chat").argument("<message>", "Message to send").option("--to <usernames...>", "Mention users (auto-adds @ prefix)").option("--reply <message-id>", "Reply to a message").action(async (message, opts) => {
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
import { Command as Command39 } from "commander";
var milestoneCommand = new Command39("milestone").description("Create a milestone in your project").argument("<title>", "Milestone title").option("--description <text>", "Milestone description").option("--due <date>", "Due date (YYYY-MM-DD)").action(async (title, opts) => {
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
import { Command as Command40 } from "commander";
import chalk25 from "chalk";
function progressBar3(pct, width = 20) {
  const filled = Math.round(pct / 100 * width);
  const empty = width - filled;
  const color = pct >= 100 ? chalk25.greenBright : pct >= 50 ? chalk25.yellow : chalk25.red;
  return color("\u2593".repeat(filled)) + chalk25.dim("\u2591".repeat(empty));
}
var milestonesCommand = new Command40("milestones").description("List milestones with progress").action(async () => {
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
      console.log(chalk25.dim('  No milestones yet. Create one: vf vibeteamz milestone "Title"'));
      return;
    }
    console.log("");
    for (const ms of milestones) {
      const total = ms.tasks.length;
      const done = ms.tasks.filter((t) => t.status === "done").length;
      const pct = total > 0 ? Math.round(done / total * 100) : 0;
      const statusIcon2 = ms.status === "completed" ? chalk25.green("\u2713") : ms.status === "in_progress" ? chalk25.cyan("\u25B6") : chalk25.dim("\u25CB");
      const dueStr = ms.due_date ? chalk25.dim(` due ${ms.due_date}`) : "";
      console.log(`  ${statusIcon2} ${chalk25.bold(ms.title)}${dueStr}`);
      console.log(`    ${progressBar3(pct)} ${pct}%  ${chalk25.dim(`${done}/${total} tasks`)}  ${chalk25.dim(ms.id.slice(0, 8))}`);
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
import { Command as Command41 } from "commander";
var noteCommand2 = new Command41("note").description("Post a note to project activity feed").argument("<text>", "Note text").action(async (text) => {
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
import { Command as Command42 } from "commander";
import chalk26 from "chalk";
var g8 = chalk26.green;
var gB8 = chalk26.greenBright;
var d7 = chalk26.dim;
function statusIcon(status) {
  switch (status) {
    case "todo":
      return chalk26.white("\u25CB");
    case "in_progress":
      return chalk26.cyan("\u25D0");
    case "done":
      return gB8("\u25CF");
    default:
      return d7("\xB7");
  }
}
function statusLabel(status) {
  switch (status) {
    case "todo":
      return chalk26.white("todo");
    case "in_progress":
      return chalk26.cyan("active");
    case "done":
      return gB8("done");
    default:
      return d7(status);
  }
}
function getAuthToken(config) {
  return config.apiKey ?? config.accessToken;
}
async function apiFetch2(config, path13, opts) {
  const token = getAuthToken(config);
  return fetch(`${config.apiUrl}${path13}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      ...opts?.headers ?? {}
    },
    signal: AbortSignal.timeout(1e4)
  });
}
var tasksCommand = new Command42("tasks").description("List project tasks").option("--mine", "Only show tasks assigned to you").option("--all", "Include completed tasks").action(async (opts) => {
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
      console.log(d7("  No tasks found."));
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
    const msKeys = [...byMilestone.keys()].sort((a, b6) => {
      if (a === null) return 1;
      if (b6 === null) return -1;
      return 0;
    });
    for (const msId of msKeys) {
      const msTitle = msId ? msMap.get(msId)?.title ?? msId.slice(0, 8) : "Backlog";
      const groupTasks = byMilestone.get(msId);
      const done = groupTasks.filter((t) => t.status === "done").length;
      const total = groupTasks.length;
      console.log(chalk26.bold(`  ${msTitle}`) + d7(` (${done}/${total})`));
      for (const t of groupTasks) {
        const icon = statusIcon(t.status);
        const label = statusLabel(t.status).padEnd(16);
        const title = t.title.slice(0, 40).padEnd(42);
        const assignee = t.assignee?.username ? d7(`@${t.assignee.username}`) : t.assigned_to === config.userId ? d7("@you") : d7("unassigned");
        const idStr = d7(t.id.slice(0, 8));
        console.log(`    ${icon} ${label}${title}${assignee}  ${idStr}`);
      }
      console.log("");
    }
    const todoCount = filtered.filter((t) => t.status === "todo").length;
    const activeCount = filtered.filter((t) => t.status === "in_progress").length;
    const doneCount = filtered.filter((t) => t.status === "done").length;
    const parts = [];
    if (todoCount > 0) parts.push(`${todoCount} todo`);
    if (activeCount > 0) parts.push(`${activeCount} ${chalk26.cyan("active")}`);
    if (doneCount > 0) parts.push(`${doneCount} ${g8("done")}`);
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
var taskCommand = new Command42("task").description("Manage a specific task (claim, start, done, create)");
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
    console.log(`  ${statusIcon(task.status)} ${chalk26.bold(task.title)}`);
    console.log("");
    const rows = [];
    rows.push(["Status", statusLabel(task.status)]);
    rows.push(["Priority", task.priority === "normal" ? d7("normal") : chalk26.bold(task.priority)]);
    if (task.assignee) {
      rows.push(["Assigned to", `@${task.assignee.username}${task.assignee.display_name ? ` (${task.assignee.display_name})` : ""}`]);
    } else {
      rows.push(["Assigned to", d7("unassigned")]);
    }
    if (milestoneName) {
      rows.push(["Milestone", milestoneName]);
    }
    if (task.due_date) {
      const overdue = new Date(task.due_date) < /* @__PURE__ */ new Date() && task.status !== "done";
      rows.push(["Due", overdue ? chalk26.red(task.due_date) : task.due_date]);
    }
    rows.push(["ID", d7(task.id)]);
    for (const [label, value] of rows) {
      console.log(`  ${d7(label.padEnd(14))}${value}`);
    }
    if (task.description) {
      console.log("");
      console.log(d7("  Description"));
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
import { Command as Command43 } from "commander";
import chalk27 from "chalk";
var d8 = chalk27.dim;
function typeIcon(type) {
  switch (type) {
    case "mention":
      return chalk27.cyan("@");
    case "task_assigned":
      return chalk27.yellow("\u2192");
    case "task_completed":
      return chalk27.green("\u2713");
    case "member_joined":
      return chalk27.green("+");
    case "milestone_completed":
      return chalk27.magenta("\u2605");
    default:
      return d8("\xB7");
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
var notificationsCommand = new Command43("notifications").description("List your notifications").option("--all", "Include read notifications").action(async (opts) => {
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
      console.log(d8("  No notifications."));
      console.log("");
      return;
    }
    const filtered = opts.all ? notifications : notifications.filter((n) => !n.read_at);
    if (filtered.length === 0) {
      console.log(d8("  No unread notifications."));
      if (!opts.all) info("Use --all to see read notifications.");
      console.log("");
      return;
    }
    for (const n of filtered) {
      const icon = typeIcon(n.type);
      const actor = n.actor?.display_name || n.actor?.username || "someone";
      const unread = !n.read_at ? chalk27.yellowBright(" \u25CF") : "";
      const age = d8(timeAgo(n.created_at));
      console.log(`  ${icon}${unread} ${chalk27.bold(actor)} ${n.title}  ${age}`);
      if (n.body) {
        console.log(`    ${d8(n.body.slice(0, 80))}`);
      }
    }
    console.log("");
    if (unread_count > 0) {
      console.log(`  ${chalk27.yellowBright(unread_count)} unread`);
    } else {
      console.log(`  ${d8("All caught up")}`);
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
var readAllCommand = new Command43("read-all").description("Mark all notifications as read").action(async () => {
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
import { Command as Command44 } from "commander";
import chalk28 from "chalk";
var d9 = chalk28.dim;
function typeIcon2(type) {
  switch (type) {
    case "task_started":
      return chalk28.cyan("\u25B6");
    case "task_completed":
      return chalk28.green("\u2713");
    case "member_joined":
      return chalk28.green("+");
    case "member_left":
      return chalk28.red("-");
    case "session_started":
      return chalk28.magenta("\u25CF");
    case "commit":
      return chalk28.yellow("\u2022");
    case "note":
      return chalk28.blue("\u2022");
    case "review":
      return chalk28.cyan("\u2022");
    default:
      return d9("\xB7");
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
var activityCommand = new Command44("activity").description("View project activity feed").option("--limit <n>", "Number of entries to show", "20").action(async (opts) => {
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
      console.log(d9("  No activity yet."));
      console.log("");
      return;
    }
    console.log(chalk28.bold("  Activity Feed"));
    console.log("");
    for (const a of activities) {
      const icon = typeIcon2(a.type);
      const who = a.profiles?.username ?? "system";
      const age = d9(timeAgo2(a.created_at));
      console.log(`  ${icon} ${chalk28.bold(who)} ${a.message}  ${age}`);
    }
    console.log("");
    console.log(d9(`  ${activities.length} entries shown`));
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
import { Command as Command45 } from "commander";
import chalk29 from "chalk";
var d10 = chalk29.dim;
function roleColor(role) {
  switch (role) {
    case "owner":
      return chalk29.yellow;
    case "admin":
      return chalk29.cyan;
    case "member":
      return chalk29.white;
    case "viewer":
      return chalk29.dim;
    case "pending":
      return chalk29.dim;
    default:
      return chalk29.white;
  }
}
function availIcon(avail) {
  switch (avail) {
    case "available":
      return chalk29.green("\u25CF");
    case "busy":
      return chalk29.red("\u25CF");
    case "looking":
      return chalk29.yellow("\u25CF");
    default:
      return d10("\u25CB");
  }
}
function getAuthToken4(config) {
  return config.apiKey ?? config.accessToken;
}
var membersCommand = new Command45("members").description("List project members").action(async () => {
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
      console.log(d10("  No members found."));
      console.log("");
      return;
    }
    const active = members.filter((m) => m.role !== "pending");
    const pending = members.filter((m) => m.role === "pending");
    console.log(chalk29.bold("  Team Members") + d10(` (${active.length})`));
    console.log("");
    for (const m of active) {
      const name = m.profiles?.display_name || m.profiles?.username || m.user_id.slice(0, 8);
      const username = m.profiles?.username ?? m.user_id.slice(0, 8);
      const avail = availIcon(m.profiles?.availability ?? null);
      const role = roleColor(m.role)(m.role.padEnd(8));
      const isYou = m.user_id === config.userId ? chalk29.dim(" (you)") : "";
      const nameStr = name === username ? username : `${name} ${d10(`@${username}`)}`;
      console.log(`  ${avail} ${nameStr.padEnd(28)}${role}${isYou}`);
    }
    if (pending.length > 0) {
      console.log("");
      console.log(chalk29.yellow("  Pending Requests") + d10(` (${pending.length})`));
      for (const m of pending) {
        const name = m.profiles?.display_name || m.profiles?.username || m.user_id.slice(0, 8);
        console.log(`  ${d10("\u25CB")} ${d10(name)}`);
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
import { Command as Command46 } from "commander";
import chalk30 from "chalk";
var d11 = chalk30.dim;
function statusColor(status) {
  switch (status) {
    case "recruiting":
      return chalk30.green;
    case "active":
      return chalk30.yellow;
    case "completed":
      return chalk30.dim;
    default:
      return chalk30.white;
  }
}
function getAuthToken5(config) {
  return config.apiKey ?? config.accessToken;
}
var projectInfoCommand = new Command46("project").description("View linked project details").action(async () => {
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
    console.log(chalk30.bold(`  ${project.name}`) + "  " + statusColor(project.status)(project.status));
    if (project.owner) {
      const ownerName = project.owner.display_name || project.owner.username;
      console.log(d11(`  by @${project.owner.username}${ownerName !== project.owner.username ? ` (${ownerName})` : ""}`));
    }
    console.log("");
    if (project.tagline) {
      console.log(`  ${project.tagline}`);
      console.log("");
    }
    if (project.description) {
      const desc = project.description.length > 200 ? project.description.slice(0, 197) + "..." : project.description;
      console.log(d11(`  ${desc}`));
      console.log("");
    }
    const rows = [];
    rows.push(["Category", project.category]);
    rows.push(["Max Members", String(project.max_members)]);
    if (project.repo_url) rows.push(["Repo", project.repo_url]);
    rows.push(["ID", d11(project.id)]);
    for (const [label, value] of rows) {
      console.log(`  ${d11(label.padEnd(14))}${value}`);
    }
    if (project.tech_stack.length > 0) {
      console.log("");
      console.log(`  ${d11("Tech Stack")}    ${project.tech_stack.map((t) => chalk30.cyan(t)).join(d11(", "))}`);
    }
    if (project.roles_needed.length > 0) {
      console.log(`  ${d11("Looking for")}   ${project.roles_needed.map((r6) => chalk30.yellow(r6)).join(d11(", "))}`);
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
import { Command as Command47 } from "commander";
import chalk31 from "chalk";
var d12 = chalk31.dim;
function roleColor2(role) {
  switch (role) {
    case "owner":
      return chalk31.yellow;
    case "admin":
      return chalk31.cyan;
    case "member":
      return chalk31.white;
    default:
      return chalk31.white;
  }
}
function getAuthToken6(config) {
  return config.apiKey ?? config.accessToken;
}
async function apiFetch3(config, path13, opts) {
  const token = getAuthToken6(config);
  return fetch(`${config.apiUrl}${path13}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      ...opts?.headers ?? {}
    },
    signal: AbortSignal.timeout(1e4)
  });
}
var orgCommand = new Command47("org").description("Organization management commands");
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
      console.log(d12("  No organizations found."));
      console.log("");
      return;
    }
    console.log(chalk31.bold("  Organizations") + d12(` (${orgs.length})`));
    console.log("");
    for (const org of orgs) {
      const owner = org.owner?.username ? d12(` @${org.owner.username}`) : "";
      console.log(`  ${chalk31.bold(org.name)}${owner}`);
      if (org.description) {
        console.log(`    ${d12(org.description.slice(0, 60))}`);
      }
      console.log(`    ${d12(org.id.slice(0, 8))}`);
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
      console.log(d12("  No members found."));
      console.log("");
      return;
    }
    console.log(chalk31.bold("  Org Members") + d12(` (${members.length})`));
    console.log("");
    for (const m of members) {
      const name = m.profile?.display_name || m.profile?.username || m.user_id.slice(0, 8);
      const username = m.profile?.username ?? m.user_id.slice(0, 8);
      const role = roleColor2(m.role)(m.role.padEnd(8));
      const isYou = m.user_id === config.userId ? chalk31.dim(" (you)") : "";
      console.log(`  ${name.padEnd(24)}${role}  ${d12(`@${username}`)}${isYou}`);
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
      console.log(d12("  No projects in this org."));
      console.log("");
      return;
    }
    console.log(chalk31.bold("  Org Projects") + d12(` (${projects.length})`));
    console.log("");
    for (const p of projects) {
      const statusFn = p.status === "recruiting" ? chalk31.green : p.status === "active" ? chalk31.yellow : chalk31.dim;
      console.log(`  ${chalk31.bold(p.name.padEnd(28))}${statusFn(p.status.padEnd(12))}${d12(p.id.slice(0, 8))}`);
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
function registerCloud(program2) {
  const primaryCmd = new Command48("vibeteamz").description("vibeteamz cloud integration commands");
  primaryCmd.addCommand(loginCommand);
  primaryCmd.addCommand(linkCommand);
  primaryCmd.addCommand(unlinkCommand);
  primaryCmd.addCommand(statusCommand3);
  primaryCmd.addCommand(teamCommand);
  primaryCmd.addCommand(pullCommand);
  primaryCmd.addCommand(pushCommand);
  primaryCmd.addCommand(msgCommand3);
  primaryCmd.addCommand(milestoneCommand);
  primaryCmd.addCommand(milestonesCommand);
  primaryCmd.addCommand(noteCommand2);
  primaryCmd.addCommand(tasksCommand);
  primaryCmd.addCommand(taskCommand);
  primaryCmd.addCommand(notificationsCommand);
  primaryCmd.addCommand(activityCommand);
  primaryCmd.addCommand(membersCommand);
  primaryCmd.addCommand(projectInfoCommand);
  primaryCmd.addCommand(orgCommand);
  program2.addCommand(primaryCmd);
  const vtCmd = new Command48("vt").description("Short alias for vibeteamz");
  vtCmd.allowUnknownOption(true);
  vtCmd.allowExcessArguments(true);
  vtCmd.action((_opts, cmd) => {
    primaryCmd.parseAsync(["node", "vf-vt", ...cmd.args]);
  });
  program2.addCommand(vtCmd);
  const sayCmd = new Command48("say").description("Send a message to team chat (shortcut for vibeteamz msg)").argument("<message>", "Message to send").option("--to <usernames...>", "Mention users (auto-adds @ prefix)").option("--reply <message-id>", "Reply to a message").action(async (message, opts) => {
    const args = ["node", "vf-say", message];
    if (opts.to?.length) {
      args.push("--to", ...opts.to);
    }
    if (opts.reply) {
      args.push("--reply", opts.reply);
    }
    await msgCommand3.parseAsync(args);
  });
  program2.addCommand(sayCmd);
  const aliasCmd = new Command48("cloud").description("Alias for vibeteamz (deprecated)");
  aliasCmd.hidden = true;
  aliasCmd.allowUnknownOption(true);
  aliasCmd.allowExcessArguments(true);
  aliasCmd.action((_opts, cmd) => {
    primaryCmd.parseAsync(["node", "vf-cloud", ...cmd.args]);
  });
  program2.addCommand(aliasCmd);
}

// src/index.ts
var program = new Command49();
program.name("vf").description("Vibe Focus - Focus Guardian for vibe coding sessions").version("0.2.0");
program.addCommand(initCommand);
program.addCommand(addCommand);
program.addCommand(startCommand);
program.addCommand(doneCommand);
program.addCommand(statusCommand);
program.addCommand(listCommand);
program.addCommand(switchCommand);
program.addCommand(abandonCommand);
program.addCommand(checkCommand);
program.addCommand(scopeCommand);
program.addCommand(promptCommand);
program.addCommand(dashCommand);
program.addCommand(guardCommand);
program.addCommand(flowCommand);
program.addCommand(superflowCommand);
program.addCommand(noteCommand);
program.addCommand(contextCommand);
program.addCommand(historyCommand);
program.addCommand(watchCommand);
program.addCommand(hookCommand);
program.addCommand(msgCommand);
program.addCommand(setupCommand);
program.addCommand(joinCommand);
program.addCommand(allCommand);
register(program);
registerCloud(program);
program.action(() => {
  try {
    statusCommand.parse(process.argv);
  } catch {
    program.help();
  }
});
program.parseAsync();
