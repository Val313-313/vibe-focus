import { readCloudConfig, writeCloudConfig } from './cloud-state.js';

/** Timeout for token refresh requests */
const REFRESH_TIMEOUT_MS = 10_000;

/**
 * Refresh the Supabase access token using the stored refresh token.
 * Calls the Supabase GoTrue REST API directly — no SDK needed.
 *
 * Returns true if tokens were refreshed and persisted, false otherwise.
 *
 * Security:
 * - HTTPS only (enforced by cloud-state URL validation)
 * - Refresh token is never logged or exposed in errors
 * - New tokens are written atomically to cloud.json (mode 600)
 */
export async function refreshAccessToken(): Promise<boolean> {
  let config;
  try {
    config = readCloudConfig();
  } catch {
    return false;
  }

  if (!config.supabaseUrl || !config.supabaseAnonKey || !config.refreshToken) {
    return false;
  }

  const url = `${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.supabaseAnonKey,
      },
      body: JSON.stringify({ refresh_token: config.refreshToken }),
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    });

    if (!response.ok) {
      return false;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return false;
    }

    const data = await response.json() as Record<string, unknown>;

    if (
      typeof data.access_token !== 'string' ||
      typeof data.refresh_token !== 'string'
    ) {
      return false;
    }

    // Persist new tokens
    config.accessToken = data.access_token as string;
    config.refreshToken = data.refresh_token as string;
    writeCloudConfig(config);

    return true;
  } catch {
    return false;
  }
}
