import type { Task, VibeFocusState, GuardianResponse } from '../types/index.js';
import { criteriaProgress } from './task.js';
import { elapsedMinutes } from '../utils/time.js';

function todaySwitchCount(state: VibeFocusState): number {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return state.focusEvents.filter(
    (e) =>
      e.type === 'switch_away' &&
      new Date(e.timestamp) >= todayStart
  ).length;
}

export function evaluateSwitch(
  state: VibeFocusState,
  currentTask: Task,
  _targetTaskId: string | null
): GuardianResponse {
  const { met, total } = criteriaProgress(currentTask);
  const completionPercent = total > 0 ? (met / total) * 100 : 0;
  const elapsed = currentTask.startedAt ? elapsedMinutes(currentTask.startedAt) : 0;
  const switches = todaySwitchCount(state);

  // Almost done - strong pushback
  if (total > 0 && completionPercent >= 66) {
    const remaining = total - met;
    return {
      allowed: false,
      severity: 'block',
      message: `Du bist ${Math.round(completionPercent)}% fertig mit "${currentTask.title}". Nur noch ${remaining} Kriterium${remaining > 1 ? 'en' : ''} offen!`,
      suggestion: 'Mach die restlichen Kriterien fertig. Du bist fast da.',
      overrideFlag: '--force',
    };
  }

  // Repeated switching pattern
  if (switches >= 3) {
    return {
      allowed: false,
      severity: 'block',
      message: `Du hast heute schon ${switches}x den Task gewechselt. Das ist genau das Context-Collapse-Pattern das vibe-focus verhindern soll.`,
      suggestion: 'Pick EINEN Task und mach ihn fertig. Nutze "vf note" um neue Ideen zu parken.',
      overrideFlag: '--yolo',
    };
  }

  // Significant time invested
  if (elapsed > 15) {
    return {
      allowed: false,
      severity: 'warn',
      message: `Du hast ${elapsed} Minuten in "${currentTask.title}" investiert. Wechseln heisst: Context weg.`,
      suggestion: 'Mach diesen Task erst fertig, oder nutze "vf abandon --reason ..." wenn du wirklich blockiert bist.',
      overrideFlag: '--force',
    };
  }

  // Default gentle pushback
  return {
    allowed: false,
    severity: 'warn',
    message: `Du hast einen aktiven Task: "${currentTask.title}".`,
    suggestion: 'Nutze "vf add" um neue Ideen zu queuen. Nutze "vf done" wenn fertig.',
    overrideFlag: '--force',
  };
}

export function evaluateAdd(currentTask: Task): GuardianResponse {
  return {
    allowed: true,
    severity: 'info',
    message: `Wird zum Backlog hinzugefügt. Bleib fokussiert auf: "${currentTask.title}"`,
    suggestion: '',
    overrideFlag: '',
  };
}

export function evaluateScopeAlignment(
  state: VibeFocusState,
  taskTitle: string
): GuardianResponse | null {
  if (!state.projectScope) return null;

  const outOfScope = state.projectScope.outOfScope.some((item) =>
    taskTitle.toLowerCase().includes(item.toLowerCase())
  );

  if (outOfScope) {
    return {
      allowed: false,
      severity: 'block',
      message: `"${taskTitle}" scheint ausserhalb des Projekt-Scopes zu liegen.`,
      suggestion: `Projekt-Purpose: ${state.projectScope.purpose}. Prüfe ob dieser Task wirklich hierher gehört.`,
      overrideFlag: '--force',
    };
  }

  return null;
}
