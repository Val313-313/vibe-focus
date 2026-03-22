// Public API for extensions and library consumers

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
