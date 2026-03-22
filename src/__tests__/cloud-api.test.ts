import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { CloudConfig } from '../cloud/types.js';
import type { VibeFocusState } from '../types/index.js';
import { supabaseQuery, supabaseInsert, fireCloudActivity } from '../cloud/core/api.js';

let tmpDir: string;
let originalCwd: string;

const minimalState: VibeFocusState = {
  version: 1,
  projectName: 'test',
  projectScope: null,
  activeTaskId: null,
  activeWorkers: {},
  nextTaskNumber: 1,
  tasks: [],
  notes: [],
  nextNoteNumber: 1,
  currentSession: null,
  focusEvents: [],
  sessionContexts: [],
  nextContextNumber: 1,
};

function createCloudConfig(overrides: Partial<CloudConfig> = {}): CloudConfig {
  return {
    version: 1,
    apiUrl: 'https://vibeteamz.vercel.app',
    supabaseUrl: 'https://abc.supabase.co',
    supabaseAnonKey: 'eyJtest',
    accessToken: 'test-token-123',
    refreshToken: 'test-refresh-123',
    userId: '550e8400-e29b-41d4-a716-446655440000',
    projectId: '660e8400-e29b-41d4-a716-446655440000',
    linkedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function writeFiles(cloud?: CloudConfig) {
  const stateDir = path.join(tmpDir, '.vibe-focus');
  // Always write state.json so findProjectRoot() works
  fs.writeFileSync(path.join(stateDir, 'state.json'), JSON.stringify(minimalState, null, 2));
  if (cloud) {
    fs.writeFileSync(
      path.join(stateDir, 'cloud.json'),
      JSON.stringify(cloud, null, 2),
      { mode: 0o600 },
    );
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-api-test-'));
  const stateDir = path.join(tmpDir, '.vibe-focus');
  fs.mkdirSync(stateDir, { recursive: true });
  originalCwd = process.cwd();
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('fireCloudActivity', () => {
  it('does not throw when cloud is not configured', () => {
    expect(() => fireCloudActivity({ type: 'test', message: 'hello' })).not.toThrow();
  });

  it('does not throw when access token is missing', () => {
    writeFiles(createCloudConfig({ accessToken: null }));
    expect(() => fireCloudActivity({ type: 'test', message: 'hello' })).not.toThrow();
  });

  it('does not throw when supabaseUrl is missing', () => {
    writeFiles(createCloudConfig({ supabaseUrl: null }));
    expect(() => fireCloudActivity({ type: 'test', message: 'hello' })).not.toThrow();
  });

  it('does not throw when supabaseAnonKey is missing', () => {
    writeFiles(createCloudConfig({ supabaseAnonKey: null }));
    expect(() => fireCloudActivity({ type: 'test', message: 'hello' })).not.toThrow();
  });

  it('does not throw with fully configured cloud (fetch will fail but is swallowed)', () => {
    writeFiles(createCloudConfig());
    expect(() => fireCloudActivity({ type: 'task_started', message: 'Started t1' })).not.toThrow();
  });

  it('does not throw with null message', () => {
    writeFiles(createCloudConfig());
    expect(() => fireCloudActivity({ type: 'task_completed', message: null })).not.toThrow();
  });
});

describe('supabaseQuery', () => {
  it('returns error when cloud is not configured', async () => {
    const result = await supabaseQuery('presence', 'select=*');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('Cloud not configured.');
    }
  });

  it('returns error when supabaseUrl is missing', async () => {
    writeFiles(createCloudConfig({ supabaseUrl: null }));
    const result = await supabaseQuery('presence', 'select=*');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('Cloud not configured.');
    }
  });

  it('returns error when projectId is missing', async () => {
    writeFiles(createCloudConfig({ projectId: null }));
    const result = await supabaseQuery('presence', 'select=*');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('Cloud not configured.');
    }
  });
});

describe('supabaseInsert', () => {
  it('returns error when cloud is not configured', async () => {
    const result = await supabaseInsert('activity', { type: 'test' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('Cloud not configured.');
    }
  });

  it('returns error when accessToken is missing', async () => {
    writeFiles(createCloudConfig({ accessToken: null }));
    const result = await supabaseInsert('activity', { type: 'test' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('Cloud not configured.');
    }
  });

  it('rejects oversized payloads', async () => {
    writeFiles(createCloudConfig());
    const bigMessage = 'x'.repeat(70_000);
    const result = await supabaseInsert('activity', { type: 'test', message: bigMessage });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('Payload too large.');
    }
  });
});
