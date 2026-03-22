import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let tmpDir: string;
let originalCwd: string;

// Mock the internal state module (was 'vibe-focus' in the separate package)
vi.mock('../core/state.js', () => ({
  getStateDir: () => path.join(process.cwd(), '.vibe-focus'),
}));

const {
  getTeamDir,
  getWorkersDir,
  isTeamInitialized,
  createTeamDirs,
  writeTeamConfig,
  readTeamConfig,
  writeLocalConfig,
  readLocalConfig,
  getUsername,
  updateGitignore,
} = await import('../team/core/team-state.js');

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vft-test-'));
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  fs.mkdirSync(path.join(tmpDir, '.vibe-focus'), { recursive: true });
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('getTeamDir / getWorkersDir', () => {
  it('returns correct paths', () => {
    expect(getTeamDir()).toContain(path.join('.vibe-focus', 'team'));
    expect(getWorkersDir()).toContain(path.join('.vibe-focus', 'team', 'workers'));
  });
});

describe('createTeamDirs', () => {
  it('creates team and workers directories', () => {
    createTeamDirs();
    expect(fs.existsSync(getTeamDir())).toBe(true);
    expect(fs.existsSync(getWorkersDir())).toBe(true);
  });

  it('is idempotent', () => {
    createTeamDirs();
    createTeamDirs();
    expect(fs.existsSync(getTeamDir())).toBe(true);
  });
});

describe('isTeamInitialized', () => {
  it('returns false when no config exists', () => {
    expect(isTeamInitialized()).toBe(false);
  });

  it('returns true when config exists', () => {
    createTeamDirs();
    writeTeamConfig({
      version: 1,
      teamName: 'test',
      settings: { staleThresholdMinutes: 15, offlineThresholdMinutes: 60, syncIntervalSeconds: 60 },
    });
    expect(isTeamInitialized()).toBe(true);
  });
});

describe('writeTeamConfig / readTeamConfig', () => {
  it('round-trips team config', () => {
    createTeamDirs();
    const config = {
      version: 1 as const,
      teamName: 'my-team',
      settings: { staleThresholdMinutes: 10, offlineThresholdMinutes: 30, syncIntervalSeconds: 120 },
    };
    writeTeamConfig(config);
    const read = readTeamConfig();
    expect(read.teamName).toBe('my-team');
    expect(read.settings.staleThresholdMinutes).toBe(10);
  });

  it('throws on missing config', () => {
    createTeamDirs();
    expect(() => readTeamConfig()).toThrow('Team not initialized');
  });

  it('throws on corrupt config', () => {
    createTeamDirs();
    fs.writeFileSync(path.join(getTeamDir(), 'config.json'), 'not json');
    expect(() => readTeamConfig()).toThrow('Corrupt team config');
  });
});

describe('writeLocalConfig / readLocalConfig / getUsername', () => {
  it('round-trips local config', () => {
    createTeamDirs();
    writeLocalConfig({ username: 'alice', machine: 'macbook', autoSync: false });
    const read = readLocalConfig();
    expect(read.username).toBe('alice');
    expect(read.machine).toBe('macbook');
  });

  it('getUsername returns validated username', () => {
    createTeamDirs();
    writeLocalConfig({ username: 'bob', machine: 'linux', autoSync: true });
    expect(getUsername()).toBe('bob');
  });

  it('throws on missing local config', () => {
    createTeamDirs();
    expect(() => readLocalConfig()).toThrow('Local config not found');
  });

  it('throws on corrupt local config', () => {
    createTeamDirs();
    fs.writeFileSync(path.join(getTeamDir(), 'local.json'), '{}');
    expect(() => readLocalConfig()).toThrow('Missing username');
  });
});

describe('updateGitignore', () => {
  it('writes gitignore with team tracking rules', () => {
    createTeamDirs();
    updateGitignore();
    const content = fs.readFileSync(path.join(tmpDir, '.vibe-focus', '.gitignore'), 'utf-8');
    expect(content).toContain('!team/');
    expect(content).toContain('!team/**');
    expect(content).toContain('team/local.json');
    expect(content).toContain('*');
  });
});
