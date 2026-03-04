import chalk from 'chalk';
import boxen from 'boxen';
import type { Task, GuardianResponse } from '../types/index.js';
import { criteriaProgress } from '../core/task.js';
import { elapsedMinutes, formatDuration } from '../utils/time.js';

export function success(msg: string): void {
  console.log(chalk.green('✓') + ' ' + msg);
}

export function info(msg: string): void {
  console.log(chalk.cyan('ℹ') + ' ' + msg);
}

export function warn(msg: string): void {
  console.log(chalk.yellow('⚠') + ' ' + msg);
}

export function error(msg: string): void {
  console.log(chalk.red('✗') + ' ' + msg);
}

export function printTask(task: Task): void {
  const { met, total } = criteriaProgress(task);
  const statusColor =
    task.status === 'active'
      ? chalk.green
      : task.status === 'done'
        ? chalk.gray
        : task.status === 'abandoned'
          ? chalk.red
          : chalk.yellow;

  console.log(`  ${statusColor(task.id)}  ${task.title}`);

  if (total > 0) {
    console.log(`       ${met}/${total} criteria met`);
  }

  if (task.status === 'active' && task.startedAt) {
    const elapsed = elapsedMinutes(task.startedAt);
    console.log(`       ${formatDuration(elapsed)} elapsed`);
  }
}

export function printFocusCard(task: Task): void {
  const { met, total } = criteriaProgress(task);
  let content = chalk.bold(`FOCUS: ${task.id} - ${task.title}`);

  if (task.description) {
    content += '\n' + chalk.gray(task.description);
  }

  if (total > 0) {
    content += '\n\n' + chalk.bold('Criteria:');
    for (const c of task.acceptanceCriteria) {
      const check = c.met ? chalk.green('[✓]') : chalk.gray('[ ]');
      content += `\n${check} ${c.text}`;
    }
    content += `\n\n${chalk.cyan(`Progress: ${met}/${total}`)}`;
  }

  console.log(
    boxen(content, {
      padding: 1,
      margin: { top: 1, bottom: 1, left: 0, right: 0 },
      borderColor: 'green',
      borderStyle: 'round',
    })
  );
}

export function printGuardian(response: GuardianResponse): void {
  const color =
    response.severity === 'block'
      ? 'red'
      : response.severity === 'warn'
        ? 'yellow'
        : 'cyan';

  const title =
    response.severity === 'block'
      ? 'FOCUS GUARDIAN - BLOCKED'
      : response.severity === 'warn'
        ? 'FOCUS GUARDIAN - WARNING'
        : 'FOCUS GUARDIAN';

  let content = chalk.bold(title) + '\n\n';
  content += response.message + '\n\n';

  if (response.suggestion) {
    content += chalk.dim(response.suggestion);
  }

  if (response.overrideFlag) {
    content += '\n\n' + chalk.dim(`Override: ${response.overrideFlag}`);
  }

  console.log(
    boxen(content, {
      padding: 1,
      margin: { top: 1, bottom: 1, left: 0, right: 0 },
      borderColor: color,
      borderStyle: 'round',
    })
  );
}

export function printProgressBar(percent: number, width: number = 20): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
}
