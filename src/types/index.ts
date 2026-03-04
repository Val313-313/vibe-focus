export type TaskStatus = 'backlog' | 'active' | 'done' | 'abandoned';

export interface AcceptanceCriterion {
  id: string;
  text: string;
  met: boolean;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  acceptanceCriteria: AcceptanceCriterion[];
  dependencies: string[];
  tags: string[];
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  abandonedAt: string | null;
  abandonReason: string | null;
  switchCount: number;
}

export interface ProjectScope {
  purpose: string;
  boundaries: string[];
  inScope: string[];
  outOfScope: string[];
}

export interface FocusEvent {
  type: 'start' | 'complete' | 'abandon' | 'switch_away' | 'switch_to' | 'pushback_override';
  taskId: string;
  timestamp: string;
  details?: string;
}

export interface FocusSession {
  taskId: string;
  startedAt: string;
  endedAt: string | null;
}

export interface VibeFocusState {
  version: 1;
  projectName: string;
  projectScope: ProjectScope | null;
  activeTaskId: string | null;
  nextTaskNumber: number;
  tasks: Task[];
  currentSession: FocusSession | null;
  focusEvents: FocusEvent[];
}

export interface GuardianResponse {
  allowed: boolean;
  severity: 'info' | 'warn' | 'block';
  message: string;
  suggestion: string;
  overrideFlag: string;
}
