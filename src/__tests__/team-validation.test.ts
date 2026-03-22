import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  validateUsername,
  validatePathWithin,
  filterSensitiveFiles,
  isSensitivePath,
} from '../team/core/validation.js';

describe('validateUsername', () => {
  it('accepts valid usernames', () => {
    expect(validateUsername('alice')).toBe('alice');
    expect(validateUsername('bob-123')).toBe('bob-123');
    expect(validateUsername('dev_user')).toBe('dev_user');
    expect(validateUsername('A')).toBe('A');
    expect(validateUsername('a'.repeat(32))).toBe('a'.repeat(32));
  });

  it('rejects empty string', () => {
    expect(() => validateUsername('')).toThrow('Invalid username');
  });

  it('rejects usernames with spaces', () => {
    expect(() => validateUsername('alice bob')).toThrow('Invalid username');
  });

  it('rejects usernames with special characters', () => {
    expect(() => validateUsername('alice@bob')).toThrow('Invalid username');
    expect(() => validateUsername('../etc')).toThrow('Invalid username');
    expect(() => validateUsername('user/name')).toThrow('Invalid username');
  });

  it('rejects usernames longer than 32 chars', () => {
    expect(() => validateUsername('a'.repeat(33))).toThrow('Invalid username');
  });

  it('rejects path traversal attempts', () => {
    expect(() => validateUsername('../../etc/passwd')).toThrow('Invalid username');
    expect(() => validateUsername('..%2F..%2Fetc')).toThrow('Invalid username');
  });
});

describe('validatePathWithin', () => {
  it('accepts paths within the directory', () => {
    const dir = '/tmp/workers';
    const result = validatePathWithin('/tmp/workers/alice.json', dir);
    expect(result).toBe(path.resolve('/tmp/workers/alice.json'));
  });

  it('rejects path traversal', () => {
    const dir = '/tmp/workers';
    expect(() => validatePathWithin('/tmp/workers/../secret.json', dir)).toThrow(
      'Path traversal detected',
    );
  });

  it('rejects completely outside paths', () => {
    const dir = '/tmp/workers';
    expect(() => validatePathWithin('/etc/passwd', dir)).toThrow('Path traversal detected');
  });

  it('accepts the directory itself', () => {
    const dir = '/tmp/workers';
    const result = validatePathWithin('/tmp/workers', dir);
    expect(result).toBe(path.resolve('/tmp/workers'));
  });
});

describe('filterSensitiveFiles', () => {
  it('filters .env files', () => {
    const files = ['src/index.ts', '.env', '.env.local', 'src/.env.production'];
    expect(filterSensitiveFiles(files)).toEqual(['src/index.ts']);
  });

  it('filters key and certificate files', () => {
    const files = ['app.ts', 'server.pem', 'private.key', 'cert.p12', 'store.pfx'];
    expect(filterSensitiveFiles(files)).toEqual(['app.ts']);
  });

  it('filters credential and secret files', () => {
    const files = ['app.ts', 'credentials.json', 'secret-config.yaml', 'db-password.txt'];
    expect(filterSensitiveFiles(files)).toEqual(['app.ts']);
  });

  it('filters dotfile directories', () => {
    const files = ['app.ts', '.aws/credentials', '.ssh/id_rsa', '.gnupg/pubring.kbx'];
    expect(filterSensitiveFiles(files)).toEqual(['app.ts']);
  });

  it('filters token files', () => {
    const files = ['app.ts', 'auth-token.json', '.npmrc', '.pypirc', '.netrc'];
    expect(filterSensitiveFiles(files)).toEqual(['app.ts']);
  });

  it('passes through safe files', () => {
    const files = ['src/index.ts', 'package.json', 'README.md', 'tests/app.test.ts'];
    expect(filterSensitiveFiles(files)).toEqual(files);
  });

  it('handles empty array', () => {
    expect(filterSensitiveFiles([])).toEqual([]);
  });
});

describe('isSensitivePath', () => {
  it('detects sensitive paths', () => {
    expect(isSensitivePath('.env')).toBe(true);
    expect(isSensitivePath('secret.json')).toBe(true);
    expect(isSensitivePath('.ssh/id_rsa')).toBe(true);
  });

  it('allows safe paths', () => {
    expect(isSensitivePath('src/index.ts')).toBe(false);
    expect(isSensitivePath('package.json')).toBe(false);
  });

  it('is case insensitive', () => {
    expect(isSensitivePath('.ENV')).toBe(true);
    expect(isSensitivePath('SECRET.json')).toBe(true);
  });
});
