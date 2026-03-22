import { Command } from 'commander';
import { readCloudConfig, writeCloudConfig, isValidHttpsUrl } from '../core/cloud-state.js';
import { success, error, info } from '../../ui/output.js';
import type { SupabaseAuthResponse } from '../types.js';

/** Login timeout in milliseconds */
const LOGIN_TIMEOUT_MS = 10_000;

/** Maximum allowed credential length (prevent abuse) */
const MAX_CREDENTIAL_LENGTH = 256;

/** Maximum allowed key length (Supabase JWTs are long) */
const MAX_KEY_LENGTH = 2048;

export const loginCommand = new Command('login')
  .description('Authenticate with vibeteamz via Supabase')
  .requiredOption('--email <email>', 'Your email address')
  .requiredOption('--password <password>', 'Your password')
  .option('--supabase-url <url>', 'Supabase project URL (HTTPS)')
  .option('--supabase-key <key>', 'Supabase anon key')
  .option('--api-url <url>', 'vibeteamz API URL (HTTPS)')
  .action(async (opts) => {
    // Input validation
    const email = String(opts.email).trim();
    const password = String(opts.password);

    if (email.length > MAX_CREDENTIAL_LENGTH || password.length > MAX_CREDENTIAL_LENGTH) {
      error('Credentials exceed maximum allowed length.');
      return;
    }

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      error('Invalid email format.');
      return;
    }

    let config = readCloudConfig();

    // Apply optional overrides with validation
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

    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      error('Supabase URL and anon key are required.');
      info('Provide them with --supabase-url and --supabase-key on first login.');
      return;
    }

    // Authenticate via Supabase REST API
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
        // Do not leak server error details
        error(`Authentication failed (HTTP ${response.status}). Check your credentials.`);
        return;
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        error('Unexpected response from auth server.');
        return;
      }

      const data = await response.json() as Record<string, unknown>;

      // Validate response shape
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

      // Store credentials securely
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
  });
