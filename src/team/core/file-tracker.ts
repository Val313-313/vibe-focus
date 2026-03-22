import { execSync } from 'node:child_process';
import path from 'node:path';

/**
 * Get list of files modified since the last commit (unstaged + staged).
 * Uses git diff to detect what the current user is actively touching.
 */
export function getActiveFiles(): string[] {
  try {
    const staged = execSync('git diff --cached --name-only', { encoding: 'utf-8' }).trim();
    const unstaged = execSync('git diff --name-only', { encoding: 'utf-8' }).trim();

    const files = new Set<string>();
    for (const line of staged.split('\n')) {
      if (line.trim()) files.add(line.trim());
    }
    for (const line of unstaged.split('\n')) {
      if (line.trim()) files.add(line.trim());
    }

    return [...files].sort();
  } catch {
    return [];
  }
}

/**
 * Extract unique directories from a file list.
 * Returns paths with trailing slash for easy matching.
 */
export function getActiveDirectories(): string[] {
  const files = getActiveFiles();
  const dirs = new Set<string>();

  for (const file of files) {
    const dir = path.dirname(file);
    if (dir !== '.') {
      dirs.add(dir + '/');
    }
  }

  return [...dirs].sort();
}
