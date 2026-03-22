import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readState } from '../../core/state.js';
import { resolveActiveTask, criteriaProgress } from '../../core/task.js';
import { now, elapsedMinutes } from '../../utils/time.js';
import { getWorkersDir, getUsername } from './team-state.js';
import { getActiveFiles, getActiveDirectories } from './file-tracker.js';
import { validateUsername, validatePathWithin, filterSensitiveFiles } from './validation.js';
import type { WorkerPresence, CoworkerContext, StalenessLevel, ConflictWarning } from '../types.js';

/**
 * Build a safe file path for a worker's presence file.
 * Validates username and ensures path stays within workers directory.
 */
function safePresencePath(username: string): string {
  validateUsername(username);
  const workersDir = getWorkersDir();
  const filePath = path.join(workersDir, `${username}.json`);
  return validatePathWithin(filePath, workersDir);
}

/**
 * Write the current user's presence file based on live vibe-focus state.
 * Sensitive files (e.g. .env, credentials) are automatically filtered out.
 */
export function writePresence(): void {
  const state = readState();
  const username = getUsername();
  const worker = process.env.VF_WORKER ?? undefined;
  const task = resolveActiveTask(state, worker);

  // Filter sensitive files before writing to shared presence
  const rawFiles = task ? getActiveFiles() : [];
  const safeFiles = filterSensitiveFiles(rawFiles);
  const rawDirs = task ? getActiveDirectories() : [];
  const safeDirs = filterSensitiveFiles(rawDirs);

  const presence: WorkerPresence = {
    version: 1,
    username,
    machine: os.hostname().split('.')[0], // short hostname only, no FQDN
    taskId: task?.id ?? null,
    taskTitle: task?.title ?? null,
    taskStatus: task ? 'active' : 'idle',
    progress: task
      ? (() => {
          const { met, total } = criteriaProgress(task);
          return { met, total, percent: total > 0 ? Math.round((met / total) * 100) : 0 };
        })()
      : { met: 0, total: 0, percent: 0 },
    activeFiles: safeFiles,
    activeDirectories: safeDirs,
    flowMode: null,
    lastHeartbeat: now(),
    sessionStarted: task?.startedAt ?? null,
    worker: worker ?? null,
  };

  const filePath = safePresencePath(username);
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(presence, null, 2));
  fs.renameSync(tmpPath, filePath);
}

/**
 * Read all worker presence files.
 * Validates each parsed file has required fields.
 */
export function readAllPresence(): WorkerPresence[] {
  const workersDir = getWorkersDir();
  if (!fs.existsSync(workersDir)) return [];

  const files = fs.readdirSync(workersDir).filter((f) => f.endsWith('.json'));
  const results: WorkerPresence[] = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(workersDir, file), 'utf-8');
      const parsed = JSON.parse(raw);
      // Basic schema validation: reject if missing critical fields
      if (
        typeof parsed.username !== 'string' ||
        typeof parsed.lastHeartbeat !== 'string' ||
        typeof parsed.version !== 'number'
      ) {
        continue;
      }
      results.push(parsed as WorkerPresence);
    } catch {
      // Skip corrupt files
    }
  }

  return results;
}

/**
 * Get coworker context (all workers except the current user).
 */
export function getCoworkers(staleThreshold = 15, offlineThreshold = 60): CoworkerContext[] {
  let username: string;
  try {
    username = getUsername();
  } catch {
    return [];
  }

  const all = readAllPresence();

  return all
    .filter((p) => p.username !== username)
    .map((presence) => {
      const age = elapsedMinutes(presence.lastHeartbeat);
      const staleness = getStaleness(age, staleThreshold, offlineThreshold);
      return { presence, staleness, heartbeatAge: age };
    });
}

function getStaleness(ageMinutes: number, staleThreshold: number, offlineThreshold: number): StalenessLevel {
  if (ageMinutes < 5) return 'active';
  if (ageMinutes < staleThreshold) return 'idle';
  if (ageMinutes < offlineThreshold) return 'away';
  return 'offline';
}

/**
 * Detect file conflicts between the current user and coworkers.
 */
export function detectConflicts(myFiles: string[], coworkers: CoworkerContext[]): ConflictWarning[] {
  const warnings: ConflictWarning[] = [];
  const myDirs = new Set(myFiles.map((f) => path.dirname(f)));

  for (const cw of coworkers) {
    if (cw.staleness === 'offline') continue;

    const theirFiles = new Set(cw.presence.activeFiles);
    const theirDirs = new Set(cw.presence.activeDirectories);

    // File-level collision
    const fileCollisions = myFiles.filter((f) => theirFiles.has(f));
    if (fileCollisions.length > 0) {
      warnings.push({
        type: 'file_collision',
        files: fileCollisions,
        coworkers: [cw.presence.username],
      });
    }

    // Directory-level overlap (but not file collision)
    const dirOverlaps = [...myDirs].filter((d) => theirDirs.has(d + '/') || theirDirs.has(d));
    if (dirOverlaps.length > 0 && fileCollisions.length === 0) {
      warnings.push({
        type: 'directory_overlap',
        files: dirOverlaps,
        coworkers: [cw.presence.username],
      });
    }
  }

  return warnings;
}

/**
 * Mark the current user as offline (clear task from presence).
 */
export function goOffline(): void {
  const username = getUsername();
  const filePath = safePresencePath(username);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
