import { Command } from 'commander';
import { exec } from 'node:child_process';
import { platform } from 'node:os';
import { createInterface } from 'node:readline';
import { readCloudConfig, writeCloudConfig, isValidHttpsUrl } from '../core/cloud-state.js';
import { readState } from '../../core/state.js';
import { now } from '../../utils/time.js';
import { success, error, info, warn } from '../../ui/output.js';
import { installGuard } from '../../commands/guard.js';
import { installGitHook } from '../../commands/hook.js';
import { resolveAgent } from '../../agents/resolve.js';
import type { CloudConfig, SupabaseAuthResponse } from '../types.js';

/** Login timeout in milliseconds */
const LOGIN_TIMEOUT_MS = 10_000;

/** Device flow poll interval in milliseconds */
const DEVICE_POLL_INTERVAL_MS = 5_000;

/** Device flow max wait in milliseconds (10 minutes) */
const DEVICE_MAX_WAIT_MS = 10 * 60 * 1000;

/** Maximum allowed credential length (prevent abuse) */
const MAX_CREDENTIAL_LENGTH = 256;

/** Maximum allowed key length (Supabase JWTs are long) */
const MAX_KEY_LENGTH = 2048;

/** Open a URL in the user's default browser */
function openBrowser(url: string): void {
  const cmd = platform() === 'darwin'
    ? 'open'
    : platform() === 'win32'
      ? 'start'
      : 'xdg-open';

  exec(`${cmd} "${url}"`, () => {
    // Silently ignore errors — user can open the URL manually
  });
}

/** Sleep for a given number of milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * GitHub device flow: authenticate via browser using the vibeteamz device code flow.
 */
export async function githubDeviceFlow(config: ReturnType<typeof readCloudConfig>): Promise<boolean> {
  info('Starting GitHub device flow...');

  // Step 1: Request a device code from the vibeteamz API
  const deviceUrl = `${config.apiUrl}/api/auth/device`;

  let deviceCode: string;
  let userCode: string;
  let verificationUri: string;

  try {
    const response = await fetch(deviceUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(LOGIN_TIMEOUT_MS),
    });

    if (!response.ok) {
      error(`Failed to start device flow (HTTP ${response.status}).`);
      return false;
    }

    const data = await response.json() as Record<string, unknown>;
    deviceCode = data.device_code as string;
    userCode = data.user_code as string;
    verificationUri = data.verification_uri as string;

    if (!deviceCode || !userCode || !verificationUri) {
      error('Malformed device code response.');
      return false;
    }
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === 'TimeoutError') {
      error('Request timed out. Check your network.');
    } else {
      error('Failed to connect to vibeteamz. Check your network.');
    }
    return false;
  }

  // Step 2: Open browser first, then display the code LAST so it stays visible
  openBrowser(verificationUri);

  info(`Open ${verificationUri} and enter this code:`);
  console.log('');
  console.log(`  >>> ${userCode} <<<`);
  console.log('');

  // Step 3: Poll for completion
  const tokenUrl = `${config.apiUrl}/api/auth/device/token`;
  const startTime = Date.now();
  let pollCount = 0;

  while (Date.now() - startTime < DEVICE_MAX_WAIT_MS) {
    await sleep(DEVICE_POLL_INTERVAL_MS);
    pollCount++;

    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_code: deviceCode }),
        signal: AbortSignal.timeout(LOGIN_TIMEOUT_MS),
      });

      if (response.status === 202) {
        // Still waiting — show a dot for progress
        process.stdout.write('.');
        // Re-display code every 4 polls (~20s) so it stays visible
        if (pollCount % 4 === 0) {
          console.log(`  code: ${userCode}`);
        }
        continue;
      }

      if (response.status === 400) {
        const data = await response.json() as Record<string, unknown>;
        if (data.error === 'expired_token') {
          console.log('');
          error('Device code expired. Run the command again.');
          return false;
        }
      }

      if (response.status === 404) {
        console.log('');
        error('Device code not found. Run the command again.');
        return false;
      }

      if (response.ok) {
        const data = await response.json() as Record<string, unknown>;

        if (
          typeof data.access_token === 'string' &&
          typeof data.user_id === 'string'
        ) {
          console.log('');

          // Save credentials
          config.accessToken = data.access_token as string;
          config.refreshToken = (data.refresh_token as string) ?? null;
          config.userId = data.user_id as string;

          // Save Supabase credentials for token refresh (normalize URL)
          if (typeof data.supabase_url === 'string' && data.supabase_url) {
            config.supabaseUrl = String(data.supabase_url).trim().replace(/\/+$/, '');
          }
          if (typeof data.supabase_anon_key === 'string' && data.supabase_anon_key) {
            config.supabaseAnonKey = String(data.supabase_anon_key).trim();
          }

          try {
            writeCloudConfig(config);
          } catch (saveErr: unknown) {
            // If config save fails, clear the problematic URLs and retry
            config.supabaseUrl = null;
            config.supabaseAnonKey = null;
            writeCloudConfig(config);
            warn(`Saved credentials (Supabase URL skipped: ${saveErr instanceof Error ? saveErr.message : 'validation error'})`);
          }

          const displayName = typeof data.username === 'string' && data.username
            ? data.username
            : data.user_id;
          success(`Logged in as ${displayName}`);

          // Auto-link: fetch user's projects and link automatically
          await autoLinkProject(config);

          // Auto-install guard + git hook (best-effort, silent on failure)
          autoInstallHooks();

          return true;
        }
      }
    } catch (e: unknown) {
      // Network error during poll — show error detail
      const msg = e instanceof Error ? e.message : 'unknown';
      process.stdout.write(`x[${msg}]`);
    }
  }

  console.log('');
  error('Timed out waiting for authentication. Run the command again.');
  return false;
}

/**
 * Email/password flow: authenticate directly via Supabase REST API.
 */
async function emailPasswordFlow(
  config: ReturnType<typeof readCloudConfig>,
  email: string,
  password: string,
): Promise<void> {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    error('Supabase URL and anon key are required for email login.');
    info('Provide them with --supabase-url and --supabase-key on first login.');
    info('Or use --github to authenticate via browser instead.');
    return;
  }

  const authUrl = `${config.supabaseUrl}/auth/v1/token?grant_type=password`;

  try {
    const response = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.supabaseAnonKey,
      },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(LOGIN_TIMEOUT_MS),
    });

    if (!response.ok) {
      error(`Authentication failed (HTTP ${response.status}). Check your credentials.`);
      return;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      error('Unexpected response from auth server.');
      return;
    }

    const data = await response.json() as Record<string, unknown>;

    if (
      typeof data.access_token !== 'string' ||
      typeof data.refresh_token !== 'string' ||
      typeof data.user !== 'object' ||
      data.user === null
    ) {
      error('Malformed auth response. Supabase URL may be incorrect.');
      return;
    }

    const user = data.user as Record<string, unknown>;
    if (typeof user.id !== 'string') {
      error('Auth response missing user ID.');
      return;
    }

    const authResult: SupabaseAuthResponse = {
      access_token: data.access_token as string,
      refresh_token: data.refresh_token as string,
      user: {
        id: user.id as string,
        email: typeof user.email === 'string' ? user.email : undefined,
      },
    };

    config.accessToken = authResult.access_token;
    config.refreshToken = authResult.refresh_token;
    config.userId = authResult.user.id;

    writeCloudConfig(config);

    success(`Logged in as ${authResult.user.email ?? authResult.user.id}`);

    // Auto-link: fetch user's projects and link automatically
    await autoLinkProject(config);

    // Auto-install guard + git hook (best-effort, silent on failure)
    autoInstallHooks();
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === 'TimeoutError') {
      error('Login request timed out. Check your network and Supabase URL.');
    } else {
      error('Login failed. Check your network connection.');
    }
  }
}

/** Prompt the user to pick from a numbered list. Returns 0-based index. */
async function promptChoice(count: number): Promise<number> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question('  Enter number: ', (answer) => {
      rl.close();
      const num = parseInt(answer.trim(), 10);
      if (isNaN(num) || num < 1 || num > count) {
        resolve(-1);
      } else {
        resolve(num - 1);
      }
    });
  });
}

/**
 * After login, fetch the user's projects and auto-link.
 * - 1 project → auto-link + generate API key
 * - Multiple → prompt user to pick
 * - 0 → tell them to join a project on the website
 */
export async function autoLinkProject(config: CloudConfig): Promise<boolean> {
  if (!config.accessToken) return false;

  type ProjectInfo = { id: string; name: string | null; role: string };

  let projects: ProjectInfo[] = [];
  try {
    const res = await fetch(`${config.apiUrl}/api/auth/me/projects`, {
      headers: { 'Authorization': `Bearer ${config.accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const data = await res.json() as { projects: ProjectInfo[] };
      projects = data.projects ?? [];
    }
  } catch {
    // Can't reach server — skip auto-link
    info('Could not fetch projects. Link manually with "vf cloud link <project-id>".');
    return false;
  }

  if (projects.length === 0) {
    info('No projects found. Join a project on vibeteamz.com, then run "vf cloud link <id>".');
    return false;
  }

  let chosen: ProjectInfo;

  if (projects.length === 1) {
    chosen = projects[0];
  } else {
    console.log('');
    info('You are a member of multiple projects:');
    console.log('');
    for (let i = 0; i < projects.length; i++) {
      const p = projects[i];
      const label = p.name ?? p.id;
      console.log(`  ${i + 1}. ${label} (${p.role})`);
    }
    console.log('');

    const idx = await promptChoice(projects.length);
    if (idx < 0) {
      info('Skipped. Link manually with "vf cloud link <project-id>".');
      return false;
    }
    chosen = projects[idx];
  }

  // Reuse existing API key if we already have one for this project
  let apiKey: string | null = config.projectId === chosen.id && config.apiKey ? config.apiKey : null;
  let projectName = chosen.name;

  if (!apiKey) {
    // Generate a new API key for the chosen project
    try {
      const res = await fetch(`${config.apiUrl}/api/auth/api-key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.accessToken}`,
        },
        body: JSON.stringify({ project_id: chosen.id, label: 'cli-auto' }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const data = await res.json() as { api_key: string; key_prefix: string; project_name: string | null };
        apiKey = data.api_key;
        if (data.project_name) projectName = data.project_name;
      }
    } catch {
      // API key generation failed — link without it
    }
  }

  config.projectId = chosen.id;
  config.linkedAt = now();
  config.apiKey = apiKey;
  writeCloudConfig(config);

  const label = projectName ? `${projectName} (${chosen.id})` : chosen.id;
  success(`Linked to project ${label}`);
  if (apiKey) {
    info('API key generated. Heartbeats will use project-scoped auth.');
  }
  info('Heartbeats will now be sent with vf start, done, check, and team sync.');
  return true;
}

/**
 * Best-effort auto-install of guard + git hook after login.
 * Silent on failure — user can always install manually.
 */
function autoInstallHooks(): void {
  try {
    readState(); // throws if not initialized
    installGuard(resolveAgent());
  } catch { /* not initialized or guard install failed */ }
  try { installGitHook(); } catch { /* no git repo or hook install failed */ }
}

export const loginCommand = new Command('login')
  .description('Authenticate with vibeteamz via Supabase')
  .option('--github', 'Authenticate via GitHub in your browser (recommended)')
  .option('--email <email>', 'Your email address (for email/password login)')
  .option('--password <password>', 'Your password (for email/password login)')
  .option('--supabase-url <url>', 'Supabase project URL (HTTPS)')
  .option('--supabase-key <key>', 'Supabase anon key')
  .option('--api-url <url>', 'vibeteamz API URL (HTTPS)')
  .action(async (opts) => {
    let config = readCloudConfig();

    // Apply optional URL overrides
    if (opts.supabaseUrl) {
      const url = String(opts.supabaseUrl).replace(/\/+$/, '');
      if (!isValidHttpsUrl(url)) {
        error('--supabase-url must be a valid HTTPS URL.');
        return;
      }
      config.supabaseUrl = url;
    }

    if (opts.supabaseKey) {
      const key = String(opts.supabaseKey);
      if (key.length > MAX_KEY_LENGTH || !/^[A-Za-z0-9_.\-]+$/.test(key)) {
        error('Invalid Supabase anon key format.');
        return;
      }
      config.supabaseAnonKey = key;
    }

    if (opts.apiUrl) {
      const url = String(opts.apiUrl).replace(/\/+$/, '');
      if (!isValidHttpsUrl(url)) {
        error('--api-url must be a valid HTTPS URL.');
        return;
      }
      config.apiUrl = url;
    }

    // GitHub device flow
    if (opts.github) {
      await githubDeviceFlow(config);
      return;
    }

    // Email/password flow
    if (opts.email && opts.password) {
      const email = String(opts.email).trim();
      const password = String(opts.password);

      if (email.length > MAX_CREDENTIAL_LENGTH || password.length > MAX_CREDENTIAL_LENGTH) {
        error('Credentials exceed maximum allowed length.');
        return;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        error('Invalid email format.');
        return;
      }

      await emailPasswordFlow(config, email, password);
      return;
    }

    // No valid auth method specified
    error('Specify an auth method:');
    info('  vf cloud login --github                    (recommended)');
    info('  vf cloud login --email you@email --password xxx');
  });
