import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readCloudConfig, writeCloudConfig, isCloudLinked, clearCloudAuth, isValidUUID, isValidHttpsUrl } from '../cloud/core/cloud-state.js';

let tmpDir: string;
let originalCwd: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-cloud-test-'));
  const stateDir = path.join(tmpDir, '.vibe-focus');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, 'state.json'),
    JSON.stringify({ version: 1, projectName: 'test', projectScope: null, activeTaskId: null, activeWorkers: {}, nextTaskNumber: 1, tasks: [], notes: [], nextNoteNumber: 1, currentSession: null, focusEvents: [], sessionContexts: [], nextContextNumber: 1 }),
  );
  originalCwd = process.cwd();
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('cloud-state', () => {
  describe('readCloudConfig', () => {
    it('returns default config when no file exists', () => {
      const config = readCloudConfig();
      expect(config.version).toBe(1);
      expect(config.apiUrl).toBe('https://vibeteamz.vercel.app');
      expect(config.accessToken).toBeNull();
      expect(config.projectId).toBeNull();
    });

    it('reads existing config', () => {
      const stateDir = path.join(tmpDir, '.vibe-focus');
      fs.writeFileSync(
        path.join(stateDir, 'cloud.json'),
        JSON.stringify({
          version: 1,
          apiUrl: 'https://vibeteamz.vercel.app',
          supabaseUrl: 'https://abc.supabase.co',
          supabaseAnonKey: 'eyJhbGciOiJIUzI1NiJ9.test',
          accessToken: 'tok123',
          refreshToken: 'ref456',
          userId: '550e8400-e29b-41d4-a716-446655440000',
          projectId: '660e8400-e29b-41d4-a716-446655440000',
          linkedAt: '2025-01-01T00:00:00.000Z',
        }),
      );

      const config = readCloudConfig();
      expect(config.userId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(config.projectId).toBe('660e8400-e29b-41d4-a716-446655440000');
      expect(config.accessToken).toBe('tok123');
    });

    it('rejects invalid version', () => {
      const stateDir = path.join(tmpDir, '.vibe-focus');
      fs.writeFileSync(
        path.join(stateDir, 'cloud.json'),
        JSON.stringify({ version: 99, apiUrl: 'https://x.com' }),
      );
      expect(() => readCloudConfig()).toThrow('Invalid cloud config version');
    });

    it('rejects non-HTTPS apiUrl', () => {
      const stateDir = path.join(tmpDir, '.vibe-focus');
      fs.writeFileSync(
        path.join(stateDir, 'cloud.json'),
        JSON.stringify({ version: 1, apiUrl: 'http://evil.com' }),
      );
      expect(() => readCloudConfig()).toThrow('apiUrl must be a valid HTTPS URL');
    });

    it('rejects invalid UUID in userId', () => {
      const stateDir = path.join(tmpDir, '.vibe-focus');
      fs.writeFileSync(
        path.join(stateDir, 'cloud.json'),
        JSON.stringify({
          version: 1,
          apiUrl: 'https://vibeteamz.vercel.app',
          supabaseUrl: null,
          supabaseAnonKey: null,
          accessToken: null,
          refreshToken: null,
          userId: 'not-a-uuid',
          projectId: null,
          linkedAt: null,
        }),
      );
      expect(() => readCloudConfig()).toThrow('userId must be a valid UUID');
    });

    it('rejects invalid UUID in projectId', () => {
      const stateDir = path.join(tmpDir, '.vibe-focus');
      fs.writeFileSync(
        path.join(stateDir, 'cloud.json'),
        JSON.stringify({
          version: 1,
          apiUrl: 'https://vibeteamz.vercel.app',
          supabaseUrl: null,
          supabaseAnonKey: null,
          accessToken: null,
          refreshToken: null,
          userId: null,
          projectId: 'drop-table-users',
          linkedAt: null,
        }),
      );
      expect(() => readCloudConfig()).toThrow('projectId must be a valid UUID');
    });

    it('rejects non-HTTPS supabaseUrl', () => {
      const stateDir = path.join(tmpDir, '.vibe-focus');
      fs.writeFileSync(
        path.join(stateDir, 'cloud.json'),
        JSON.stringify({
          version: 1,
          apiUrl: 'https://vibeteamz.vercel.app',
          supabaseUrl: 'http://insecure.supabase.co',
          supabaseAnonKey: null,
          accessToken: null,
          refreshToken: null,
          userId: null,
          projectId: null,
          linkedAt: null,
        }),
      );
      expect(() => readCloudConfig()).toThrow('supabaseUrl must be a valid HTTPS URL');
    });

    it('rejects arrays instead of objects', () => {
      const stateDir = path.join(tmpDir, '.vibe-focus');
      fs.writeFileSync(path.join(stateDir, 'cloud.json'), '[]');
      expect(() => readCloudConfig()).toThrow('not an object');
    });

    it('rejects non-string nullable fields', () => {
      const stateDir = path.join(tmpDir, '.vibe-focus');
      fs.writeFileSync(
        path.join(stateDir, 'cloud.json'),
        JSON.stringify({
          version: 1,
          apiUrl: 'https://vibeteamz.vercel.app',
          supabaseUrl: null,
          supabaseAnonKey: null,
          accessToken: 12345, // should be string or null
          refreshToken: null,
          userId: null,
          projectId: null,
          linkedAt: null,
        }),
      );
      expect(() => readCloudConfig()).toThrow('accessToken must be string or null');
    });
  });

  describe('writeCloudConfig', () => {
    it('writes valid config atomically with mode 600', () => {
      writeCloudConfig({
        version: 1,
        apiUrl: 'https://vibeteamz.vercel.app',
        supabaseUrl: null,
        supabaseAnonKey: null,
        accessToken: null,
        refreshToken: null,
        userId: null,
        projectId: null,
        linkedAt: null,
      });

      const filePath = path.join(tmpDir, '.vibe-focus', 'cloud.json');
      expect(fs.existsSync(filePath)).toBe(true);

      const stats = fs.statSync(filePath);
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o600);
    });

    it('rejects writing config with HTTP apiUrl', () => {
      expect(() =>
        writeCloudConfig({
          version: 1,
          apiUrl: 'http://insecure.com',
          supabaseUrl: null,
          supabaseAnonKey: null,
          accessToken: null,
          refreshToken: null,
          userId: null,
          projectId: null,
          linkedAt: null,
        }),
      ).toThrow('apiUrl must be a valid HTTPS URL');
    });

    it('does not leave tmp files on validation failure', () => {
      try {
        writeCloudConfig({
          version: 1,
          apiUrl: 'http://bad.com',
          supabaseUrl: null,
          supabaseAnonKey: null,
          accessToken: null,
          refreshToken: null,
          userId: null,
          projectId: null,
          linkedAt: null,
        });
      } catch { /* expected */ }

      const stateDir = path.join(tmpDir, '.vibe-focus');
      const files = fs.readdirSync(stateDir);
      const tmpFiles = files.filter(f => f.includes('.tmp'));
      expect(tmpFiles).toHaveLength(0);
    });
  });

  describe('isCloudLinked', () => {
    it('returns false when no config exists', () => {
      expect(isCloudLinked()).toBe(false);
    });

    it('returns false when not authenticated', () => {
      writeCloudConfig({
        version: 1,
        apiUrl: 'https://vibeteamz.vercel.app',
        supabaseUrl: null,
        supabaseAnonKey: null,
        accessToken: null,
        refreshToken: null,
        userId: null,
        projectId: null,
        linkedAt: null,
      });
      expect(isCloudLinked()).toBe(false);
    });

    it('returns false when project not linked', () => {
      writeCloudConfig({
        version: 1,
        apiUrl: 'https://vibeteamz.vercel.app',
        supabaseUrl: null,
        supabaseAnonKey: null,
        accessToken: 'tok',
        refreshToken: 'ref',
        userId: '550e8400-e29b-41d4-a716-446655440000',
        projectId: null,
        linkedAt: null,
      });
      expect(isCloudLinked()).toBe(false);
    });

    it('returns true when fully configured', () => {
      writeCloudConfig({
        version: 1,
        apiUrl: 'https://vibeteamz.vercel.app',
        supabaseUrl: 'https://abc.supabase.co',
        supabaseAnonKey: 'key123',
        accessToken: 'token123',
        refreshToken: 'ref123',
        userId: '550e8400-e29b-41d4-a716-446655440000',
        projectId: '660e8400-e29b-41d4-a716-446655440000',
        linkedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(isCloudLinked()).toBe(true);
    });
  });

  describe('clearCloudAuth', () => {
    it('clears auth tokens but preserves project link', () => {
      writeCloudConfig({
        version: 1,
        apiUrl: 'https://vibeteamz.vercel.app',
        supabaseUrl: 'https://abc.supabase.co',
        supabaseAnonKey: 'key123',
        accessToken: 'token123',
        refreshToken: 'ref123',
        userId: '550e8400-e29b-41d4-a716-446655440000',
        projectId: '660e8400-e29b-41d4-a716-446655440000',
        linkedAt: '2025-01-01T00:00:00.000Z',
      });

      clearCloudAuth();

      const config = readCloudConfig();
      expect(config.accessToken).toBeNull();
      expect(config.refreshToken).toBeNull();
      expect(config.userId).toBeNull();
      expect(config.apiUrl).toBe('https://vibeteamz.vercel.app');
      expect(config.projectId).toBe('660e8400-e29b-41d4-a716-446655440000');
    });

    it('does not throw when no config exists', () => {
      expect(() => clearCloudAuth()).not.toThrow();
    });
  });
});

describe('validation helpers', () => {
  describe('isValidUUID', () => {
    it('accepts valid UUID v4', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('rejects non-UUID strings', () => {
      expect(isValidUUID('not-a-uuid')).toBe(false);
      expect(isValidUUID('')).toBe(false);
      expect(isValidUUID('550e8400-e29b-41d4-a716')).toBe(false);
    });

    it('rejects SQL injection attempts', () => {
      expect(isValidUUID('DROP TABLE users;--')).toBe(false);
      expect(isValidUUID("' OR '1'='1")).toBe(false);
    });
  });

  describe('isValidHttpsUrl', () => {
    it('accepts valid HTTPS URLs', () => {
      expect(isValidHttpsUrl('https://vibeteamz.vercel.app')).toBe(true);
      expect(isValidHttpsUrl('https://abc.supabase.co')).toBe(true);
      expect(isValidHttpsUrl('https://localhost:3000')).toBe(true);
    });

    it('rejects HTTP URLs', () => {
      expect(isValidHttpsUrl('http://evil.com')).toBe(false);
    });

    it('rejects protocol smuggling', () => {
      expect(isValidHttpsUrl('javascript:alert(1)')).toBe(false);
      expect(isValidHttpsUrl('ftp://files.com')).toBe(false);
      expect(isValidHttpsUrl('data:text/html,<h1>hi</h1>')).toBe(false);
    });

    it('rejects empty and malformed input', () => {
      expect(isValidHttpsUrl('')).toBe(false);
      expect(isValidHttpsUrl('not-a-url')).toBe(false);
    });
  });
});
