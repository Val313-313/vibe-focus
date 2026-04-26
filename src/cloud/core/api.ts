import { readCloudConfig } from './cloud-state.js';
import { refreshAccessToken } from './token-refresh.js';
import type {
  CloudConfig,
  CloudResult,
  ActivityPayload,
  SupabaseQueryResult,
} from '../types.js';

/** Query timeout in milliseconds */
const QUERY_TIMEOUT_MS = 8_000;

/** Insert timeout in milliseconds */
const INSERT_TIMEOUT_MS = 5_000;

/** Maximum response size for pull queries (512KB) */
const MAX_RESPONSE_BYTES = 512_000;

/** Maximum insert payload size (64KB) */
const MAX_PAYLOAD_BYTES = 64_000;

/**
 * Get required cloud config fields for Supabase PostgREST access.
 * If the access token is missing but a refresh token exists, attempts
 * to refresh before giving up.
 */
async function getSupabaseConfig(): Promise<Pick<CloudConfig, 'supabaseUrl' | 'supabaseAnonKey' | 'accessToken' | 'userId' | 'projectId'> | null> {
  let config: CloudConfig;
  try {
    config = readCloudConfig();
  } catch {
    return null;
  }

  if (!config.supabaseUrl || !config.supabaseAnonKey || !config.userId || !config.projectId) {
    return null;
  }

  // If access token is missing but refresh token exists, try to refresh
  if (!config.accessToken && config.refreshToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      config = readCloudConfig();
    }
  }

  if (!config.accessToken) {
    return null;
  }

  return {
    supabaseUrl: config.supabaseUrl,
    supabaseAnonKey: config.supabaseAnonKey,
    accessToken: config.accessToken,
    userId: config.userId,
    projectId: config.projectId,
  };
}

/**
 * Query Supabase PostgREST.
 *
 * Security:
 * - HTTPS only (enforced by cloud-state URL validation)
 * - Bearer token + apikey auth
 * - Strict timeout via AbortSignal
 * - Response size validation
 * - Content-type validation
 */
export async function supabaseQuery<T>(
  table: string,
  params: string,
  options: { timeout?: number } = {},
): Promise<SupabaseQueryResult<T>> {
  const cfg = await getSupabaseConfig();
  if (!cfg) {
    return { success: false, error: 'Cloud not configured.' };
  }

  const url = `${cfg.supabaseUrl}/rest/v1/${table}?${params}`;
  const timeout = options.timeout ?? QUERY_TIMEOUT_MS;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': cfg.supabaseAnonKey!,
        'Authorization': `Bearer ${cfg.accessToken!}`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(timeout),
    });
  } catch {
    return { success: false, error: 'Request failed.' };
  }

  // On 401, try refreshing the JWT and retry once
  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const freshConfig = readCloudConfig();
      if (freshConfig.accessToken) {
        try {
          response = await fetch(url, {
            method: 'GET',
            headers: {
              'apikey': cfg.supabaseAnonKey!,
              'Authorization': `Bearer ${freshConfig.accessToken}`,
              'Accept': 'application/json',
            },
            signal: AbortSignal.timeout(timeout),
          });
        } catch {
          return { success: false, error: 'Request failed after token refresh.' };
        }
      }
    }
  }

  if (!response.ok) {
    return { success: false, error: `HTTP ${response.status}` };
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return { success: false, error: 'Unexpected response format.' };
  }

  // Validate response size via content-length if available
  const contentLength = response.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_BYTES) {
    return { success: false, error: 'Response too large.' };
  }

  let body: unknown;
  try {
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      return { success: false, error: 'Response too large.' };
    }
    body = JSON.parse(text);
  } catch {
    return { success: false, error: 'Malformed response.' };
  }

  if (!Array.isArray(body)) {
    return { success: false, error: 'Expected array response.' };
  }

  return { success: true, data: body as T[] };
}

/**
 * Insert a row into a Supabase table via PostgREST.
 *
 * Security:
 * - Same auth and HTTPS guarantees as supabaseQuery
 * - Payload size limit enforced
 */
export async function supabaseInsert<T>(
  table: string,
  payload: Record<string, unknown>,
): Promise<CloudResult<T>> {
  const cfg = await getSupabaseConfig();
  if (!cfg) {
    return { success: false, error: 'Cloud not configured.' };
  }

  const url = `${cfg.supabaseUrl}/rest/v1/${table}`;
  const body = JSON.stringify(payload);

  if (Buffer.byteLength(body, 'utf-8') > MAX_PAYLOAD_BYTES) {
    return { success: false, error: 'Payload too large.' };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': cfg.supabaseAnonKey!,
        'Authorization': `Bearer ${cfg.accessToken!}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body,
      signal: AbortSignal.timeout(INSERT_TIMEOUT_MS),
    });
  } catch {
    return { success: false, error: 'Request failed.' };
  }

  // On 401, try refreshing the JWT and retry once
  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const freshConfig = readCloudConfig();
      if (freshConfig.accessToken) {
        try {
          response = await fetch(url, {
            method: 'POST',
            headers: {
              'apikey': cfg.supabaseAnonKey!,
              'Authorization': `Bearer ${freshConfig.accessToken}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal',
            },
            body,
            signal: AbortSignal.timeout(INSERT_TIMEOUT_MS),
          });
        } catch {
          return { success: false, error: 'Request failed after token refresh.' };
        }
      }
    }
  }

  if (!response.ok) {
    return { success: false, error: `HTTP ${response.status}` };
  }

  return { success: true, data: undefined as unknown as T };
}

/**
 * Fire-and-forget activity push. Safe to call from any command.
 *
 * - Returns immediately (does not await)
 * - Swallows ALL errors silently
 * - Does nothing if cloud is not configured
 * - Never blocks the CLI
 */
export function fireCloudActivity(activity: Omit<ActivityPayload, 'project_id' | 'user_id'>): void {
  // Fire and forget — async operation wrapped to never block
  getSupabaseConfig().then(cfg => {
    if (!cfg) return;

    const payload: ActivityPayload = {
      project_id: cfg.projectId!,
      user_id: cfg.userId!,
      type: activity.type,
      message: activity.message,
    };

    return supabaseInsert('activity', payload as unknown as Record<string, unknown>);
  }).catch(() => {
    // Silently ignore
  });
}
