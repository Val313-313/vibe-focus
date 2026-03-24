// Public API for extensions and library consumers

// Agent types and resolution
export type { AgentType, AgentConfig } from './agents/types.js';
export { AGENT_CONFIGS } from './agents/types.js';
export { resolveAgent, isValidAgent } from './agents/resolve.js';

// Config
export type { VibeFocusConfig } from './core/config.js';
export { readConfig, writeConfig, updateConfig } from './core/config.js';

// Rules generator (renamed from claude-md)
export { generateRulesMd, generateClaudeMd } from './generators/rules-md.js';

// Types
export type {
  Task,
  TaskStatus,
  AcceptanceCriterion,
  ProjectScope,
  Note,
  FocusEvent,
  FocusSession,
  SessionContext,
  VibeFocusState,
  GuardianResponse,
  WorkerMeta,
} from './types/index.js';

// State management
export {
  readState,
  writeState,
  updateState,
  getStatePath,
  getStateDir,
  createEmptyState,
  initProject,
} from './core/state.js';

// Task operations
export {
  createTask,
  getActiveTask,
  getActiveTaskForWorker,
  getAllActiveWorkers,
  resolveActiveTask,
  cleanupWorkers,
  getTask,
  updateTask,
  criteriaProgress,
  unmetDependencies,
  resolveWorker,
} from './core/task.js';

// Guardian
export {
  evaluateSwitch,
  evaluateAdd,
  evaluateScopeAlignment,
} from './core/guardian.js';

// History & scoring
export { getDailyHistory, getStreak, getAverageScore } from './core/history.js';
export type { DailyStats } from './core/history.js';
export { calculateDailyScore, computeScoreFromFactors, scoreLabel } from './core/scoring.js';
export type { ScoreFactors } from './core/scoring.js';

// Sync (cross-tab change detection)
export type { StateChange } from './core/sync.js';
export { detectChanges, formatChangeBanner, stampWorkerMeta } from './core/sync.js';

// UI helpers
export {
  success,
  error,
  info,
  warn,
  printTask,
  printFocusCard,
  printGuardian,
  printProgressBar,
  printChangeBanner,
} from './ui/output.js';

// Utils
export { now, elapsedMinutes, formatDuration, getTodayStart } from './utils/time.js';
export { generateTaskId, generateCriterionId } from './utils/id.js';

// Team types
export type {
  TeamConfig,
  LocalConfig,
  WorkerPresence,
  CoworkerContext,
  StalenessLevel,
  ConflictWarning,
} from './team/types.js';

// Team state
export {
  getTeamDir,
  getWorkersDir,
  isTeamInitialized,
  readTeamConfig,
  writeTeamConfig,
  readLocalConfig,
  writeLocalConfig,
  getUsername,
  createTeamDirs,
  updateGitignore,
} from './team/core/team-state.js';

// Team Discord
export type { DiscordEvent } from './team/core/discord.js';
export { fireDiscordEvent, testDiscordWebhook } from './team/core/discord.js';

// Team presence
export {
  writePresence,
  readAllPresence,
  getCoworkers,
  detectConflicts,
  goOffline,
} from './team/core/presence.js';

// Team file tracker
export {
  getActiveFiles,
  getActiveDirectories,
} from './team/core/file-tracker.js';

// Team validation
export {
  validateUsername,
  validatePathWithin,
  filterSensitiveFiles,
  isSensitivePath,
} from './team/core/validation.js';

// Team registration
export { register as registerTeam } from './team/register.js';

// Cloud types
export type {
  CloudConfig,
  HeartbeatPayload,
  HeartbeatResult,
  CloudResult,
  CloudPresenceRow,
  CloudMemberRow,
  CloudActivityRow,
  CloudSessionRow,
  ActivityPayload,
  SupabaseQueryResult,
} from './cloud/types.js';

// Cloud state
export {
  readCloudConfig,
  writeCloudConfig,
  isCloudLinked,
  clearCloudAuth,
  isValidUUID,
  isValidHttpsUrl,
} from './cloud/core/cloud-state.js';

// Cloud heartbeat
export {
  buildHeartbeatPayload,
  sendHeartbeat,
  fireHeartbeat,
} from './cloud/core/heartbeat.js';

// Cloud API (PostgREST)
export {
  supabaseQuery,
  supabaseInsert,
  fireCloudActivity,
} from './cloud/core/api.js';

// Cloud registration
export { registerCloud } from './cloud/register.js';
