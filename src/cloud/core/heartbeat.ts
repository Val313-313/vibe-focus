import { readState } from '../../core/state.js';
import { resolveActiveTask, criteriaProgress } from '../../core/task.js';
import { calculateDailyScore } from '../../core/scoring.js';
import { getActiveFiles } from '../../team/core/file-tracker.js';
import { filterSensitiveFiles } from '../../team/core/validation.js';
import { readCloudConfig } from './cloud-state.js';
import { writeCloudCache } from './cloud-cache.js';
import { refreshAccessToken } from './token-refresh.js';
import type { HeartbeatPayload, HeartbeatResult, CloudConfig } from '../types.js';

/** Maximum number of active files to include in payload */
const MAX_FILES = 50;

/** Heartbeat request timeout in milliseconds */
const HEARTBEAT_TIMEOUT_MS = 5_000;

/** Maximum allowed payload size in bytes (safety limit) */
const MAX_PAYLOAD_BYTES = 64_000;

/**
 * Build a heartbeat payload from current CLI state.
 * Returns null if cloud is not configured.
 *
 * Security:
 * - Sensitive files are filtered out
 * - File list is capped to MAX_FILES
 * - No local paths or secrets are included
 */
export function buildHeartbeatPayload(
  overrides: Partial<Pick<HeartbeatPayload, 'status'>> = {},
): HeartbeatPayload | null {
  let config: CloudConfig;
  try {
    config = readCloudConfig();
  } catch {
    return null;
  }

  if (!config.accessToken || !config.userId || !config.projectId) {
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

  // Get active files, filter sensitive ones, cap the list
  let activeFiles: string[] = [];
  try {
    const raw = getActiveFiles();
    activeFiles = filterSensitiveFiles(raw).slice(0, MAX_FILES);
  } catch {
    // Git not available or no repo — empty file list is fine
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
    status: overrides.status ?? (task ? 'active' : 'idle'),
  };
}

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
export async function sendHeartbeat(payload: HeartbeatPayload): Promise<HeartbeatResult> {
  const config = readCloudConfig();

  if (!config.accessToken) {
    return { ok: false, error: 'Not authenticated.' };
  }

  const url = `${config.apiUrl}/api/heartbeat`;
  const body = JSON.stringify(payload);

  // Safety: reject oversized payloads
  if (Buffer.byteLength(body, 'utf-8') > MAX_PAYLOAD_BYTES) {
    return { ok: false, error: 'Payload too large.' };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.accessToken}`,
    },
    body,
    signal: AbortSignal.timeout(HEARTBEAT_TIMEOUT_MS),
  });

  if (response.status === 401 || response.status === 403) {
    // Token likely expired — try to refresh and retry once
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const freshConfig = readCloudConfig();
      const retryResponse = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${freshConfig.accessToken}`,
        },
        body,
        signal: AbortSignal.timeout(HEARTBEAT_TIMEOUT_MS),
      });

      if (!retryResponse.ok) {
        return { ok: false, error: `HTTP ${retryResponse.status}` };
      }

      const retryContentType = retryResponse.headers.get('content-type') ?? '';
      if (!retryContentType.includes('application/json')) {
        return { ok: false, error: 'Unexpected response format.' };
      }

      const retryResult = await retryResponse.json() as Record<string, unknown>;
      if (typeof retryResult.ok !== 'boolean') {
        return { ok: false, error: 'Malformed API response.' };
      }

      if (retryResult.ok && (Array.isArray(retryResult.team) || Array.isArray(retryResult.messages))) {
        try {
          writeCloudCache({
            version: 1,
            updatedAt: new Date().toISOString(),
            team: Array.isArray(retryResult.team) ? retryResult.team as HeartbeatResult['team'] & [] : [],
            messages: Array.isArray(retryResult.messages) ? retryResult.messages as HeartbeatResult['messages'] & [] : [],
          });
        } catch {
          // Never fail on cache write
        }
      }

      return {
        ok: retryResult.ok as boolean,
        error: retryResult.error as string | undefined,
        team: Array.isArray(retryResult.team) ? retryResult.team as HeartbeatResult['team'] : undefined,
        messages: Array.isArray(retryResult.messages) ? retryResult.messages as HeartbeatResult['messages'] : undefined,
      };
    }

    return { ok: false, error: `HTTP ${response.status}` };
  }

  if (!response.ok) {
    // Do not leak response body details — could contain server internals
    return { ok: false, error: `HTTP ${response.status}` };
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return { ok: false, error: 'Unexpected response format.' };
  }

  const result = await response.json() as Record<string, unknown>;

  if (typeof result.ok !== 'boolean') {
    return { ok: false, error: 'Malformed API response.' };
  }

  // Cache team state from enriched response (fire-and-forget)
  if (result.ok && (Array.isArray(result.team) || Array.isArray(result.messages))) {
    try {
      writeCloudCache({
        version: 1,
        updatedAt: new Date().toISOString(),
        team: Array.isArray(result.team) ? result.team as HeartbeatResult['team'] & [] : [],
        messages: Array.isArray(result.messages) ? result.messages as HeartbeatResult['messages'] & [] : [],
      });
    } catch {
      // Never fail on cache write
    }
  }

  return {
    ok: result.ok as boolean,
    error: result.error as string | undefined,
    team: Array.isArray(result.team) ? result.team as HeartbeatResult['team'] : undefined,
    messages: Array.isArray(result.messages) ? result.messages as HeartbeatResult['messages'] : undefined,
  };
}

/**
 * Fire-and-forget heartbeat. Safe to call from any command.
 *
 * - Returns immediately (does not await)
 * - Swallows ALL errors silently
 * - Does nothing if cloud is not configured
 * - Never blocks the CLI
 */
export function fireHeartbeat(
  overrides: Partial<Pick<HeartbeatPayload, 'status'>> = {},
): void {
  try {
    const payload = buildHeartbeatPayload(overrides);
    if (!payload) return;

    // Fire and forget — do not await, catch all rejections
    sendHeartbeat(payload).catch(() => {});
  } catch {
    // buildHeartbeatPayload failed — silently ignore
  }
}
