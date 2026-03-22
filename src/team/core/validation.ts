import path from 'node:path';

const SAFE_USERNAME = /^[a-zA-Z0-9_-]{1,32}$/;

const SENSITIVE_PATTERNS = [
  /\.env/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /secret/i,
  /credential/i,
  /\.aws\//i,
  /\.ssh\//i,
  /\.gnupg\//i,
  /token/i,
  /password/i,
  /\.netrc/i,
  /\.npmrc$/i,
  /\.pypirc$/i,
];

/**
 * Validate a username. Only allows alphanumeric, underscore, hyphen.
 * Throws on invalid input.
 */
export function validateUsername(username: string): string {
  if (!SAFE_USERNAME.test(username)) {
    throw new Error(
      `Invalid username "${username}". Only letters, numbers, hyphens, and underscores allowed (max 32 chars).`,
    );
  }
  return username;
}

/**
 * Validate that a resolved file path stays within the expected directory.
 * Prevents path traversal attacks.
 */
export function validatePathWithin(filePath: string, expectedDir: string): string {
  const resolved = path.resolve(filePath);
  const resolvedDir = path.resolve(expectedDir);
  if (!resolved.startsWith(resolvedDir + path.sep) && resolved !== resolvedDir) {
    throw new Error(`Path traversal detected: ${filePath} escapes ${expectedDir}`);
  }
  return resolved;
}

/**
 * Filter out files that might contain sensitive information.
 * These should never be exposed in shared presence files.
 */
export function filterSensitiveFiles(files: string[]): string[] {
  return files.filter((file) => {
    const lower = file.toLowerCase();
    return !SENSITIVE_PATTERNS.some((pattern) => pattern.test(lower));
  });
}

/**
 * Check if a file path looks sensitive.
 */
export function isSensitivePath(filePath: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(filePath.toLowerCase()));
}
