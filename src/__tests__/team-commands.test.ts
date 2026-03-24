import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let tmpDir: string;
let originalCwd: string;

// Mock internal modules (was 'vibe-focus' in the separate package)
vi.mock('../core/state.js', () => ({
  getStateDir: () => path.join(process.cwd(), '.vibe-focus'),
  readState: () => ({
    version: 1,
    projectName: 'test',
    activeTaskId: null,
    tasks: [],
    notes: [],
    focusEvents: [],
    sessionContexts: [],
  }),
}));

vi.mock('../core/task.js', () => ({
  resolveActiveTask: () => null,
  criteriaProgress: () => ({ met: 0, total: 0 }),
}));

vi.mock('../utils/time.js', () => ({
  now: () => '2026-03-22T12:00:00Z',
  elapsedMinutes: () => 0,
}));

vi.mock('../team/core/file-tracker.js', () => ({
  getActiveFiles: () => [],
  getActiveDirectories: () => [],
}));

const { createTeamDirs, writeLocalConfig, writeTeamConfig } = await import('../team/core/team-state.js');
const { writePresence, getCoworkers, goOffline } = await import('../team/core/presence.js');
const { validateUsername } = await import('../team/core/validation.js');

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vft-cmd-'));
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  fs.mkdirSync(path.join(tmpDir, '.vibe-focus'), { recursive: true });
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('init command', () => {
  it('creates team directory structure', () => {
    // Simulate what init does
    createTeamDirs();
    writeTeamConfig({
      version: 1,
      teamName: 'test-team',
      settings: { staleThresholdMinutes: 15, offlineThresholdMinutes: 60, syncIntervalSeconds: 60 },
    });
    writeLocalConfig({ username: 'alice', machine: os.hostname(), autoSync: false });

    // Verify structure
    expect(fs.existsSync(path.join(tmpDir, '.vibe-focus', 'team'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.vibe-focus', 'team', 'workers'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.vibe-focus', 'team', 'config.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.vibe-focus', 'team', 'local.json'))).toBe(true);
  });

  it('rejects invalid username in init', () => {
    expect(() => validateUsername('../hack')).toThrow('Invalid username');
    expect(() => validateUsername('valid-user')).not.toThrow();
  });
});

describe('who command', () => {
  it('detects when a coworker is touching a file', () => {
    createTeamDirs();
    writeLocalConfig({ username: 'alice', machine: 'test', autoSync: false });

    // Write bob's presence touching src/index.ts
    const workersDir = path.join(tmpDir, '.vibe-focus', 'team', 'workers');
    fs.writeFileSync(
      path.join(workersDir, 'bob.json'),
      JSON.stringify({
        version: 1,
        username: 'bob',
        machine: 'bob-pc',
        taskId: 't1',
        taskTitle: 'Task',
        taskStatus: 'active',
        progress: { met: 0, total: 1, percent: 0 },
        activeFiles: ['src/index.ts'],
        activeDirectories: ['src/'],
        flowMode: null,
        lastHeartbeat: '2026-03-22T11:59:00Z',
        sessionStarted: null,
        worker: null,
      }),
    );

    // Verify we can read the coworker data
    const coworkers = getCoworkers();
    expect(coworkers.length).toBeGreaterThanOrEqual(1);
    const bob = coworkers.find((c: any) => c.presence.username === 'bob');
    expect(bob).toBeDefined();
    expect(bob.presence.activeFiles).toContain('src/index.ts');
  });
});

describe('offline command', () => {
  it('removes presence file', () => {
    createTeamDirs();
    writeLocalConfig({ username: 'alice', machine: 'test', autoSync: false });
    writePresence();

    const presencePath = path.join(tmpDir, '.vibe-focus', 'team', 'workers', 'alice.json');
    expect(fs.existsSync(presencePath)).toBe(true);

    goOffline();
    expect(fs.existsSync(presencePath)).toBe(false);
  });
});

describe('CLI entry point', () => {
  it('registers all 5 commands under team', async () => {
    const { Command } = await import('commander');
    const { register } = await import('../team/register.js');

    const program = new Command();
    register(program);

    const teamCmd = program.commands.find((c) => c.name() === 'team');
    expect(teamCmd).toBeDefined();

    const subcommands = teamCmd!.commands.map((c) => c.name());
    expect(subcommands).toContain('init');
    expect(subcommands).toContain('status');
    expect(subcommands).toContain('sync');
    expect(subcommands).toContain('who');
    expect(subcommands).toContain('offline');
    expect(subcommands).toContain('msg');
    expect(subcommands).toContain('discord');
    expect(subcommands).toHaveLength(7);
  });
});
