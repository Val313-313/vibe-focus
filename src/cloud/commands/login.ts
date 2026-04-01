import { Command } from 'commander';
import { exec } from 'node:child_process';
import { platform } from 'node:os';
import { readCloudConfig, writeCloudConfig, isValidHttpsUrl } from '../core/cloud-state.js';
import { success, error, info, warn } from '../../ui/output.js';
import type { SupabaseAuthResponse } from '../types.js';

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
async function githubDeviceFlow(config: ReturnType<typeof readCloudConfig>): Promise<void> {
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
      return;
    }

    const data = await response.json() as Record<string, unknown>;
    deviceCode = data.device_code as string;
    userCode = data.user_code as string;
    verificationUri = data.verification_uri as string;

    if (!deviceCode || !userCode || !verificationUri) {
      error('Malformed device code response.');
      return;
    }
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === 'TimeoutError') {
      error('Request timed out. Check your network.');
    } else {
      error('Failed to connect to vibeteamz. Check your network.');
    }
    return;
  }

  // Step 2: Display the code and open the browser
  console.log('');
  console.log(`  Enter this code in your browser:`);
  console.log('');
  console.log(`    >>> ${userCode} <<<`);
  console.log('');
  info(`Opening ${verificationUri} ...`);

  openBrowser(verificationUri);

  console.log('');
  info('Waiting for you to complete authentication in the browser...');
  info('(Press Ctrl+C to cancel)');
  console.log('');

  // Step 3: Poll for completion
  const tokenUrl = `${config.apiUrl}/api/auth/device/token`;
  const startTime = Date.now();

  while (Date.now() - startTime < DEVICE_MAX_WAIT_MS) {
    await sleep(DEVICE_POLL_INTERVAL_MS);

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
        continue;
      }

      if (response.status === 400) {
        const data = await response.json() as Record<string, unknown>;
        if (data.error === 'expired_token') {
          console.log('');
          error('Device code expired. Run the command again.');
          return;
        }
      }

      if (response.status === 404) {
        console.log('');
        error('Device code not found. Run the command again.');
        return;
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

          // Save Supabase credentials for token refresh
          if (typeof data.supabase_url === 'string' && data.supabase_url) {
            config.supabaseUrl = data.supabase_url as string;
          }
          if (typeof data.supabase_anon_key === 'string' && data.supabase_anon_key) {
            config.supabaseAnonKey = data.supabase_anon_key as string;
          }

          writeCloudConfig(config);

          success(`Logged in as ${data.user_id}`);
          info('Cloud config saved to .vibe-focus/cloud.json (mode 600).');

          if (!config.projectId) {
            info('Next: link a project with "vf cloud link <project-id>".');
          }
          return;
        }
      }
    } catch {
      // Network error during poll — retry silently
      process.stdout.write('x');
    }
  }

  console.log('');
  error('Timed out waiting for authentication. Run the command again.');
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
    info('Cloud config saved to .vibe-focus/cloud.json (mode 600).');

    if (!config.projectId) {
      info('Next: link a project with "vf cloud link <project-id>".');
    }
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === 'TimeoutError') {
      error('Login request timed out. Check your network and Supabase URL.');
    } else {
      error('Login failed. Check your network connection.');
    }
  }
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
