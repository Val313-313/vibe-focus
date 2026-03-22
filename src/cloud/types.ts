/**
 * Cloud integration types for vibeteamz connectivity.
 *
 * Security: No secrets are ever logged, exposed in error messages,
 * or included in heartbeat payloads. Tokens are stored locally only.
 */

/** Persisted cloud configuration in .vibe-focus/cloud.json */
export interface CloudConfig {
  version: 1;
  /** Base URL of the vibeteamz API (no trailing slash) */
  apiUrl: string;
  /** Supabase project URL */
  supabaseUrl: string | null;
  /** Supabase anon key (public, safe to store) */
  supabaseAnonKey: string | null;
  /** Supabase access token (JWT, sensitive — local only) */
  accessToken: string | null;
  /** Supabase refresh token (sensitive — local only) */
  refreshToken: string | null;
  /** Authenticated user ID (UUID) */
  userId: string | null;
  /** Linked vibeteamz project ID (UUID) */
  projectId: string | null;
  /** ISO timestamp of when project was linked */
  linkedAt: string | null;
}

/** Heartbeat payload sent to POST /api/heartbeat */
export interface HeartbeatPayload {
  user_id: string;
  project_id: string;
  task_id: string | null;
  task_title: string | null;
  progress_met: number;
  progress_total: number;
  active_files: string[];
  focus_score: number;
  status: 'active' | 'idle';
}

/** Response from the heartbeat API */
export interface HeartbeatResult {
  ok: boolean;
  error?: string;
}

/** Supabase auth response shape (subset we use) */
export interface SupabaseAuthResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email?: string;
  };
}

/** Result of a cloud operation */
export type CloudResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

// --- PostgREST row types (matching Supabase tables) ---

/** Presence table row */
export interface CloudPresenceRow {
  user_id: string;
  task_id: string | null;
  task_title: string | null;
  progress_met: number;
  progress_total: number;
  focus_score: number;
  status: 'active' | 'idle';
  last_heartbeat: string;
  profiles?: { username: string; display_name: string | null };
}

/** Members + profiles join row */
export interface CloudMemberRow {
  user_id: string;
  role: string;
  joined_at: string;
  profiles: {
    username: string;
    display_name: string | null;
    availability: string | null;
    score: number;
    streak_days: number;
  };
}

/** Activity + profiles join row */
export interface CloudActivityRow {
  id: string;
  type: string;
  message: string | null;
  created_at: string;
  profiles: { username: string };
}

/** Sessions table row */
export interface CloudSessionRow {
  id: string;
  started_by: string;
  started_at: string;
  ended_at: string | null;
  participants: string[];
}

// --- Push types ---

/** Activity payload for POST to activity table */
export interface ActivityPayload {
  project_id: string;
  user_id: string;
  type: string;
  message: string | null;
}

/** Result of a PostgREST query */
export type SupabaseQueryResult<T> =
  | { success: true; data: T[] }
  | { success: false; error: string };
