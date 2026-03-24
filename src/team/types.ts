export interface WorkerPresence {
  version: 1;
  username: string;
  machine: string;
  taskId: string | null;
  taskTitle: string | null;
  taskStatus: 'active' | 'idle';
  progress: {
    met: number;
    total: number;
    percent: number;
  };
  activeFiles: string[];
  activeDirectories: string[];
  flowMode: string | null;
  lastHeartbeat: string;
  sessionStarted: string | null;
  worker: string | null;
}

export interface TeamConfig {
  version: 1;
  teamName: string;
  settings: {
    staleThresholdMinutes: number;
    offlineThresholdMinutes: number;
    syncIntervalSeconds: number;
    discordWebhookUrl?: string;
  };
}

export interface LocalConfig {
  username: string;
  machine: string;
  autoSync: boolean;
}

export type StalenessLevel = 'active' | 'idle' | 'away' | 'offline';

export interface CoworkerContext {
  presence: WorkerPresence;
  staleness: StalenessLevel;
  heartbeatAge: number; // minutes
}

export interface ConflictWarning {
  type: 'file_collision' | 'directory_overlap';
  files: string[];
  coworkers: string[];
}
