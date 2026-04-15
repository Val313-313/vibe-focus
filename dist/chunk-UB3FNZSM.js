// src/commands/guard.ts
import fs4 from "fs";
import path4 from "path";
import { fileURLToPath } from "url";
import { Command } from "commander";
import chalk2 from "chalk";

// src/core/state.ts
import fs2 from "fs";
import path2 from "path";

// src/core/shared-log.ts
import fs from "fs";
import os from "os";
import path from "path";
var TASKS_FILE = "tasks.json";
function exportTasks(state) {
  try {
    const stateDir = getStateDir();
    const tasksPath = path.join(stateDir, TASKS_FILE);
    const tmpPath = tasksPath + ".tmp";
    const exported = state.tasks.map(({ worker, ...rest }) => rest);
    const data = {
      projectName: state.projectName,
      nextTaskNumber: state.nextTaskNumber,
      tasks: exported
    };
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + "\n");
    fs.renameSync(tmpPath, tasksPath);
  } catch {
  }
}
function importTasks(stateDir) {
  try {
    const tasksPath = path.join(stateDir, TASKS_FILE);
    if (!fs.existsSync(tasksPath)) return null;
    const raw = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));
    if (!Array.isArray(raw.tasks) || raw.tasks.length === 0) return null;
    const tasks = raw.tasks.map((t) => ({ ...t, worker: null }));
    const nextTaskNumber = typeof raw.nextTaskNumber === "number" ? raw.nextTaskNumber : tasks.length + 1;
    return { tasks, nextTaskNumber };
  } catch {
    return null;
  }
}

// src/core/state.ts
var STATE_DIR = ".vibe-focus";
var STATE_FILE = "state.json";
function findProjectRoot() {
  let dir = process.cwd();
  while (dir !== path2.dirname(dir)) {
    if (fs2.existsSync(path2.join(dir, STATE_DIR, STATE_FILE))) {
      return dir;
    }
    dir = path2.dirname(dir);
  }
  throw new Error('Not a vibe-focus project. Run "vf init" to initialize.');
}
function getStatePath() {
  const root = findProjectRoot();
  return path2.join(root, STATE_DIR, STATE_FILE);
}
function getStateDir() {
  const root = findProjectRoot();
  return path2.join(root, STATE_DIR);
}
function readState() {
  const filePath = getStatePath();
  const raw = fs2.readFileSync(filePath, "utf-8");
  const state = JSON.parse(raw);
  if (!state.notes) state.notes = [];
  if (!state.nextNoteNumber) state.nextNoteNumber = 1;
  if (!state.sessionContexts) state.sessionContexts = [];
  if (!state.nextContextNumber) state.nextContextNumber = 1;
  if (!state.activeWorkers) state.activeWorkers = {};
  if (!state.workerMeta) state.workerMeta = {};
  for (const t of state.tasks) {
    if (t.worker === void 0) t.worker = null;
  }
  return state;
}
function writeState(state) {
  const filePath = getStatePath();
  const tmpPath = filePath + ".tmp";
  fs2.writeFileSync(tmpPath, JSON.stringify(state, null, 2), { mode: 384 });
  fs2.renameSync(tmpPath, filePath);
  exportTasks(state);
}
function updateState(fn) {
  const state = readState();
  const newState = fn(state);
  writeState(newState);
}
function createEmptyState(projectName) {
  return {
    version: 1,
    projectName,
    projectScope: null,
    activeTaskId: null,
    activeWorkers: {},
    workerMeta: {},
    nextTaskNumber: 1,
    tasks: [],
    notes: [],
    nextNoteNumber: 1,
    currentSession: null,
    focusEvents: [],
    sessionContexts: [],
    nextContextNumber: 1
  };
}
function initProject(projectName) {
  const dir = path2.join(process.cwd(), STATE_DIR);
  if (fs2.existsSync(path2.join(dir, STATE_FILE))) {
    throw new Error('Already initialized. Use "vf status" to see current state.');
  }
  fs2.mkdirSync(dir, { recursive: true });
  fs2.writeFileSync(path2.join(dir, ".gitignore"), "state.json\nstate.json.tmp\ntasks.json.tmp\nconfig.json\n");
  const state = createEmptyState(projectName);
  const imported = importTasks(dir);
  let importedCount = 0;
  if (imported) {
    state.tasks = imported.tasks;
    state.nextTaskNumber = imported.nextTaskNumber;
    importedCount = imported.tasks.length;
  }
  fs2.writeFileSync(path2.join(dir, STATE_FILE), JSON.stringify(state, null, 2), { mode: 384 });
  return { dir, importedCount };
}

// src/utils/id.ts
function generateTaskId(num) {
  return `t${num}`;
}
function generateCriterionId(taskId, index) {
  return `${taskId}-c${index + 1}`;
}

// src/utils/time.ts
function now() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function elapsedMinutes(since) {
  const start = new Date(since).getTime();
  const current = Date.now();
  return Math.round((current - start) / 6e4);
}
function getTodayStart() {
  const d = /* @__PURE__ */ new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function formatDuration(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// src/core/task.ts
function createTask(state, title, options = {}) {
  const id = generateTaskId(state.nextTaskNumber);
  const acceptanceCriteria = (options.criteria ?? []).map(
    (text, i) => ({
      id: generateCriterionId(id, i),
      text,
      met: false
    })
  );
  const task = {
    id,
    title,
    description: options.description ?? "",
    status: "backlog",
    acceptanceCriteria,
    dependencies: options.dependencies ?? [],
    tags: options.tags ?? [],
    createdAt: now(),
    startedAt: null,
    completedAt: null,
    abandonedAt: null,
    abandonReason: null,
    switchCount: 0,
    worker: null
  };
  return {
    task,
    state: {
      ...state,
      nextTaskNumber: state.nextTaskNumber + 1,
      tasks: [...state.tasks, task]
    }
  };
}
function getActiveTask(state) {
  if (!state.activeTaskId) return null;
  return state.tasks.find((t) => t.id === state.activeTaskId) ?? null;
}
function getActiveTaskForWorker(state, worker) {
  const taskId = state.activeWorkers?.[worker];
  if (!taskId) return null;
  return state.tasks.find((t) => t.id === taskId) ?? null;
}
function getAllActiveWorkers(state) {
  const result = [];
  for (const [worker, taskId] of Object.entries(state.activeWorkers ?? {})) {
    const task = state.tasks.find((t) => t.id === taskId);
    if (task && task.status === "active") {
      result.push({ worker, task });
    }
  }
  return result;
}
function resolveActiveTask(state, worker) {
  if (worker && state.activeWorkers?.[worker]) {
    const taskId = state.activeWorkers[worker];
    return state.tasks.find((t) => t.id === taskId) ?? null;
  }
  return getActiveTask(state);
}
function cleanupWorkers(state, taskId, worker) {
  const newWorkers = { ...state.activeWorkers };
  if (worker && newWorkers[worker]) delete newWorkers[worker];
  for (const [w, tid] of Object.entries(newWorkers)) {
    if (tid === taskId) delete newWorkers[w];
  }
  return {
    activeTaskId: state.activeTaskId === taskId ? null : state.activeTaskId,
    activeWorkers: newWorkers
  };
}
function getTask(state, id) {
  return state.tasks.find((t) => t.id === id) ?? null;
}
function updateTask(state, id, updates) {
  return {
    ...state,
    tasks: state.tasks.map((t) => t.id === id ? { ...t, ...updates } : t)
  };
}
function criteriaProgress(task) {
  const total = task.acceptanceCriteria.length;
  const met = task.acceptanceCriteria.filter((c) => c.met).length;
  return { met, total };
}
function resolveWorker(opts) {
  return opts.worker ?? process.env.VF_WORKER ?? void 0;
}
function unmetDependencies(state, task) {
  return task.dependencies.filter((depId) => {
    const dep = state.tasks.find((t) => t.id === depId);
    return !dep || dep.status !== "done";
  });
}

// src/generators/rules-md.ts
function generateRulesMd(state) {
  const lines = [];
  const active = getActiveTask(state);
  lines.push("# VIBE FOCUS - STRICT ENFORCEMENT RULES");
  lines.push("");
  lines.push("> These rules are auto-generated by vibe-focus. They override any conflicting instructions.");
  lines.push("> The user has explicitly opted into strict focus enforcement to prevent context collapse.");
  lines.push("");
  if (state.projectScope) {
    lines.push("## Project Definition");
    lines.push(`- **Project:** ${state.projectName}`);
    lines.push(`- **Purpose:** ${state.projectScope.purpose}`);
    lines.push("");
    if (state.projectScope.inScope.length > 0) {
      lines.push("### Allowed Work (In Scope)");
      for (const item of state.projectScope.inScope) {
        lines.push(`- ${item}`);
      }
      lines.push("");
    }
    if (state.projectScope.outOfScope.length > 0) {
      lines.push("### FORBIDDEN Work (Out of Scope)");
      lines.push("**You MUST refuse to work on any of the following, even if the user asks:**");
      for (const item of state.projectScope.outOfScope) {
        lines.push(`- ${item}`);
      }
      lines.push("");
      lines.push("If the user requests work on an out-of-scope item, respond with:");
      lines.push(`> "That's out of scope for this project. I've noted it as a TODO. Let's stay focused on the current task."`);
      lines.push("");
    }
    if (state.projectScope.boundaries.length > 0) {
      lines.push("### Boundaries");
      for (const b of state.projectScope.boundaries) {
        lines.push(`- ${b}`);
      }
      lines.push("");
    }
  }
  if (active) {
    const { met, total } = criteriaProgress(active);
    lines.push("## CURRENT TASK (MANDATORY FOCUS)");
    lines.push("");
    lines.push(`**${active.id}: ${active.title}**`);
    if (active.description) {
      lines.push("");
      lines.push(active.description);
    }
    lines.push("");
    if (total > 0) {
      lines.push("### Acceptance Criteria (Definition of Done)");
      lines.push(`Progress: ${met}/${total} complete`);
      lines.push("");
      for (const c of active.acceptanceCriteria) {
        lines.push(`- [${c.met ? "x" : " "}] ${c.text}`);
      }
      lines.push("");
    }
    lines.push("## STRICT FOCUS ENFORCEMENT");
    lines.push("");
    lines.push("### Before EVERY response, check:");
    lines.push(`1. Does this request relate to task ${active.id} ("${active.title}")?`);
    lines.push("2. Does this request fall within the project scope?");
    lines.push("3. Am I about to modify code unrelated to the current task?");
    lines.push("");
    lines.push("### If the answer to any check is NO:");
    lines.push("1. **STOP** - Do not proceed with the request");
    lines.push("2. **REMIND** the user of the current task and remaining criteria");
    lines.push('3. **SUGGEST** adding the new idea with `vf add "their idea"` for later');
    lines.push("4. **REDIRECT** back to the current task");
    lines.push("");
    lines.push("Example response when user deviates:");
    lines.push(`> "Hold on - we're currently focused on **` + active.title + "** and still have " + (total - met) + " criteria to complete:");
    for (const c of active.acceptanceCriteria.filter((c2) => !c2.met)) {
      lines.push(">  - " + c.text);
    }
    lines.push("> ");
    lines.push('> If this new idea is important, save it for later: `vf add "your idea"`');
    lines.push(`> Let's finish what we started first."`);
    lines.push("");
    lines.push("### Rules:");
    lines.push(`- ONLY work on task ${active.id} as described above`);
    lines.push("- Do NOT start any other task, feature, or refactoring");
    lines.push('- Do NOT "quickly fix" unrelated things - add a TODO comment instead');
    lines.push("- Do NOT expand scope beyond the acceptance criteria");
    lines.push("- Do NOT modify files unrelated to the current task unless absolutely necessary");
    lines.push("- If the user insists on deviating, remind them ONE MORE TIME, then comply but note the deviation");
    lines.push("- When all criteria are met, run `vf check --all && vf done` and STOP");
    lines.push("");
  } else {
    lines.push("## NO ACTIVE TASK");
    lines.push("");
    lines.push("The user has no active task. Before doing any work:");
    lines.push('1. Ask the user to create a task: `vf add "task description" -c "criterion 1" "criterion 2"`');
    lines.push("2. Ask them to start it: `vf start t<id>`");
    lines.push("3. Only then begin working");
    lines.push("");
    lines.push("This ensures all work is tracked and scoped.");
    lines.push("");
  }
  if (state.sessionContexts.length > 0) {
    const latest = state.sessionContexts[state.sessionContexts.length - 1];
    lines.push("## SESSION CONTEXT");
    lines.push("");
    lines.push(`> Last saved: ${latest.savedAt}`);
    lines.push("");
    lines.push(`**Summary:** ${latest.summary}`);
    lines.push("");
    if (latest.decisions?.length) {
      lines.push("### Key Decisions");
      for (const d of latest.decisions) {
        lines.push(`- ${d}`);
      }
      lines.push("");
    }
    if (latest.openQuestions?.length) {
      lines.push("### Open Questions");
      for (const q of latest.openQuestions) {
        lines.push(`- ${q}`);
      }
      lines.push("");
    }
    if (latest.projectState) {
      lines.push(`**Project State:** ${latest.projectState}`);
      lines.push("");
    }
    if (latest.techStack?.length) {
      lines.push(`**Tech Stack:** ${latest.techStack.join(", ")}`);
      lines.push("");
    }
  }
  lines.push("## Completion Protocol");
  lines.push("When you believe a criterion is met:");
  lines.push("1. Verify it explicitly (show output, run test, demonstrate)");
  lines.push("2. Mark it: `vf check <criterion-id>`");
  lines.push("3. Move to the next unmet criterion");
  lines.push("4. When ALL criteria are met: `vf done`");
  lines.push("5. Show `vf status` to the user");
  lines.push("");
  return lines.join("\n");
}
var generateClaudeMd = generateRulesMd;

// src/agents/resolve.ts
import { existsSync } from "fs";
import { join } from "path";

// src/agents/types.ts
var AGENT_CONFIGS = {
  claude: {
    type: "claude",
    rulesDir: ".claude/rules",
    rulesFile: "vibe-focus.md",
    supportsHook: true,
    hookDir: ".claude/hooks",
    settingsFile: ".claude/settings.json",
    envDetectVar: "CLAUDE_PROJECT_DIR",
    displayName: "Claude Code"
  },
  copilot: {
    type: "copilot",
    rulesDir: ".github",
    rulesFile: "copilot-instructions.md",
    supportsHook: false,
    hookDir: null,
    settingsFile: null,
    envDetectVar: null,
    displayName: "GitHub Copilot"
  },
  cursor: {
    type: "cursor",
    rulesDir: ".cursor/rules",
    rulesFile: "vibe-focus.mdc",
    supportsHook: false,
    hookDir: null,
    settingsFile: null,
    envDetectVar: null,
    displayName: "Cursor"
  },
  windsurf: {
    type: "windsurf",
    rulesDir: "",
    rulesFile: ".windsurfrules",
    supportsHook: false,
    hookDir: null,
    settingsFile: null,
    envDetectVar: null,
    displayName: "Windsurf"
  },
  generic: {
    type: "generic",
    rulesDir: "",
    rulesFile: "",
    supportsHook: false,
    hookDir: null,
    settingsFile: null,
    envDetectVar: null,
    displayName: "Generic AI Agent"
  }
};

// src/core/config.ts
import fs3 from "fs";
import path3 from "path";
var CONFIG_FILE = "config.json";
function readConfig() {
  try {
    const configPath = path3.join(getStateDir(), CONFIG_FILE);
    if (fs3.existsSync(configPath)) {
      return JSON.parse(fs3.readFileSync(configPath, "utf-8"));
    }
  } catch {
  }
  return {};
}
function writeConfig(config) {
  const dir = getStateDir();
  fs3.mkdirSync(dir, { recursive: true });
  const configPath = path3.join(dir, CONFIG_FILE);
  fs3.writeFileSync(configPath, JSON.stringify(config, null, 2));
}
function updateConfig(updates) {
  const config = readConfig();
  writeConfig({ ...config, ...updates });
}

// src/agents/resolve.ts
var VALID_AGENTS = Object.keys(AGENT_CONFIGS);
var DIRECTORY_MARKERS = [
  ["claude", ".claude"],
  ["cursor", ".cursor"],
  ["copilot", ".github/copilot-instructions.md"],
  ["windsurf", ".windsurfrules"]
];
function isValidAgent(value) {
  return VALID_AGENTS.includes(value);
}
function resolveAgent(flagValue) {
  if (flagValue) {
    if (isValidAgent(flagValue)) return flagValue;
    throw new Error(`Unknown agent "${flagValue}". Valid: ${VALID_AGENTS.join(", ")}`);
  }
  const envAgent = process.env.VF_AGENT;
  if (envAgent) {
    if (isValidAgent(envAgent)) return envAgent;
  }
  try {
    const config = readConfig();
    if (config.agent && isValidAgent(config.agent)) {
      return config.agent;
    }
  } catch {
  }
  if (process.env.CLAUDE_PROJECT_DIR) return "claude";
  const cwd = process.cwd();
  for (const [agentType, marker] of DIRECTORY_MARKERS) {
    if (existsSync(join(cwd, marker))) return agentType;
  }
  return "generic";
}

// src/ui/output.ts
import chalk from "chalk";
import boxen from "boxen";
function success(msg) {
  console.log(chalk.green("\u2713") + " " + msg);
}
function info(msg) {
  console.log(chalk.cyan("\u2139") + " " + msg);
}
function warn(msg) {
  console.log(chalk.yellow("\u26A0") + " " + msg);
}
function error(msg) {
  console.log(chalk.red("\u2717") + " " + msg);
}
function printTask(task) {
  const { met, total } = criteriaProgress(task);
  const statusColor = task.status === "active" ? chalk.green : task.status === "done" ? chalk.gray : task.status === "abandoned" ? chalk.red : chalk.yellow;
  console.log(`  ${statusColor(task.id)}  ${task.title}`);
  if (total > 0) {
    console.log(`       ${met}/${total} criteria met`);
  }
  if (task.status === "active" && task.startedAt) {
    const elapsed = elapsedMinutes(task.startedAt);
    console.log(`       ${formatDuration(elapsed)} elapsed`);
  }
}
function printFocusCard(task) {
  const { met, total } = criteriaProgress(task);
  let content = chalk.bold(`FOCUS: ${task.id} - ${task.title}`);
  if (task.description) {
    content += "\n" + chalk.gray(task.description);
  }
  if (total > 0) {
    content += "\n\n" + chalk.bold("Criteria:");
    for (const c of task.acceptanceCriteria) {
      const check = c.met ? chalk.green("[\u2713]") : chalk.gray("[ ]");
      content += `
${check} ${c.text}`;
    }
    content += `

${chalk.cyan(`Progress: ${met}/${total}`)}`;
  }
  console.log(
    boxen(content, {
      padding: 1,
      margin: { top: 1, bottom: 1, left: 0, right: 0 },
      borderColor: "green",
      borderStyle: "round"
    })
  );
}
function printGuardian(response) {
  const color = response.severity === "block" ? "red" : response.severity === "warn" ? "yellow" : "cyan";
  const title = response.severity === "block" ? "FOCUS GUARDIAN - BLOCKED" : response.severity === "warn" ? "FOCUS GUARDIAN - WARNING" : "FOCUS GUARDIAN";
  let content = chalk.bold(title) + "\n\n";
  content += response.message + "\n\n";
  if (response.suggestion) {
    content += chalk.dim(response.suggestion);
  }
  if (response.overrideFlag) {
    content += "\n\n" + chalk.dim(`Override: ${response.overrideFlag}`);
  }
  console.log(
    boxen(content, {
      padding: 1,
      margin: { top: 1, bottom: 1, left: 0, right: 0 },
      borderColor: color,
      borderStyle: "round"
    })
  );
}
function printProgressBar(percent, width = 20) {
  const filled = Math.round(percent / 100 * width);
  const empty = width - filled;
  return chalk.green("\u2588".repeat(filled)) + chalk.gray("\u2591".repeat(empty));
}
function printChangeBanner(changes) {
  if (changes.length === 0) return;
  const shown = changes.slice(-5);
  console.log("");
  console.log(chalk.cyan("\u250C\u2500 Other tabs \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510"));
  for (const c of shown) {
    const icon = c.type === "start" ? chalk.greenBright("\u25B6") : c.type === "complete" ? chalk.cyanBright("\u2713") : c.type === "abandon" ? chalk.red("\u2717") : c.type === "switch_away" ? chalk.yellow("\u25C0") : c.type === "switch_to" ? chalk.green("\u25B6") : c.type === "pushback_override" ? chalk.red("!") : c.type === "message" ? chalk.magentaBright("\u{1F4AC}") : chalk.dim("\xB7");
    console.log(chalk.cyan("\u2502") + `  ${icon} ${chalk.bold(c.worker)}: ${c.description}`);
  }
  if (changes.length > 5) {
    console.log(chalk.cyan("\u2502") + chalk.dim(`  ... and ${changes.length - 5} more`));
  }
  console.log(chalk.cyan("\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518"));
  console.log("");
}

// src/commands/guard.ts
var HOOK_SCRIPT_NAME = "vibe-focus-guard.mjs";
var AUTO_TRACK_SCRIPT_NAME = "vibe-focus-auto-track.mjs";
var MARKER_START = "<!-- vibe-focus:start -->";
var MARKER_END = "<!-- vibe-focus:end -->";
function getBundledHookPath() {
  const thisFile = fileURLToPath(import.meta.url);
  return path4.join(path4.dirname(thisFile), "guard-hook.mjs");
}
function getBundledAutoTrackPath() {
  const thisFile = fileURLToPath(import.meta.url);
  return path4.join(path4.dirname(thisFile), "auto-track.mjs");
}
function getSettingsPath() {
  return path4.join(process.cwd(), ".claude", "settings.json");
}
function readSettings() {
  const settingsPath = getSettingsPath();
  if (fs4.existsSync(settingsPath)) {
    return JSON.parse(fs4.readFileSync(settingsPath, "utf-8"));
  }
  return {};
}
function writeSettings(settings) {
  const dir = path4.dirname(getSettingsPath());
  fs4.mkdirSync(dir, { recursive: true });
  fs4.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2));
}
function appendWithMarkers(filePath, content) {
  const wrapped = `${MARKER_START}
${content}
${MARKER_END}`;
  if (fs4.existsSync(filePath)) {
    let existing = fs4.readFileSync(filePath, "utf-8");
    const startIdx = existing.indexOf(MARKER_START);
    const endIdx = existing.indexOf(MARKER_END);
    if (startIdx >= 0 && endIdx >= 0) {
      existing = existing.slice(0, startIdx) + wrapped + existing.slice(endIdx + MARKER_END.length);
    } else {
      existing += "\n\n" + wrapped;
    }
    fs4.writeFileSync(filePath, existing);
  } else {
    fs4.mkdirSync(path4.dirname(filePath), { recursive: true });
    fs4.writeFileSync(filePath, wrapped + "\n");
  }
}
function removeMarkers(filePath) {
  if (!fs4.existsSync(filePath)) return false;
  const content = fs4.readFileSync(filePath, "utf-8");
  const startIdx = content.indexOf(MARKER_START);
  const endIdx = content.indexOf(MARKER_END);
  if (startIdx < 0 || endIdx < 0) return false;
  const before = content.slice(0, startIdx).replace(/\n\n$/, "");
  const after = content.slice(endIdx + MARKER_END.length);
  const cleaned = (before + after).trim();
  if (cleaned.length === 0) {
    fs4.unlinkSync(filePath);
  } else {
    fs4.writeFileSync(filePath, cleaned + "\n");
  }
  return true;
}
var guardCommand = new Command("guard").description("Install/remove AI agent focus enforcement").option("--install", "Install the focus guardian for your AI agent").option("--remove", "Remove the focus guardian").option("--status", "Check if guard is active").option("--agent <type>", "AI agent type: claude, cursor, copilot, windsurf, generic").action((opts) => {
  const agent = resolveAgent(opts.agent);
  if (opts.install) {
    installGuard(agent);
  } else if (opts.remove) {
    removeGuard(agent);
  } else {
    checkStatus(agent);
  }
});
function installGuard(agent) {
  const state = readState();
  const cwd = process.cwd();
  const config = AGENT_CONFIGS[agent];
  const rulesContent = generateRulesMd(state);
  updateConfig({ agent });
  if (agent === "generic") {
    console.log("");
    info(`Agent: ${config.displayName} \u2014 printing rules to stdout.`);
    console.log("");
    console.log(rulesContent);
    console.log("");
    info("Copy the above rules into your AI agent's system prompt or rules file.");
    return;
  }
  if (agent === "copilot") {
    const filePath = path4.join(cwd, config.rulesDir, config.rulesFile);
    appendWithMarkers(filePath, rulesContent);
    printInstallBox(agent, { rules: `${config.rulesDir}/${config.rulesFile}` });
    return;
  }
  const rulesDir = path4.join(cwd, config.rulesDir);
  fs4.mkdirSync(rulesDir, { recursive: true });
  fs4.writeFileSync(path4.join(rulesDir, config.rulesFile), rulesContent);
  if (agent === "claude") {
    const hooksDir = path4.join(cwd, config.hookDir);
    fs4.mkdirSync(hooksDir, { recursive: true });
    const hookPath = path4.join(hooksDir, HOOK_SCRIPT_NAME);
    const bundledHook = getBundledHookPath();
    if (!fs4.existsSync(bundledHook)) {
      error('Guard hook bundle not found. Run "npm run build" first.');
      return;
    }
    fs4.copyFileSync(bundledHook, hookPath);
    fs4.chmodSync(hookPath, "755");
    const autoTrackPath = path4.join(hooksDir, AUTO_TRACK_SCRIPT_NAME);
    const bundledAutoTrack = getBundledAutoTrackPath();
    if (fs4.existsSync(bundledAutoTrack)) {
      fs4.copyFileSync(bundledAutoTrack, autoTrackPath);
      fs4.chmodSync(autoTrackPath, "755");
    }
    const settings = readSettings();
    if (!settings.hooks) settings.hooks = {};
    if (!settings.hooks.UserPromptSubmit) settings.hooks.UserPromptSubmit = [];
    const guardCommand2 = `node "${hookPath}"`;
    const guardInstalled = settings.hooks.UserPromptSubmit.some(
      (entry) => entry.hooks?.some((h) => h.command?.includes(HOOK_SCRIPT_NAME))
    );
    if (!guardInstalled) {
      settings.hooks.UserPromptSubmit.push({
        hooks: [{
          type: "command",
          command: guardCommand2
        }]
      });
    }
    if (fs4.existsSync(bundledAutoTrack)) {
      if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];
      const trackCommand = `node "${autoTrackPath}"`;
      const trackInstalled = settings.hooks.PostToolUse.some(
        (entry) => entry.hooks?.some((h) => h.command?.includes(AUTO_TRACK_SCRIPT_NAME))
      );
      if (!trackInstalled) {
        settings.hooks.PostToolUse.push({
          matcher: "Edit|Write",
          hooks: [{
            type: "command",
            command: trackCommand,
            async: true
          }]
        });
      }
    }
    writeSettings(settings);
    printInstallBox(agent, {
      hook: `${config.hookDir}/${HOOK_SCRIPT_NAME}`,
      rules: `${config.rulesDir}/${config.rulesFile}`,
      config: config.settingsFile
    });
    return;
  }
  printInstallBox(agent, { rules: `${config.rulesDir}/${config.rulesFile}` });
}
function printInstallBox(agent, paths) {
  const config = AGENT_CONFIGS[agent];
  const maxWidth = 45;
  console.log("");
  console.log(chalk2.greenBright("  \u2554" + "\u2550".repeat(maxWidth) + "\u2557"));
  console.log(chalk2.greenBright("  \u2551") + chalk2.bold.green(`   FOCUS GUARDIAN INSTALLED`.padEnd(maxWidth)) + chalk2.greenBright("\u2551"));
  console.log(chalk2.greenBright("  \u2560" + "\u2550".repeat(maxWidth) + "\u2563"));
  console.log(chalk2.greenBright("  \u2551") + "".padEnd(maxWidth) + chalk2.greenBright("\u2551"));
  console.log(chalk2.greenBright("  \u2551") + chalk2.dim(`  Agent: ${config.displayName}`.padEnd(maxWidth)) + chalk2.greenBright("\u2551"));
  console.log(chalk2.greenBright("  \u2551") + "".padEnd(maxWidth) + chalk2.greenBright("\u2551"));
  if (paths.hook) {
    console.log(chalk2.greenBright("  \u2551") + chalk2.cyan("  Hook:  ") + chalk2.dim(paths.hook.padEnd(maxWidth - 9)) + chalk2.greenBright("\u2551"));
  }
  console.log(chalk2.greenBright("  \u2551") + chalk2.cyan("  Rules: ") + chalk2.dim(paths.rules.padEnd(maxWidth - 9)) + chalk2.greenBright("\u2551"));
  if (paths.config) {
    console.log(chalk2.greenBright("  \u2551") + chalk2.cyan("  Config:") + chalk2.dim(paths.config.padEnd(maxWidth - 9)) + chalk2.greenBright("\u2551"));
  }
  console.log(chalk2.greenBright("  \u2551") + "".padEnd(maxWidth) + chalk2.greenBright("\u2551"));
  if (config.supportsHook) {
    console.log(chalk2.greenBright("  \u2551") + chalk2.yellow(`  Restart ${config.displayName} to activate.`.padEnd(maxWidth)) + chalk2.greenBright("\u2551"));
  }
  console.log(chalk2.greenBright("  \u2551") + "".padEnd(maxWidth) + chalk2.greenBright("\u2551"));
  console.log(chalk2.greenBright("  \u255A" + "\u2550".repeat(maxWidth) + "\u255D"));
  console.log("");
  info("Remove with: vf guard --remove");
}
function removeGuard(agent) {
  const cwd = process.cwd();
  const config = AGENT_CONFIGS[agent];
  if (agent === "generic") {
    info("Generic agent has no files to remove.");
    return;
  }
  if (agent === "copilot") {
    const filePath = path4.join(cwd, config.rulesDir, config.rulesFile);
    if (removeMarkers(filePath)) {
      success("Focus Guardian rules removed from copilot-instructions.md.");
    } else {
      info("No vibe-focus rules found in copilot-instructions.md.");
    }
    return;
  }
  const rulesPath = path4.join(cwd, config.rulesDir, config.rulesFile);
  if (fs4.existsSync(rulesPath)) {
    fs4.unlinkSync(rulesPath);
  }
  if (agent === "claude") {
    const hookPath = path4.join(cwd, config.hookDir, HOOK_SCRIPT_NAME);
    if (fs4.existsSync(hookPath)) fs4.unlinkSync(hookPath);
    const autoTrackPath = path4.join(cwd, config.hookDir, AUTO_TRACK_SCRIPT_NAME);
    if (fs4.existsSync(autoTrackPath)) fs4.unlinkSync(autoTrackPath);
    const settings = readSettings();
    if (settings.hooks?.UserPromptSubmit) {
      settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit.filter(
        (entry) => !entry.hooks?.some((h) => h.command?.includes(HOOK_SCRIPT_NAME))
      );
      if (settings.hooks.UserPromptSubmit.length === 0) delete settings.hooks.UserPromptSubmit;
    }
    if (settings.hooks?.PostToolUse) {
      settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter(
        (entry) => !entry.hooks?.some((h) => h.command?.includes(AUTO_TRACK_SCRIPT_NAME))
      );
      if (settings.hooks.PostToolUse.length === 0) delete settings.hooks.PostToolUse;
    }
    if (settings.hooks && Object.keys(settings.hooks).length === 0) delete settings.hooks;
    writeSettings(settings);
  }
  success(`Focus Guardian removed for ${config.displayName}.`);
  if (config.supportsHook) {
    info(`${config.displayName} will no longer enforce focus.`);
  }
}
function checkStatus(agent) {
  const cwd = process.cwd();
  const config = AGENT_CONFIGS[agent];
  console.log("");
  console.log(chalk2.bold(`Focus Guardian Status (${config.displayName}):`));
  console.log("");
  if (agent === "generic") {
    info('Generic agent: use "vf guard --install" to print rules.');
    console.log("");
    return;
  }
  if (agent === "copilot") {
    const filePath = path4.join(cwd, config.rulesDir, config.rulesFile);
    const hasRules = fs4.existsSync(filePath) && fs4.readFileSync(filePath, "utf-8").includes(MARKER_START);
    console.log(`  Rules:  ${hasRules ? chalk2.green("present in copilot-instructions.md") : chalk2.red("not found")}`);
    console.log("");
    if (hasRules) {
      console.log(chalk2.greenBright(`  GUARD IS ACTIVE - ${config.displayName} will enforce focus.`));
    } else {
      info('Guard is not installed. Run "vf guard --install" to activate.');
    }
    console.log("");
    return;
  }
  const rulesPath = path4.join(cwd, config.rulesDir, config.rulesFile);
  const rulesExist = fs4.existsSync(rulesPath);
  console.log(`  Rules file:   ${rulesExist ? chalk2.green("present") : chalk2.red("missing")}`);
  if (agent === "claude") {
    const hookPath = path4.join(cwd, config.hookDir, HOOK_SCRIPT_NAME);
    const settings = readSettings();
    const hookExists = fs4.existsSync(hookPath);
    const hookRegistered = settings.hooks?.UserPromptSubmit?.some(
      (entry) => entry.hooks?.some((h) => h.command?.includes(HOOK_SCRIPT_NAME))
    );
    console.log(`  Hook script:  ${hookExists ? chalk2.green("installed") : chalk2.red("not installed")}`);
    console.log(`  Hook config:  ${hookRegistered ? chalk2.green("registered") : chalk2.red("not registered")}`);
    console.log("");
    if (hookExists && hookRegistered && rulesExist) {
      console.log(chalk2.greenBright(`  GUARD IS ACTIVE - ${config.displayName} will enforce focus.`));
    } else if (hookExists || rulesExist) {
      warn('Partial installation detected. Run "vf guard --install" to fix.');
    } else {
      info('Guard is not installed. Run "vf guard --install" to activate.');
    }
  } else {
    console.log("");
    if (rulesExist) {
      console.log(chalk2.greenBright(`  GUARD IS ACTIVE - ${config.displayName} will enforce focus.`));
    } else {
      info('Guard is not installed. Run "vf guard --install" to activate.');
    }
  }
  console.log("");
}

export {
  AGENT_CONFIGS,
  exportTasks,
  importTasks,
  getStatePath,
  getStateDir,
  readState,
  writeState,
  updateState,
  createEmptyState,
  initProject,
  readConfig,
  writeConfig,
  updateConfig,
  isValidAgent,
  resolveAgent,
  generateTaskId,
  generateCriterionId,
  now,
  elapsedMinutes,
  getTodayStart,
  formatDuration,
  createTask,
  getActiveTask,
  getActiveTaskForWorker,
  getAllActiveWorkers,
  resolveActiveTask,
  cleanupWorkers,
  getTask,
  updateTask,
  criteriaProgress,
  resolveWorker,
  unmetDependencies,
  generateRulesMd,
  generateClaudeMd,
  success,
  info,
  warn,
  error,
  printTask,
  printFocusCard,
  printGuardian,
  printProgressBar,
  printChangeBanner,
  guardCommand,
  installGuard
};
