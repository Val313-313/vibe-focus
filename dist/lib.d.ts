import { Command } from 'commander';

type AgentType = 'claude' | 'cursor' | 'copilot' | 'windsurf' | 'generic';
interface AgentConfig {
    type: AgentType;
    rulesDir: string;
    rulesFile: string;
    supportsHook: boolean;
    hookDir: string | null;
    settingsFile: string | null;
    envDetectVar: string | null;
    displayName: string;
}
declare const AGENT_CONFIGS: Record<AgentType, AgentConfig>;

declare function isValidAgent(value: string): value is AgentType;
declare function resolveAgent(flagValue?: string): AgentType;

interface VibeFocusConfig {
    agent?: string;
}
declare function readConfig(): VibeFocusConfig;
declare function writeConfig(config: VibeFocusConfig): void;
declare function updateConfig(updates: Partial<VibeFocusConfig>): void;

type TaskStatus = 'backlog' | 'active' | 'done' | 'abandoned';
interface AcceptanceCriterion {
    id: string;
    text: string;
    met: boolean;
}
interface Task {
    id: string;
    title: string;
    description: string;
    status: TaskStatus;
    acceptanceCriteria: AcceptanceCriterion[];
    dependencies: string[];
    tags: string[];
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    abandonedAt: string | null;
    abandonReason: string | null;
    switchCount: number;
    worker: string | null;
}
interface ProjectScope {
    purpose: string;
    boundaries: string[];
    inScope: string[];
    outOfScope: string[];
}
interface Note {
    id: string;
    text: string;
    capturedDuring: string | null;
    createdAt: string;
    promoted: boolean;
    promotedToTaskId: string | null;
}
interface FocusEvent {
    type: 'start' | 'complete' | 'abandon' | 'switch_away' | 'switch_to' | 'pushback_override' | 'message';
    taskId: string;
    timestamp: string;
    details?: string;
    worker?: string;
}
interface FocusSession {
    taskId: string;
    startedAt: string;
    endedAt: string | null;
}
interface SessionContext {
    id: string;
    taskId: string | null;
    savedAt: string;
    summary: string;
    decisions?: string[];
    openQuestions?: string[];
    projectState?: string;
    techStack?: string[];
}
interface WorkerMeta {
    lastSeenEventIndex: number;
    lastCommandAt: string;
}
interface VibeFocusState {
    version: 1;
    projectName: string;
    projectScope: ProjectScope | null;
    activeTaskId: string | null;
    activeWorkers: Record<string, string>;
    workerMeta: Record<string, WorkerMeta>;
    nextTaskNumber: number;
    tasks: Task[];
    notes: Note[];
    nextNoteNumber: number;
    currentSession: FocusSession | null;
    focusEvents: FocusEvent[];
    sessionContexts: SessionContext[];
    nextContextNumber: number;
}
interface GuardianResponse {
    allowed: boolean;
    severity: 'info' | 'warn' | 'block';
    message: string;
    suggestion: string;
    overrideFlag: string;
}

declare function generateRulesMd(state: VibeFocusState): string;
/** @deprecated Use generateRulesMd instead */
declare const generateClaudeMd: typeof generateRulesMd;

declare function getStatePath(): string;
declare function getStateDir(): string;
declare function readState(): VibeFocusState;
declare function writeState(state: VibeFocusState): void;
declare function updateState(fn: (state: VibeFocusState) => VibeFocusState): void;
declare function createEmptyState(projectName: string): VibeFocusState;
declare function initProject(projectName: string): {
    dir: string;
    importedCount: number;
};

declare function createTask(state: VibeFocusState, title: string, options?: {
    description?: string;
    criteria?: string[];
    dependencies?: string[];
    tags?: string[];
}): {
    task: Task;
    state: VibeFocusState;
};
declare function getActiveTask(state: VibeFocusState): Task | null;
declare function getActiveTaskForWorker(state: VibeFocusState, worker: string): Task | null;
declare function getAllActiveWorkers(state: VibeFocusState): Array<{
    worker: string;
    task: Task;
}>;
/**
 * Resolve active task: by worker if given, otherwise default activeTaskId.
 */
declare function resolveActiveTask(state: VibeFocusState, worker?: string): Task | null;
/**
 * Remove a task from activeWorkers and optionally clear activeTaskId.
 * Returns updated state fields (activeTaskId, activeWorkers).
 */
declare function cleanupWorkers(state: VibeFocusState, taskId: string, worker?: string): Pick<VibeFocusState, 'activeTaskId' | 'activeWorkers'>;
declare function getTask(state: VibeFocusState, id: string): Task | null;
declare function updateTask(state: VibeFocusState, id: string, updates: Partial<Task>): VibeFocusState;
declare function criteriaProgress(task: Task): {
    met: number;
    total: number;
};
declare function resolveWorker(opts: {
    worker?: string;
}): string | undefined;
declare function unmetDependencies(state: VibeFocusState, task: Task): string[];

declare function evaluateSwitch(state: VibeFocusState, currentTask: Task, _targetTaskId: string | null): GuardianResponse;
declare function evaluateAdd(currentTask: Task): GuardianResponse;
declare function evaluateScopeAlignment(state: VibeFocusState, taskTitle: string): GuardianResponse | null;

interface DailyStats {
    date: string;
    score: number;
    tasksCompleted: number;
    tasksSwitched: number;
    tasksAbandoned: number;
    overrides: number;
    tasksStarted: number;
    eventCount: number;
}
declare function getDailyHistory(state: VibeFocusState, maxDays?: number): DailyStats[];
declare function getStreak(history: DailyStats[]): number;
declare function getAverageScore(history: DailyStats[]): number;

interface ScoreFactors {
    tasksCompleted: number;
    tasksSwitchedAway: number;
    pushbackOverrides: number;
    tasksAbandoned: number;
}
declare function computeScoreFromFactors(factors: ScoreFactors): number;
declare function calculateDailyScore(state: VibeFocusState): number;
declare function scoreLabel(score: number): string;

interface StateChange {
    type: FocusEvent['type'];
    worker: string;
    taskId: string;
    description: string;
    timestamp: string;
}
/**
 * Detect events from OTHER workers since this worker's lastSeenEventIndex.
 */
declare function detectChanges(state: VibeFocusState, currentWorker: string): StateChange[];
/**
 * Format changes into a human-readable banner string.
 */
declare function formatChangeBanner(changes: StateChange[]): string;
/**
 * Stamp this worker's meta to mark current focusEvents.length as seen.
 * Returns a new workerMeta record (immutable).
 */
declare function stampWorkerMeta(state: VibeFocusState, worker: string): Record<string, WorkerMeta>;

declare function success(msg: string): void;
declare function info(msg: string): void;
declare function warn(msg: string): void;
declare function error(msg: string): void;
declare function printTask(task: Task): void;
declare function printFocusCard(task: Task): void;
declare function printGuardian(response: GuardianResponse): void;
declare function printProgressBar(percent: number, width?: number): string;
declare function printChangeBanner(changes: StateChange[]): void;

/** Write tasks array to tasks.json (git-tracked), stripping the worker field. */
declare function exportTasks(state: VibeFocusState): void;
/** Read tasks.json and return tasks + nextTaskNumber for seeding a fresh state. */
declare function importTasks(stateDir: string): {
    tasks: Task[];
    nextTaskNumber: number;
} | null;

declare function now(): string;
declare function elapsedMinutes(since: string): number;
declare function getTodayStart(): Date;
declare function formatDuration(minutes: number): string;

declare function generateTaskId(num: number): string;
declare function generateCriterionId(taskId: string, index: number): string;

interface WorkerPresence {
    version: 1;
    username: string;
    machine: string;
    taskId: string | null;
    taskTitle: string | null;
    taskStatus: 'active' | 'idle';
    progress: {
        met: number;
        total: number;
        percent: number;
    };
    activeFiles: string[];
    activeDirectories: string[];
    flowMode: string | null;
    lastHeartbeat: string;
    sessionStarted: string | null;
    worker: string | null;
}
interface TeamConfig {
    version: 1;
    teamName: string;
    settings: {
        staleThresholdMinutes: number;
        offlineThresholdMinutes: number;
        syncIntervalSeconds: number;
        discordWebhookUrl?: string;
    };
}
interface LocalConfig {
    username: string;
    machine: string;
    autoSync: boolean;
}
type StalenessLevel = 'active' | 'idle' | 'away' | 'offline';
interface CoworkerContext {
    presence: WorkerPresence;
    staleness: StalenessLevel;
    heartbeatAge: number;
}
interface ConflictWarning {
    type: 'file_collision' | 'directory_overlap';
    files: string[];
    coworkers: string[];
}

declare function getTeamDir(): string;
declare function getWorkersDir(): string;
declare function isTeamInitialized(): boolean;
declare function readTeamConfig(): TeamConfig;
declare function writeTeamConfig(config: TeamConfig): void;
declare function readLocalConfig(): LocalConfig;
declare function writeLocalConfig(config: LocalConfig): void;
declare function getUsername(): string;
declare function createTeamDirs(): void;
/**
 * Update .vibe-focus/.gitignore to track team/ but keep state.json ignored.
 */
declare function updateGitignore(): void;

interface DiscordEvent {
    type: 'task_started' | 'task_completed' | 'criterion_checked' | 'task_abandoned' | 'message';
    taskId?: string;
    taskTitle?: string;
    worker?: string;
    progress?: string;
    message?: string;
}
/**
 * Fire-and-forget Discord notification. Safe to call from any command.
 *
 * - Returns immediately (does not await)
 * - Swallows ALL errors silently
 * - Does nothing if team not initialized or no webhook configured
 * - Never blocks the CLI
 */
declare function fireDiscordEvent(event: DiscordEvent): void;
/**
 * Send a test message to verify the webhook works. Returns success/failure.
 */
declare function testDiscordWebhook(webhookUrl: string, teamName: string): Promise<boolean>;

/**
 * Write the current user's presence file based on live vibe-focus state.
 * Sensitive files (e.g. .env, credentials) are automatically filtered out.
 */
declare function writePresence(): void;
/**
 * Read all worker presence files.
 * Validates each parsed file has required fields.
 */
declare function readAllPresence(): WorkerPresence[];
/**
 * Get coworker context (all workers except the current user).
 */
declare function getCoworkers(staleThreshold?: number, offlineThreshold?: number): CoworkerContext[];
/**
 * Detect file conflicts between the current user and coworkers.
 */
declare function detectConflicts(myFiles: string[], coworkers: CoworkerContext[]): ConflictWarning[];
/**
 * Mark the current user as offline (clear task from presence).
 */
declare function goOffline(): void;

/**
 * Get list of files modified since the last commit (unstaged + staged).
 * Uses git diff to detect what the current user is actively touching.
 */
declare function getActiveFiles(): string[];
/**
 * Extract unique directories from a file list.
 * Returns paths with trailing slash for easy matching.
 */
declare function getActiveDirectories(): string[];

/**
 * Validate a username. Only allows alphanumeric, underscore, hyphen.
 * Throws on invalid input.
 */
declare function validateUsername(username: string): string;
/**
 * Validate that a resolved file path stays within the expected directory.
 * Prevents path traversal attacks.
 */
declare function validatePathWithin(filePath: string, expectedDir: string): string;
/**
 * Filter out files that might contain sensitive information.
 * These should never be exposed in shared presence files.
 */
declare function filterSensitiveFiles(files: string[]): string[];
/**
 * Check if a file path looks sensitive.
 */
declare function isSensitivePath(filePath: string): boolean;

/**
 * Register team commands as a subcommand group under `vf team`.
 */
declare function register(program: Command): void;

/**
 * Cloud integration types for vibeteamz connectivity.
 *
 * Security: No secrets are ever logged, exposed in error messages,
 * or included in heartbeat payloads. Tokens are stored locally only.
 */
/** Persisted cloud configuration in .vibe-focus/cloud.json */
interface CloudConfig {
    version: 1;
    /** Base URL of the vibeteamz API (no trailing slash) */
    apiUrl: string;
    /** Supabase project URL */
    supabaseUrl: string | null;
    /** Supabase anon key (public, safe to store) */
    supabaseAnonKey: string | null;
    /** Supabase access token (JWT, sensitive — local only) */
    accessToken: string | null;
    /** Supabase refresh token (sensitive — local only) */
    refreshToken: string | null;
    /** Authenticated user ID (UUID) */
    userId: string | null;
    /** Linked vibeteamz project ID (UUID) */
    projectId: string | null;
    /** ISO timestamp of when project was linked */
    linkedAt: string | null;
    /** Project-scoped API key (vbtz_...) — preferred over accessToken */
    apiKey: string | null;
}
/** Heartbeat payload sent to POST /api/heartbeat */
interface HeartbeatPayload {
    user_id: string;
    project_id: string;
    task_id: string | null;
    task_title: string | null;
    progress_met: number;
    progress_total: number;
    active_files: string[];
    focus_score: number;
    status: 'active' | 'idle';
}
/** Teammate presence returned in heartbeat response */
interface HeartbeatTeammate {
    user_id: string;
    task_id: string | null;
    task_title: string | null;
    progress_met: number;
    progress_total: number;
    active_files: string[];
    focus_score: number;
    status: 'active' | 'idle';
    last_heartbeat: string;
    profiles?: {
        username: string;
        display_name: string | null;
    };
}
/** Message returned in heartbeat response */
interface HeartbeatMessage {
    body: string;
    created_at: string;
    profile?: {
        username: string;
    };
}
/** A work suggestion computed server-side */
interface HeartbeatSuggestion {
    type: string;
    message: string;
    milestone_title?: string;
    task_title?: string;
    urgency: 'low' | 'medium' | 'high';
}
/** Response from the heartbeat API (enriched with team state) */
interface HeartbeatResult {
    ok: boolean;
    error?: string;
    team?: HeartbeatTeammate[];
    messages?: HeartbeatMessage[];
    suggestions?: HeartbeatSuggestion[];
}
/** Result of a cloud operation */
type CloudResult<T = void> = {
    success: true;
    data: T;
} | {
    success: false;
    error: string;
};
/** Presence table row */
interface CloudPresenceRow {
    user_id: string;
    task_id: string | null;
    task_title: string | null;
    progress_met: number;
    progress_total: number;
    focus_score: number;
    status: 'active' | 'idle';
    last_heartbeat: string;
    profiles?: {
        username: string;
        display_name: string | null;
    };
}
/** Members + profiles join row */
interface CloudMemberRow {
    user_id: string;
    role: string;
    joined_at: string;
    profiles: {
        username: string;
        display_name: string | null;
        availability: string | null;
        score: number;
        streak_days: number;
    };
}
/** Activity + profiles join row */
interface CloudActivityRow {
    id: string;
    type: string;
    message: string | null;
    created_at: string;
    profiles: {
        username: string;
    };
}
/** Sessions table row */
interface CloudSessionRow {
    id: string;
    started_by: string;
    started_at: string;
    ended_at: string | null;
    participants: string[];
}
/** Activity payload for POST to activity table */
interface ActivityPayload {
    project_id: string;
    user_id: string;
    type: string;
    message: string | null;
}
/** Result of a PostgREST query */
type SupabaseQueryResult<T> = {
    success: true;
    data: T[];
} | {
    success: false;
    error: string;
};

/**
 * Read cloud config from .vibe-focus/cloud.json.
 * Returns default config if file doesn't exist.
 * Throws on corrupted or tampered config.
 */
declare function readCloudConfig(): CloudConfig;
/**
 * Write cloud config atomically using tmp+rename pattern.
 * Sets restrictive file permissions (owner-only read/write).
 */
declare function writeCloudConfig(config: CloudConfig): void;
/**
 * Check if cloud is configured (has credentials and linked project).
 */
declare function isCloudLinked(): boolean;
/**
 * Clear all authentication data from cloud config.
 */
declare function clearCloudAuth(): void;
/** Validate that a string is a valid UUID v4. */
declare function isValidUUID(value: string): boolean;
/** Validate that a string is a valid HTTPS URL. */
declare function isValidHttpsUrl(value: string): boolean;

/**
 * Build a heartbeat payload from current CLI state.
 * Returns null if cloud is not configured.
 *
 * Security:
 * - Sensitive files are filtered out
 * - File list is capped to MAX_FILES
 * - No local paths or secrets are included
 */
declare function buildHeartbeatPayload(overrides?: Partial<Pick<HeartbeatPayload, 'status'>>): HeartbeatPayload | null;
/**
 * Send a heartbeat to the vibeteamz API.
 * Returns the API response or an error result.
 *
 * Security:
 * - HTTPS only (enforced by cloud-state URL validation)
 * - Bearer token auth
 * - Strict timeout via AbortSignal
 * - Response body is validated before parsing
 * - No credentials in error messages
 */
declare function sendHeartbeat(payload: HeartbeatPayload): Promise<HeartbeatResult>;
/**
 * Fire-and-forget heartbeat. Safe to call from any command.
 *
 * - Returns immediately (does not await)
 * - Swallows ALL errors silently
 * - Does nothing if cloud is not configured
 * - Never blocks the CLI
 */
declare function fireHeartbeat(overrides?: Partial<Pick<HeartbeatPayload, 'status'>>): void;

/**
 * Query Supabase PostgREST.
 *
 * Security:
 * - HTTPS only (enforced by cloud-state URL validation)
 * - Bearer token + apikey auth
 * - Strict timeout via AbortSignal
 * - Response size validation
 * - Content-type validation
 */
declare function supabaseQuery<T>(table: string, params: string, options?: {
    timeout?: number;
}): Promise<SupabaseQueryResult<T>>;
/**
 * Insert a row into a Supabase table via PostgREST.
 *
 * Security:
 * - Same auth and HTTPS guarantees as supabaseQuery
 * - Payload size limit enforced
 */
declare function supabaseInsert<T>(table: string, payload: Record<string, unknown>): Promise<CloudResult<T>>;
/**
 * Fire-and-forget activity push. Safe to call from any command.
 *
 * - Returns immediately (does not await)
 * - Swallows ALL errors silently
 * - Does nothing if cloud is not configured
 * - Never blocks the CLI
 */
declare function fireCloudActivity(activity: Omit<ActivityPayload, 'project_id' | 'user_id'>): void;

/**
 * Register cloud commands under `vf vibeteamz` (primary) and `vf cloud` (hidden alias).
 */
declare function registerCloud(program: Command): void;

export { AGENT_CONFIGS, type AcceptanceCriterion, type ActivityPayload, type AgentConfig, type AgentType, type CloudActivityRow, type CloudConfig, type CloudMemberRow, type CloudPresenceRow, type CloudResult, type CloudSessionRow, type ConflictWarning, type CoworkerContext, type DailyStats, type DiscordEvent, type FocusEvent, type FocusSession, type GuardianResponse, type HeartbeatPayload, type HeartbeatResult, type LocalConfig, type Note, type ProjectScope, type ScoreFactors, type SessionContext, type StalenessLevel, type StateChange, type SupabaseQueryResult, type Task, type TaskStatus, type TeamConfig, type VibeFocusConfig, type VibeFocusState, type WorkerMeta, type WorkerPresence, buildHeartbeatPayload, calculateDailyScore, cleanupWorkers, clearCloudAuth, computeScoreFromFactors, createEmptyState, createTask, createTeamDirs, criteriaProgress, detectChanges, detectConflicts, elapsedMinutes, error, evaluateAdd, evaluateScopeAlignment, evaluateSwitch, exportTasks, filterSensitiveFiles, fireCloudActivity, fireDiscordEvent, fireHeartbeat, formatChangeBanner, formatDuration, generateClaudeMd, generateCriterionId, generateRulesMd, generateTaskId, getActiveDirectories, getActiveFiles, getActiveTask, getActiveTaskForWorker, getAllActiveWorkers, getAverageScore, getCoworkers, getDailyHistory, getStateDir, getStatePath, getStreak, getTask, getTeamDir, getTodayStart, getUsername, getWorkersDir, goOffline, importTasks, info, initProject, isCloudLinked, isSensitivePath, isTeamInitialized, isValidAgent, isValidHttpsUrl, isValidUUID, now, printChangeBanner, printFocusCard, printGuardian, printProgressBar, printTask, readAllPresence, readCloudConfig, readConfig, readLocalConfig, readState, readTeamConfig, registerCloud, register as registerTeam, resolveActiveTask, resolveAgent, resolveWorker, scoreLabel, sendHeartbeat, stampWorkerMeta, success, supabaseInsert, supabaseQuery, testDiscordWebhook, unmetDependencies, updateConfig, updateGitignore, updateState, updateTask, validatePathWithin, validateUsername, warn, writeCloudConfig, writeConfig, writeLocalConfig, writePresence, writeState, writeTeamConfig };
