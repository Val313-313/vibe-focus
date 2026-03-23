import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { isValidAgent, resolveAgent } from '../agents/resolve.js';
import { AGENT_CONFIGS } from '../agents/types.js';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return { ...actual, existsSync: vi.fn(() => false) };
});

describe('isValidAgent', () => {
  it('returns true for valid agent types', () => {
    expect(isValidAgent('claude')).toBe(true);
    expect(isValidAgent('copilot')).toBe(true);
    expect(isValidAgent('cursor')).toBe(true);
    expect(isValidAgent('windsurf')).toBe(true);
    expect(isValidAgent('generic')).toBe(true);
  });

  it('returns false for invalid values', () => {
    expect(isValidAgent('vscode')).toBe(false);
    expect(isValidAgent('')).toBe(false);
    expect(isValidAgent('CLAUDE')).toBe(false);
  });
});

describe('AGENT_CONFIGS', () => {
  it('has config for all 5 agent types', () => {
    expect(Object.keys(AGENT_CONFIGS)).toEqual(['claude', 'copilot', 'cursor', 'windsurf', 'generic']);
  });

  it('claude supports hooks', () => {
    expect(AGENT_CONFIGS.claude.supportsHook).toBe(true);
    expect(AGENT_CONFIGS.claude.hookDir).toBe('.claude/hooks');
  });

  it('non-claude agents do not support hooks', () => {
    expect(AGENT_CONFIGS.copilot.supportsHook).toBe(false);
    expect(AGENT_CONFIGS.cursor.supportsHook).toBe(false);
    expect(AGENT_CONFIGS.windsurf.supportsHook).toBe(false);
    expect(AGENT_CONFIGS.generic.supportsHook).toBe(false);
  });

  it('each config has correct display name', () => {
    expect(AGENT_CONFIGS.claude.displayName).toBe('Claude Code');
    expect(AGENT_CONFIGS.copilot.displayName).toBe('GitHub Copilot');
    expect(AGENT_CONFIGS.cursor.displayName).toBe('Cursor');
    expect(AGENT_CONFIGS.windsurf.displayName).toBe('Windsurf');
    expect(AGENT_CONFIGS.generic.displayName).toBe('Generic AI Agent');
  });

  it('windsurf writes to project root', () => {
    expect(AGENT_CONFIGS.windsurf.rulesDir).toBe('');
    expect(AGENT_CONFIGS.windsurf.rulesFile).toBe('.windsurfrules');
  });
});

describe('resolveAgent', () => {
  const originalEnv = { ...process.env };
  const mockExistsSync = vi.mocked(existsSync);

  beforeEach(() => {
    delete process.env.VF_AGENT;
    delete process.env.CLAUDE_PROJECT_DIR;
    mockExistsSync.mockReturnValue(false);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns flag value when valid', () => {
    expect(resolveAgent('cursor')).toBe('cursor');
    expect(resolveAgent('copilot')).toBe('copilot');
    expect(resolveAgent('claude')).toBe('claude');
    expect(resolveAgent('windsurf')).toBe('windsurf');
  });

  it('throws on invalid flag value', () => {
    expect(() => resolveAgent('vscode')).toThrow('Unknown agent');
  });

  it('uses VF_AGENT env when no flag', () => {
    process.env.VF_AGENT = 'cursor';
    expect(resolveAgent()).toBe('cursor');
  });

  it('ignores invalid VF_AGENT and falls through', () => {
    process.env.VF_AGENT = 'invalid';
    // No config, no CLAUDE_PROJECT_DIR, no markers → generic
    expect(resolveAgent()).toBe('generic');
  });

  it('auto-detects claude from CLAUDE_PROJECT_DIR', () => {
    process.env.CLAUDE_PROJECT_DIR = '/some/path';
    expect(resolveAgent()).toBe('claude');
  });

  it('auto-detects cursor from .cursor directory', () => {
    mockExistsSync.mockImplementation((p) => String(p).endsWith('.cursor'));
    expect(resolveAgent()).toBe('cursor');
  });

  it('auto-detects copilot from copilot-instructions.md', () => {
    mockExistsSync.mockImplementation((p) => String(p).endsWith('copilot-instructions.md'));
    expect(resolveAgent()).toBe('copilot');
  });

  it('auto-detects windsurf from .windsurfrules', () => {
    mockExistsSync.mockImplementation((p) => String(p).endsWith('.windsurfrules'));
    expect(resolveAgent()).toBe('windsurf');
  });

  it('falls back to generic when nothing matches', () => {
    expect(resolveAgent()).toBe('generic');
  });

  it('flag takes priority over env', () => {
    process.env.VF_AGENT = 'cursor';
    expect(resolveAgent('copilot')).toBe('copilot');
  });

  it('CLAUDE_PROJECT_DIR takes priority over directory markers', () => {
    process.env.CLAUDE_PROJECT_DIR = '/some/path';
    mockExistsSync.mockImplementation((p) => String(p).endsWith('.cursor'));
    expect(resolveAgent()).toBe('claude');
  });
});
