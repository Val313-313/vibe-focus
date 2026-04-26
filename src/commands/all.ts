import chalk from 'chalk';
import { Command } from 'commander';
import { readState } from '../core/state.js';
import { criteriaProgress } from '../core/task.js';
import { elapsedMinutes, formatDuration } from '../utils/time.js';
import { isCloudLinked, readCloudConfig } from '../cloud/core/cloud-state.js';

const g = chalk.green;
const gB = chalk.greenBright;
const gD = chalk.dim.green;
const c = chalk.cyan;
const cB = chalk.cyanBright;
const y = chalk.yellow;
const d = chalk.dim;
const b = chalk.bold;

function hLine(char: string, width: number): string {
  return char.repeat(width);
}

export const allCommand = new Command('all')
  .description('Show all tasks: local + vibeteamz')
  .action(async () => {
    const state = readState();
    const active = state.tasks.find(t => t.status === 'active');
    const backlog = state.tasks.filter(t => t.status === 'backlog');
    const doneCount = state.tasks.filter(t => t.status === 'done').length;
    const total = state.tasks.length;

    const lines: string[] = [];
    lines.push('');
    lines.push(gB('  LOCAL TASKS') + d(` (${doneCount}/${total} done)`));
    lines.push(d('  ' + hLine('─', 54)));

    // Active task
    if (active) {
      const elapsed = active.startedAt ? elapsedMinutes(active.startedAt) : 0;
      const { met, total: ct } = criteriaProgress(active);
      const pctStr = ct > 0 ? ` ${Math.round((met / ct) * 100)}%` : '';
      lines.push('  ' + gB('▶') + ' ' + cB(active.id.padEnd(6)) + b(active.title.slice(0, 40)) + d(` ${formatDuration(elapsed)}`) + g(pctStr));
    }

    // Backlog
    for (const t of backlog) {
      lines.push('  ' + y('○') + ' ' + y(t.id.padEnd(6)) + t.title.slice(0, 46));
    }

    if (!active && backlog.length === 0) {
      lines.push(d('  No active or backlog tasks.'));
    }

    // Vibeteamz tasks
    lines.push('');

    try {
      if (isCloudLinked()) {
        const cfg = readCloudConfig();
        const pid = cfg.projectId;
        const token = cfg.apiKey ?? cfg.accessToken;

        if (pid && token) {
          const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

          type TaskRow = { id: string; title: string; status: string; milestone_id: string | null; assigned_to: string | null };
          type MsRow = { id: string; title: string };

          const [tasksResp, msResp] = await Promise.all([
            fetch(`${cfg.apiUrl}/api/projects/${pid}/tasks`, { headers, signal: AbortSignal.timeout(8000) }),
            fetch(`${cfg.apiUrl}/api/projects/${pid}/milestones`, { headers, signal: AbortSignal.timeout(8000) }),
          ]);

          let tasks: TaskRow[] = [];
          let milestones: MsRow[] = [];
          if (tasksResp.ok) tasks = await tasksResp.json() as TaskRow[];
          if (msResp.ok) {
            const body = await msResp.json();
            milestones = Array.isArray(body) ? body : (body.milestones ?? []);
          }

          const tasksDone = tasks.filter(t => t.status === 'done').length;
          lines.push(gB('  VIBETEAMZ TASKS') + d(` (${tasksDone}/${tasks.length} done)`));
          lines.push(d('  ' + hLine('─', 54)));

          if (tasks.length > 0) {
            const msMap = new Map<string, MsRow>();
            for (const ms of milestones) msMap.set(ms.id, ms);

            const byMs = new Map<string | null, TaskRow[]>();
            for (const t of tasks) {
              const key = t.milestone_id;
              if (!byMs.has(key)) byMs.set(key, []);
              byMs.get(key)!.push(t);
            }

            const msKeys = [...byMs.keys()].sort((a, b) => {
              if (a === null) return 1;
              if (b === null) return -1;
              return 0;
            });

            for (const msId of msKeys) {
              const group = byMs.get(msId)!;
              const dn = group.filter(t => t.status === 'done').length;
              const tn = group.length;
              const pct = tn > 0 ? Math.round((dn / tn) * 100) : 0;
              const msTitle = msId ? (msMap.get(msId)?.title ?? msId.slice(0, 8)) : 'Backlog';
              const msIcon = msId ? y('◉') : d('≡');
              const barW = 10;
              const filled = tn > 0 ? Math.round((dn / tn) * barW) : 0;
              const bar = y('█'.repeat(filled)) + d('░'.repeat(barW - filled));

              lines.push('  ' + msIcon + ' ' + b(msTitle.padEnd(22)) + bar + ' ' + d(`${dn}/${tn}`) + ' ' + (pct > 0 ? y(`${pct}%`) : d('0%')));

              for (const t of group) {
                const icon = t.status === 'done' ? gB('✓') : t.status === 'in_progress' ? c('◐') : '○';
                const title = t.status === 'done' ? d(t.title.slice(0, 38)) : t.title.slice(0, 38);
                const owner = t.assigned_to === cfg.userId ? d(' @you') : '';
                lines.push('     ' + icon + ' ' + title + owner);
              }
            }
          } else {
            lines.push(d('  No vibeteamz tasks.'));
          }
        }
      } else {
        lines.push(d('  vibeteamz not linked. Run ') + c('vf setup'));
      }
    } catch {
      lines.push(d('  vibeteamz offline'));
    }

    lines.push('');
    console.log(lines.join('\n'));
  });
