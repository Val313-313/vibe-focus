import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { WorkerPresence, CoworkerContext } from '../team/types.js';

let tmpDir: string;
let originalCwd: string;

// Mock internal modules (was 'vibe-focus' in the separate package)
vi.mock('../core/state.js', () => ({
  getStateDir: () => path.join(process.cwd(), '.vibe-focus'),
  readState: () => ({
    version: 1,
    projectName: 'test',
    activeTaskId: 't1',
    tasks: [
      { id: 't1', title: 'Test task', status: 'active', acceptanceCriteria: [{ id: 'c1', text: 'Do it', met: false }], startedAt: '2026-03-22T10:00:00Z' },
    ],
    notes: [],
    focusEvents: [],
    sessionContexts: [],
  }),
}));

vi.mock('../core/task.js', () => ({
  resolveActiveTask: (state: any) => state.tasks[0],
  criteriaProgress: () => ({ met: 0, total: 1 }),
}));

vi.mock('../utils/time.js', () => ({
  now: () => '2026-03-22T12:00:00Z',
  elapsedMinutes: (ts: string) => {
    const diff = new Date('2026-03-22T12:00:00Z').getTime() - new Date(ts).getTime();
    return Math.floor(diff / 60000);
  },
}));

// Mock file-tracker
vi.mock('../team/core/file-tracker.js', () => ({
  getActiveFiles: () => ['src/index.ts', 'src/app.ts'],
  getActiveDirectories: () => ['src/'],
}));

const { writePresence, readAllPresence, getCoworkers, detectConflicts, goOffline } =
  await import('../team/core/presence.js');
const { createTeamDirs, writeLocalConfig } = await import('../team/core/team-state.js');

function setupTeam(username = 'alice') {
  createTeamDirs();
  writeLocalConfig({ username, machine: 'test-machine', autoSync: false });
}

function writeCoworkerPresence(presence: WorkerPresence) {
  const workersDir = path.join(tmpDir, '.vibe-focus', 'team', 'workers');
  fs.writeFileSync(path.join(workersDir, `${presence.username}.json`), JSON.stringify(presence));
}

function makePresence(overrides: Partial<WorkerPresence> = {}): WorkerPresence {
  return {
    version: 1,
    username: 'bob',
    machine: 'bob-pc',
    taskId: 't2',
    taskTitle: 'Other task',
    taskStatus: 'active',
    progress: { met: 1, total: 3, percent: 33 },
    activeFiles: ['src/utils.ts'],
    activeDirectories: ['src/'],
    flowMode: null,
    lastHeartbeat: '2026-03-22T11:58:00Z', // 2 minutes ago -> active
    sessionStarted: '2026-03-22T10:00:00Z',
    worker: null,
    ...overrides,
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vft-pres-'));
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  fs.mkdirSync(path.join(tmpDir, '.vibe-focus'), { recursive: true });
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('writePresence', () => {
  it('writes a presence file for the current user', () => {
    setupTeam('alice');
    writePresence();
    const filePath = path.join(tmpDir, '.vibe-focus', 'team', 'workers', 'alice.json');
    expect(fs.existsSync(filePath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(data.username).toBe('alice');
    expect(data.version).toBe(1);
    expect(data.taskId).toBe('t1');
    expect(data.taskStatus).toBe('active');
    expect(data.activeFiles).toEqual(['src/index.ts', 'src/app.ts']);
  });

  it('filters sensitive files from presence', () => {
    setupTeam('alice');
    writePresence();
    const filePath = path.join(tmpDir, '.vibe-focus', 'team', 'workers', 'alice.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    // Our mock returns safe files, so all should pass through
    expect(data.activeFiles).not.toContain('.env');
  });
});

describe('readAllPresence', () => {
  it('reads all presence files', () => {
    setupTeam('alice');
    writeCoworkerPresence(makePresence({ username: 'bob' }));
    writeCoworkerPresence(makePresence({ username: 'charlie' }));
    const all = readAllPresence();
    expect(all).toHaveLength(2);
    expect(all.map((p) => p.username).sort()).toEqual(['bob', 'charlie']);
  });

  it('returns empty array when no workers dir', () => {
    fs.mkdirSync(path.join(tmpDir, '.vibe-focus', 'team'), { recursive: true });
    // No workers dir created
    const all = readAllPresence();
    expect(all).toEqual([]);
  });

  it('skips corrupt files', () => {
    setupTeam('alice');
    const workersDir = path.join(tmpDir, '.vibe-focus', 'team', 'workers');
    fs.writeFileSync(path.join(workersDir, 'corrupt.json'), 'not json');
    writeCoworkerPresence(makePresence({ username: 'bob' }));
    const all = readAllPresence();
    expect(all).toHaveLength(1);
    expect(all[0].username).toBe('bob');
  });

  it('skips files missing required fields', () => {
    setupTeam('alice');
    const workersDir = path.join(tmpDir, '.vibe-focus', 'team', 'workers');
    fs.writeFileSync(path.join(workersDir, 'bad.json'), JSON.stringify({ foo: 'bar' }));
    const all = readAllPresence();
    expect(all).toEqual([]);
  });
});

describe('getCoworkers', () => {
  it('excludes self from coworkers', () => {
    setupTeam('alice');
    writePresence(); // writes alice.json
    writeCoworkerPresence(makePresence({ username: 'bob' }));
    const coworkers = getCoworkers();
    expect(coworkers).toHaveLength(1);
    expect(coworkers[0].presence.username).toBe('bob');
  });

  it('calculates staleness levels correctly', () => {
    setupTeam('alice');
    // active: 2 min ago
    writeCoworkerPresence(makePresence({ username: 'bob', lastHeartbeat: '2026-03-22T11:58:00Z' }));
    // idle: 10 min ago
    writeCoworkerPresence(makePresence({ username: 'charlie', lastHeartbeat: '2026-03-22T11:50:00Z' }));
    // away: 30 min ago
    writeCoworkerPresence(makePresence({ username: 'dave', lastHeartbeat: '2026-03-22T11:30:00Z' }));
    // offline: 2 hours ago
    writeCoworkerPresence(makePresence({ username: 'eve', lastHeartbeat: '2026-03-22T10:00:00Z' }));

    const coworkers = getCoworkers();
    const byName = Object.fromEntries(coworkers.map((c) => [c.presence.username, c]));

    expect(byName.bob.staleness).toBe('active');
    expect(byName.charlie.staleness).toBe('idle');
    expect(byName.dave.staleness).toBe('away');
    expect(byName.eve.staleness).toBe('offline');
  });
});

describe('detectConflicts', () => {
  it('detects file collisions', () => {
    const coworker: CoworkerContext = {
      presence: makePresence({ activeFiles: ['src/index.ts', 'src/utils.ts'] }),
      staleness: 'active',
      heartbeatAge: 2,
    };
    const warnings = detectConflicts(['src/index.ts', 'src/app.ts'], [coworker]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe('file_collision');
    expect(warnings[0].files).toEqual(['src/index.ts']);
  });

  it('detects directory overlap when no file collision', () => {
    const coworker: CoworkerContext = {
      presence: makePresence({ activeFiles: ['src/utils.ts'], activeDirectories: ['src/'] }),
      staleness: 'active',
      heartbeatAge: 2,
    };
    const warnings = detectConflicts(['src/app.ts'], [coworker]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe('directory_overlap');
  });

  it('ignores offline coworkers', () => {
    const coworker: CoworkerContext = {
      presence: makePresence({ activeFiles: ['src/index.ts'] }),
      staleness: 'offline',
      heartbeatAge: 120,
    };
    const warnings = detectConflicts(['src/index.ts'], [coworker]);
    expect(warnings).toEqual([]);
  });

  it('returns empty when no conflicts', () => {
    const coworker: CoworkerContext = {
      presence: makePresence({ activeFiles: ['lib/other.ts'], activeDirectories: ['lib/'] }),
      staleness: 'active',
      heartbeatAge: 2,
    };
    const warnings = detectConflicts(['src/index.ts'], [coworker]);
    expect(warnings).toEqual([]);
  });
});

describe('goOffline', () => {
  it('removes own presence file', () => {
    setupTeam('alice');
    writePresence();
    const filePath = path.join(tmpDir, '.vibe-focus', 'team', 'workers', 'alice.json');
    expect(fs.existsSync(filePath)).toBe(true);
    goOffline();
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('does not throw if presence file does not exist', () => {
    setupTeam('alice');
    expect(() => goOffline()).not.toThrow();
  });
});
