import type { Task, VibeFocusState } from '../types/index.js';

export function generatePrompt(
  state: VibeFocusState,
  task: Task,
  style: 'concise' | 'detailed' | 'checklist' = 'detailed'
): string {
  if (style === 'concise') {
    return generateConcise(state, task);
  }
  if (style === 'checklist') {
    return generateChecklist(state, task);
  }
  return generateDetailed(state, task);
}

function generateConcise(state: VibeFocusState, task: Task): string {
  const lines: string[] = [];
  lines.push(`Task: ${task.title}`);
  if (task.description) lines.push(task.description);
  if (task.acceptanceCriteria.length > 0) {
    lines.push('');
    lines.push('Criteria:');
    for (const c of task.acceptanceCriteria) {
      lines.push(`- ${c.text}`);
    }
  }
  lines.push('');
  lines.push('Stay focused on this task only. Do not add unrelated changes.');
  return lines.join('\n');
}

function generateDetailed(state: VibeFocusState, task: Task): string {
  const lines: string[] = [];

  lines.push(`## Task: ${task.title}`);
  lines.push('');

  if (task.description) {
    lines.push(task.description);
    lines.push('');
  }

  // Project context
  if (state.projectScope) {
    lines.push(`### Project Context`);
    lines.push(`${state.projectScope.purpose}`);
    lines.push('');
  }

  if (task.acceptanceCriteria.length > 0) {
    lines.push('### Acceptance Criteria');
    for (const c of task.acceptanceCriteria) {
      lines.push(`- [ ] ${c.text}`);
    }
    lines.push('');
  }

  lines.push('### Scope');
  lines.push('ONLY work on the task described above.');
  lines.push('Do NOT refactor unrelated code.');
  lines.push('Do NOT add features not in the criteria.');
  lines.push('Do NOT start other tasks.');
  lines.push('');
  lines.push('If you encounter something that should be fixed');
  lines.push('but is outside this scope, note it as a TODO');
  lines.push('comment and move on.');

  if (state.projectScope?.outOfScope && state.projectScope.outOfScope.length > 0) {
    lines.push('');
    lines.push('Explicitly out of scope:');
    for (const item of state.projectScope.outOfScope) {
      lines.push(`- ${item}`);
    }
  }

  lines.push('');
  lines.push('### When done');
  lines.push('Confirm each acceptance criterion is met');
  lines.push('and explain how it was verified.');

  return lines.join('\n');
}

function generateChecklist(state: VibeFocusState, task: Task): string {
  const lines: string[] = [];
  lines.push(`# ${task.title}`);
  lines.push('');

  if (task.description) {
    lines.push(task.description);
    lines.push('');
  }

  lines.push('## Checklist');
  for (const c of task.acceptanceCriteria) {
    lines.push(`- [ ] ${c.text}`);
  }
  lines.push('- [ ] All criteria verified');
  lines.push('- [ ] No unrelated changes introduced');
  lines.push('- [ ] Code is within project scope');
  lines.push('');
  lines.push('## Rules');
  lines.push('- Work through the checklist top to bottom');
  lines.push('- Do not skip ahead or work on other things');
  lines.push('- Mark each item done as you complete it');

  return lines.join('\n');
}
