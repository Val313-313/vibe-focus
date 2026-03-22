import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getStateDir } from '../../core/state.js';
import type { CloudConfig } from '../types.js';

const CLOUD_FILE = 'cloud.json';

/** Strict UUID v4 pattern */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Strict URL pattern — https only */
const HTTPS_URL_RE = /^https:\/\/[a-zA-Z0-9][a-zA-Z0-9.-]+[a-zA-Z0-9](:\d{1,5})?(\/[^\s]*)?$/;

function getCloudPath(): string {
  return path.join(getStateDir(), CLOUD_FILE);
}

function defaultConfig(): CloudConfig {
  return {
    version: 1,
    apiUrl: 'https://vibeteamz.vercel.app',
    supabaseUrl: null,
    supabaseAnonKey: null,
    accessToken: null,
    refreshToken: null,
    userId: null,
    projectId: null,
    linkedAt: null,
  };
}

/**
 * Validate a cloud config object has the expected shape.
 * Rejects malformed or tampered configs.
 */
function validateConfig(raw: unknown): CloudConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Invalid cloud config: not an object.');
  }

  const obj = raw as Record<string, unknown>;

  if (obj.version !== 1) {
    throw new Error('Invalid cloud config version.');
  }

  if (typeof obj.apiUrl !== 'string' || !HTTPS_URL_RE.test(obj.apiUrl)) {
    throw new Error('Invalid cloud config: apiUrl must be a valid HTTPS URL.');
  }

  // Validate optional string-or-null fields
  const nullableStrings = ['supabaseUrl', 'supabaseAnonKey', 'accessToken', 'refreshToken', 'userId', 'linkedAt'] as const;
  for (const key of nullableStrings) {
    if (obj[key] !== null && typeof obj[key] !== 'string') {
      throw new Error(`Invalid cloud config: ${key} must be string or null.`);
    }
  }

  // Validate URLs if present
  if (typeof obj.supabaseUrl === 'string' && !HTTPS_URL_RE.test(obj.supabaseUrl)) {
    throw new Error('Invalid cloud config: supabaseUrl must be a valid HTTPS URL.');
  }

  // Validate UUIDs if present
  if (typeof obj.userId === 'string' && !UUID_RE.test(obj.userId)) {
    throw new Error('Invalid cloud config: userId must be a valid UUID.');
  }
  if (obj.projectId !== null && obj.projectId !== undefined) {
    if (typeof obj.projectId !== 'string') {
      throw new Error('Invalid cloud config: projectId must be string or null.');
    }
    if (!UUID_RE.test(obj.projectId)) {
      throw new Error('Invalid cloud config: projectId must be a valid UUID.');
    }
  }

  return {
    version: 1,
    apiUrl: obj.apiUrl as string,
    supabaseUrl: (obj.supabaseUrl as string) ?? null,
    supabaseAnonKey: (obj.supabaseAnonKey as string) ?? null,
    accessToken: (obj.accessToken as string) ?? null,
    refreshToken: (obj.refreshToken as string) ?? null,
    userId: (obj.userId as string) ?? null,
    projectId: (obj.projectId as string) ?? null,
    linkedAt: (obj.linkedAt as string) ?? null,
  };
}

/**
 * Read cloud config from .vibe-focus/cloud.json.
 * Returns default config if file doesn't exist.
 * Throws on corrupted or tampered config.
 */
export function readCloudConfig(): CloudConfig {
  const filePath = getCloudPath();

  if (!fs.existsSync(filePath)) {
    return defaultConfig();
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw);
  return validateConfig(parsed);
}

/**
 * Write cloud config atomically using tmp+rename pattern.
 * Sets restrictive file permissions (owner-only read/write).
 */
export function writeCloudConfig(config: CloudConfig): void {
  const validated = validateConfig(config);
  const filePath = getCloudPath();
  const tmpPath = filePath + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';

  const content = JSON.stringify(validated, null, 2);
  fs.writeFileSync(tmpPath, content, { mode: 0o600 }); // owner read/write only
  fs.renameSync(tmpPath, filePath);
}

/**
 * Check if cloud is configured (has credentials and linked project).
 */
export function isCloudLinked(): boolean {
  try {
    const config = readCloudConfig();
    return !!(config.accessToken && config.userId && config.projectId);
  } catch {
    return false;
  }
}

/**
 * Clear all authentication data from cloud config.
 */
export function clearCloudAuth(): void {
  try {
    const config = readCloudConfig();
    writeCloudConfig({
      ...config,
      accessToken: null,
      refreshToken: null,
      userId: null,
    });
  } catch {
    // Config doesn't exist or is corrupt — nothing to clear
  }
}

/** Validate that a string is a valid UUID v4. */
export function isValidUUID(value: string): boolean {
  return UUID_RE.test(value);
}

/** Validate that a string is a valid HTTPS URL. */
export function isValidHttpsUrl(value: string): boolean {
  return HTTPS_URL_RE.test(value);
}
