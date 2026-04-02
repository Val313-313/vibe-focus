import { Command } from 'commander';
import chalk from 'chalk';
import { readCloudConfig, isValidUUID } from '../core/cloud-state.js';
import { error, success, info } from '../../ui/output.js';

const g = chalk.green;
const gB = chalk.greenBright;
const d = chalk.dim;

type TaskRow = {
  id: string;
  title: string;
  status: 'todo' | 'in_progress' | 'done';
  milestone_id: string | null;
  assigned_to: string | null;
  assignee: { username: string; display_name: string | null } | null;
};

type MilestoneRow = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
};

function statusIcon(status: string): string {
  switch (status) {
    case 'todo': return chalk.white('\u25cb');
    case 'in_progress': return chalk.cyan('\u25d0');
    case 'done': return gB('\u25cf');
    default: return d('\u00b7');
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'todo': return chalk.white('todo');
    case 'in_progress': return chalk.cyan('active');
    case 'done': return gB('done');
    default: return d(status);
  }
}

function getAuthToken(config: { apiKey: string | null; accessToken: string | null }): string | null {
  return config.apiKey ?? config.accessToken;
}

/** Helper to make authenticated API calls */
async function apiFetch(config: { apiUrl: string; apiKey: string | null; accessToken: string | null }, path: string, opts?: RequestInit): Promise<Response> {
  const token = getAuthToken(config);
  return fetch(`${config.apiUrl}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(opts?.headers ?? {}),
    },
    signal: AbortSignal.timeout(10_000),
  });
}

// ── vf vibeteamz tasks ──────────────────────────────────────────────────

export const tasksCommand = new Command('tasks')
  .description('List project tasks')
  .option('--mine', 'Only show tasks assigned to you')
  .option('--all', 'Include completed tasks')
  .action(async (opts: { mine?: boolean; all?: boolean }) => {
    let config;
    try {
      config = readCloudConfig();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      error(`Cloud config error: ${msg}`);
      return;
    }

    if (!(config.accessToken || config.apiKey) || !config.userId || !config.projectId) {
      error('Cloud not configured. Run "vf vibeteamz login" then "vf vibeteamz link <id>".');
      return;
    }

    if (!isValidUUID(config.projectId)) {
      error('Invalid project ID in cloud config.');
      return;
    }

    try {
      // Fetch tasks and milestones in parallel
      const [tasksRes, msRes] = await Promise.all([
        apiFetch(config, `/api/projects/${config.projectId}/tasks`),
        apiFetch(config, `/api/projects/${config.projectId}/milestones`),
      ]);

      if (!tasksRes.ok) {
        const data = await tasksRes.json().catch(() => ({}));
        error(`Failed to fetch tasks: ${(data as any).error ?? `HTTP ${tasksRes.status}`}`);
        return;
      }

      const tasks = (await tasksRes.json()) as TaskRow[];
      let milestones: MilestoneRow[] = [];
      if (msRes.ok) {
        const msBody = await msRes.json();
        milestones = Array.isArray(msBody) ? msBody : (msBody.milestones ?? []);
      }

      // Build milestone lookup
      const msMap = new Map<string, MilestoneRow>();
      for (const ms of milestones) msMap.set(ms.id, ms);

      // Filter
      let filtered = tasks;
      if (opts.mine) {
        filtered = filtered.filter(t => t.assigned_to === config.userId);
      }
      if (!opts.all) {
        filtered = filtered.filter(t => t.status !== 'done');
      }

      console.log('');
      if (filtered.length === 0) {
        console.log(d('  No tasks found.'));
        if (opts.mine) info('Try without --mine to see all project tasks.');
        console.log('');
        return;
      }

      // Group by milestone
      const byMilestone = new Map<string | null, TaskRow[]>();
      for (const t of filtered) {
        const key = t.milestone_id;
        if (!byMilestone.has(key)) byMilestone.set(key, []);
        byMilestone.get(key)!.push(t);
      }

      // Print milestoned tasks first, then backlog
      const msKeys = [...byMilestone.keys()].sort((a, b) => {
        if (a === null) return 1;
        if (b === null) return -1;
        return 0;
      });

      for (const msId of msKeys) {
        const msTitle = msId ? (msMap.get(msId)?.title ?? msId.slice(0, 8)) : 'Backlog';
        const groupTasks = byMilestone.get(msId)!;
        const done = groupTasks.filter(t => t.status === 'done').length;
        const total = groupTasks.length;

        console.log(chalk.bold(`  ${msTitle}`) + d(` (${done}/${total})`));

        for (const t of groupTasks) {
          const icon = statusIcon(t.status);
          const label = statusLabel(t.status).padEnd(16);
          const title = t.title.slice(0, 40).padEnd(42);
          const assignee = t.assignee?.username
            ? d(`@${t.assignee.username}`)
            : (t.assigned_to === config.userId ? d('@you') : d('unassigned'));
          const idStr = d(t.id.slice(0, 8));
          console.log(`    ${icon} ${label}${title}${assignee}  ${idStr}`);
        }
        console.log('');
      }

      const todoCount = filtered.filter(t => t.status === 'todo').length;
      const activeCount = filtered.filter(t => t.status === 'in_progress').length;
      const doneCount = filtered.filter(t => t.status === 'done').length;
      const parts: string[] = [];
      if (todoCount > 0) parts.push(`${todoCount} todo`);
      if (activeCount > 0) parts.push(`${activeCount} ${chalk.cyan('active')}`);
      if (doneCount > 0) parts.push(`${doneCount} ${g('done')}`);
      console.log(`  ${parts.join(', ')}`);
      console.log('');
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'TimeoutError') {
        error('Request timed out. Check your network.');
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        error(`Failed to connect to vibeteamz: ${msg}`);
      }
    }
  });

// ── vf vibeteamz task (subcommands) ─────────────────────────────────────

export const taskCommand = new Command('task')
  .description('Manage a specific task (claim, start, done, create)');

// vf vibeteamz task claim <id>
taskCommand
  .command('claim <id>')
  .description('Assign a task to yourself')
  .action(async (taskId: string) => {
    let config;
    try {
      config = readCloudConfig();
    } catch {
      error('Cloud config is corrupted.');
      return;
    }

    if (!(config.accessToken || config.apiKey) || !config.userId || !config.projectId) {
      error('Cloud not configured.');
      return;
    }

    try {
      const res = await apiFetch(config, `/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ assigned_to: config.userId }),
      });

      if (res.ok) {
        const data = await res.json();
        success(`Claimed: "${data.title}"`);
      } else {
        const data = await res.json().catch(() => ({}));
        error(`Failed to claim task: ${(data as any).error ?? `HTTP ${res.status}`}`);
      }
    } catch {
      error('Failed to connect to vibeteamz.');
    }
  });

// vf vibeteamz task start <id>
taskCommand
  .command('start <id>')
  .description('Start a task (set to in_progress and claim)')
  .action(async (taskId: string) => {
    let config;
    try {
      config = readCloudConfig();
    } catch {
      error('Cloud config is corrupted.');
      return;
    }

    if (!(config.accessToken || config.apiKey) || !config.userId || !config.projectId) {
      error('Cloud not configured.');
      return;
    }

    try {
      const res = await apiFetch(config, `/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'in_progress', assigned_to: config.userId }),
      });

      if (res.ok) {
        const data = await res.json();
        success(`Started: "${data.title}"`);
      } else {
        const data = await res.json().catch(() => ({}));
        error(`Failed to start task: ${(data as any).error ?? `HTTP ${res.status}`}`);
      }
    } catch {
      error('Failed to connect to vibeteamz.');
    }
  });

// vf vibeteamz task done <id>
taskCommand
  .command('done <id>')
  .description('Complete a task (set to done)')
  .action(async (taskId: string) => {
    let config;
    try {
      config = readCloudConfig();
    } catch {
      error('Cloud config is corrupted.');
      return;
    }

    if (!(config.accessToken || config.apiKey) || !config.userId || !config.projectId) {
      error('Cloud not configured.');
      return;
    }

    try {
      const res = await apiFetch(config, `/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'done' }),
      });

      if (res.ok) {
        const data = await res.json();
        success(`Completed: "${data.title}"`);
      } else {
        const data = await res.json().catch(() => ({}));
        error(`Failed to complete task: ${(data as any).error ?? `HTTP ${res.status}`}`);
      }
    } catch {
      error('Failed to connect to vibeteamz.');
    }
  });

// vf vibeteamz task create <title>
taskCommand
  .command('create <title>')
  .description('Create a new task')
  .option('--milestone <id>', 'Assign to a milestone')
  .option('--assign <user-id>', 'Assign to a user (UUID)')
  .action(async (title: string, opts: { milestone?: string; assign?: string }) => {
    let config;
    try {
      config = readCloudConfig();
    } catch {
      error('Cloud config is corrupted.');
      return;
    }

    if (!(config.accessToken || config.apiKey) || !config.userId || !config.projectId) {
      error('Cloud not configured.');
      return;
    }

    try {
      const res = await apiFetch(config, `/api/projects/${config.projectId}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          title,
          milestone_id: opts.milestone || null,
          assigned_to: opts.assign || null,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        success(`Task created: "${data.title}" (${data.id.slice(0, 8)})`);
      } else {
        const data = await res.json().catch(() => ({}));
        error(`Failed to create task: ${(data as any).error ?? `HTTP ${res.status}`}`);
      }
    } catch {
      error('Failed to connect to vibeteamz.');
    }
  });
