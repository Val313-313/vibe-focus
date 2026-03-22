// Public API for extension packages (e.g. vibe-focus-team)

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
export { calculateDailyScore, scoreLabel } from './core/scoring.js';

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
export { now, elapsedMinutes, formatDuration } from './utils/time.js';
export { generateTaskId, generateCriterionId } from './utils/id.js';
