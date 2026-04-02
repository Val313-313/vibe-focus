import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getStateDir } from '../../core/state.js';
import type { CloudCache } from '../types.js';

const CACHE_FILE = 'cloud-cache.json';

/** Maximum cache age in milliseconds (10 minutes) */
const MAX_CACHE_AGE_MS = 10 * 60 * 1000;

function getCachePath(): string {
  return path.join(getStateDir(), CACHE_FILE);
}

/**
 * Write cloud cache atomically.
 * Same atomic write pattern as cloud-state.ts.
 */
export function writeCloudCache(cache: CloudCache): void {
  const filePath = getCachePath();
  const tmpPath = filePath + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';

  const content = JSON.stringify(cache, null, 2);
  fs.writeFileSync(tmpPath, content, { mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
}

/**
 * Read cloud cache. Returns null if:
 * - File doesn't exist
 * - File is corrupted
 * - Cache is older than MAX_CACHE_AGE_MS
 */
export function readCloudCache(): CloudCache | null {
  const filePath = getCachePath();

  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    if (raw?.version !== 1 || !raw.updatedAt) return null;

    // Check staleness
    const ageMs = Date.now() - new Date(raw.updatedAt).getTime();
    if (ageMs > MAX_CACHE_AGE_MS) return null;

    return {
      version: 1,
      updatedAt: raw.updatedAt,
      team: Array.isArray(raw.team) ? raw.team : [],
      messages: Array.isArray(raw.messages) ? raw.messages : [],
      suggestions: Array.isArray(raw.suggestions) ? raw.suggestions : undefined,
    };
  } catch {
    return null;
  }
}
