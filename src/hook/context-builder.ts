// Pure functions for building guard hook context — no I/O, fully testable

export interface TaskContext {
  id: string;
  title: string;
  metCount: number;
  totalCount: number;
  unmetCriteria: string[];
}

export interface WorkerContext {
  currentWorker: string | null;
  otherWorkers: string[]; // "name: task title"
}

export interface ScopeContext {
  outOfScope: string[];
}

export interface SessionMemoryContext {
  summary: string;
  savedAt: string;
  decisions?: string[];
  openQuestions?: string[];
  projectState?: string;
  techStack?: string[];
}

export interface TeamMemberContext {
  username: string;
  status: 'active' | 'idle' | 'away';
  taskInfo: string;
  progressInfo: string;
  activeFiles: string[];
}

export interface TeamContext {
  coworkers: TeamMemberContext[];
  myActiveFiles: string[];
}

export interface TeamMessageContext {
  username: string;
  body: string;
  time: string;
}

export interface GuardInput {
  task: TaskContext;
  worker: WorkerContext;
  scope: ScopeContext | null;
  noteCount: number;
  session: SessionMemoryContext | null;
  team: TeamContext | null;
  messages?: TeamMessageContext[];
}

export interface HookOutput {
  result: string;
  suppressPrompt: boolean;
}

export function buildNoTaskMessage(worker: string | null): HookOutput {
  const workerHint = worker ? ` (worker: ${worker})` : '';
  const workerFlag = worker ? ` --worker ${worker}` : '';
  const result = [
    `VIBE FOCUS: No active task${workerHint}. Before working, create and start a task:`,
    `  vf add "task" -c "criterion"`,
    `  vf start t1${workerFlag}`,
    `This keeps your session focused.`,
  ].join('\n');
  return { result, suppressPrompt: false };
}

function formatSessionAge(savedAt: string): string {
  const ageMs = Date.now() - new Date(savedAt).getTime();
  const ageHours = Math.floor(ageMs / 3600000);
  if (ageHours < 1) return 'just now';
  if (ageHours < 24) return `${ageHours}h ago`;
  return `${Math.floor(ageHours / 24)}d ago`;
}

function buildSessionBlock(session: SessionMemoryContext): string {
  const lines: string[] = [];
  lines.push(`\nPREVIOUS SESSION CONTEXT (saved ${formatSessionAge(session.savedAt)}):`);
  lines.push(session.summary);
  if (session.decisions?.length) {
    lines.push('\nKEY DECISIONS:');
    lines.push(...session.decisions.map(d => `  - ${d}`));
  }
  if (session.openQuestions?.length) {
    lines.push('\nOPEN QUESTIONS:');
    lines.push(...session.openQuestions.map(q => `  ? ${q}`));
  }
  if (session.projectState) {
    lines.push(`PROJECT STATE: ${session.projectState}`);
  }
  if (session.techStack?.length) {
    lines.push(`TECH STACK: ${session.techStack.join(', ')}`);
  }
  return lines.join('\n');
}

export function buildTeamBlock(team: TeamContext): string {
  if (team.coworkers.length === 0) return '';

  const lines: string[] = [];
  lines.push('\nTEAM CONTEXT:');
  for (const cw of team.coworkers) {
    lines.push(`  ${cw.username} [${cw.status}] \u2192 ${cw.taskInfo}${cw.progressInfo}`);
  }

  // Conflict detection
  const conflicts: string[] = [];
  for (const cw of team.coworkers) {
    const shared = team.myActiveFiles.filter(f => cw.activeFiles.includes(f));
    if (shared.length > 0) {
      conflicts.push(`  \u26a0 FILE CONFLICT with ${cw.username}: ${shared.join(', ')}`);
    }
  }
  if (conflicts.length > 0) {
    lines.push('\nCONFLICT WARNINGS:');
    lines.push(...conflicts);
    lines.push('  \u2192 Coordinate before modifying shared files!');
  }

  return lines.join('\n');
}

export function buildMessagesBlock(messages: TeamMessageContext[]): string {
  if (messages.length === 0) return '';

  const lines: string[] = [];
  lines.push('\nTEAM MESSAGES (recent):');
  for (const msg of messages) {
    lines.push(`  ${msg.username}: ${msg.body} (${msg.time})`);
  }
  return lines.join('\n');
}

export function buildGuardContext(input: GuardInput): HookOutput {
  const { task, worker, scope, noteCount, session, team, messages } = input;
  const workerFlag = worker.currentWorker ? ` --worker ${worker.currentWorker}` : '';

  const sections: string[] = [];

  // Header
  sections.push('VIBE FOCUS ACTIVE - STRICT MODE');
  if (worker.currentWorker) {
    sections.push(`WORKER: ${worker.currentWorker}`);
  }

  // Task info
  sections.push('');
  sections.push(`CURRENT TASK: ${task.id} - ${task.title}`);
  sections.push(`PROGRESS: ${task.metCount}/${task.totalCount} criteria met`);
  sections.push('');

  // Criteria
  if (task.unmetCriteria.length > 0) {
    sections.push('REMAINING CRITERIA:');
    sections.push(...task.unmetCriteria.map(c => `  - ${c}`));
  } else {
    sections.push(`ALL CRITERIA MET - run: vf done${workerFlag}`);
  }

  // Notes
  if (noteCount > 0) {
    sections.push(`PARKED NOTES: ${noteCount} ideas saved for later (vf note --list)`);
  }

  // Other local workers
  if (worker.otherWorkers.length > 0) {
    sections.push('\nOTHER ACTIVE WORKERS:');
    sections.push(...worker.otherWorkers.map(w => `  - ${w}`));
  }

  // Team context
  if (team) {
    const teamBlock = buildTeamBlock(team);
    if (teamBlock) sections.push(teamBlock);
  }

  // Team messages
  if (messages && messages.length > 0) {
    const msgBlock = buildMessagesBlock(messages);
    if (msgBlock) sections.push(msgBlock);
  }

  // Session memory
  if (session) {
    sections.push(buildSessionBlock(session));
  }

  // Enforcement rules
  sections.push('');
  sections.push('ENFORCEMENT: Before responding, verify the user\'s request relates to this task.');
  sections.push(`If it does NOT relate to "${task.title}":`);
  sections.push('  1. STOP immediately. Do NOT start working on the unrelated request.');
  sections.push('  2. Tell the user: "That\'s not part of the current task. Let me park it."');
  sections.push('  3. Run: vf note "<their idea summarized>"');
  sections.push(`  4. Then redirect: "Back to ${task.title} - here's what we still need to do:"`);
  sections.push('');
  sections.push(`IMPORTANT: Even if the user's question seems quick or related, if it's a DIFFERENT concern`);
  sections.push(`than "${task.title}", it MUST be parked as a note. No exceptions. No "quickly checking".`);
  sections.push('');
  sections.push('SAFETY: Even in flow/superflow mode, always review before destructive operations.');
  sections.push('Think twice before: deleting files, force-pushing, dropping data, overwriting config.');

  // Scope
  if (scope && scope.outOfScope.length > 0) {
    sections.push(`\nOUT OF SCOPE (refuse these): ${scope.outOfScope.join(', ')}`);
  }

  return { result: sections.join('\n'), suppressPrompt: false };
}
