import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { VibeFocusState } from '../types/index.js';
import type { CloudConfig } from '../cloud/types.js';
import { buildHeartbeatPayload, fireHeartbeat } from '../cloud/core/heartbeat.js';

let tmpDir: string;
let originalCwd: string;

function createState(overrides: Partial<VibeFocusState> = {}): VibeFocusState {
  return {
    version: 1,
    projectName: 'test',
    projectScope: null,
    activeTaskId: 't1',
    activeWorkers: {},
    nextTaskNumber: 2,
    tasks: [
      {
        id: 't1',
        title: 'Build heartbeat',
        description: 'Integrate CLI with vibeteamz',
        status: 'active',
        acceptanceCriteria: [
          { id: 't1-c1', text: 'Sends heartbeat', met: true },
          { id: 't1-c2', text: 'Handles errors', met: false },
        ],
        dependencies: [],
        tags: [],
        createdAt: '2025-01-01T00:00:00.000Z',
        startedAt: '2025-01-01T00:00:00.000Z',
        completedAt: null,
        abandonedAt: null,
        abandonReason: null,
        switchCount: 0,
        worker: null,
      },
    ],
    notes: [],
    nextNoteNumber: 1,
    currentSession: { taskId: 't1', startedAt: '2025-01-01T00:00:00.000Z', endedAt: null },
    focusEvents: [
      { type: 'start', taskId: 't1', timestamp: new Date().toISOString() },
    ],
    sessionContexts: [],
    nextContextNumber: 1,
    ...overrides,
  };
}

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

function writeFiles(state: VibeFocusState, cloud?: CloudConfig) {
  const stateDir = path.join(tmpDir, '.vibe-focus');
  fs.writeFileSync(path.join(stateDir, 'state.json'), JSON.stringify(state, null, 2));
  if (cloud) {
    fs.writeFileSync(path.join(stateDir, 'cloud.json'), JSON.stringify(cloud, null, 2), { mode: 0o600 });
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-hb-test-'));
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

describe('buildHeartbeatPayload', () => {
  it('returns null when cloud.json does not exist', () => {
    writeFiles(createState());
    const payload = buildHeartbeatPayload();
    expect(payload).toBeNull();
  });

  it('returns null when access token is missing', () => {
    writeFiles(createState(), createCloudConfig({ accessToken: null }));
    const payload = buildHeartbeatPayload();
    expect(payload).toBeNull();
  });

  it('returns null when userId is missing', () => {
    writeFiles(createState(), createCloudConfig({ userId: null }));
    const payload = buildHeartbeatPayload();
    expect(payload).toBeNull();
  });

  it('returns null when projectId is missing', () => {
    writeFiles(createState(), createCloudConfig({ projectId: null }));
    const payload = buildHeartbeatPayload();
    expect(payload).toBeNull();
  });

  it('builds correct payload with active task', () => {
    writeFiles(createState(), createCloudConfig());
    const payload = buildHeartbeatPayload();

    expect(payload).not.toBeNull();
    expect(payload!.user_id).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(payload!.project_id).toBe('660e8400-e29b-41d4-a716-446655440000');
    expect(payload!.task_id).toBe('t1');
    expect(payload!.task_title).toBe('Build heartbeat');
    expect(payload!.progress_met).toBe(1);
    expect(payload!.progress_total).toBe(2);
    expect(payload!.status).toBe('active');
    expect(payload!.focus_score).toBeGreaterThanOrEqual(0);
    expect(payload!.focus_score).toBeLessThanOrEqual(100);
    expect(Array.isArray(payload!.active_files)).toBe(true);
  });

  it('returns idle status when no active task', () => {
    writeFiles(
      createState({ activeTaskId: null, tasks: [] }),
      createCloudConfig(),
    );
    const payload = buildHeartbeatPayload();

    expect(payload).not.toBeNull();
    expect(payload!.status).toBe('idle');
    expect(payload!.task_id).toBeNull();
    expect(payload!.task_title).toBeNull();
    expect(payload!.progress_met).toBe(0);
    expect(payload!.progress_total).toBe(0);
  });

  it('respects status override', () => {
    writeFiles(createState(), createCloudConfig());
    const payload = buildHeartbeatPayload({ status: 'idle' });
    expect(payload!.status).toBe('idle');
  });

  it('payload contains only expected fields', () => {
    writeFiles(createState(), createCloudConfig());
    const payload = buildHeartbeatPayload()!;

    const keys = Object.keys(payload).sort();
    expect(keys).toEqual([
      'active_files',
      'focus_score',
      'progress_met',
      'progress_total',
      'project_id',
      'status',
      'task_id',
      'task_title',
      'user_id',
    ]);
  });

  it('never leaks local file paths as absolute paths', () => {
    writeFiles(createState(), createCloudConfig());
    const payload = buildHeartbeatPayload();
    if (payload) {
      for (const file of payload.active_files) {
        expect(file).not.toMatch(/^\//); // no absolute paths
        expect(file).not.toMatch(/^[A-Z]:\\/); // no Windows absolute paths
      }
    }
  });
});

describe('fireHeartbeat', () => {
  it('does not throw when cloud is not configured', () => {
    writeFiles(createState());
    expect(() => fireHeartbeat()).not.toThrow();
  });

  it('does not throw with status override', () => {
    writeFiles(createState());
    expect(() => fireHeartbeat({ status: 'idle' })).not.toThrow();
  });

  it('does not throw when state is missing', () => {
    // No state.json written — should silently fail
    expect(() => fireHeartbeat()).not.toThrow();
  });
});
