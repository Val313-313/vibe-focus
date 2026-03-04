import type { VibeFocusState } from '../types/index.js';

export interface ScoreFactors {
  tasksCompleted: number;
  tasksSwitchedAway: number;
  pushbackOverrides: number;
  tasksAbandoned: number;
}

export function calculateDailyScore(state: VibeFocusState): number {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEvents = state.focusEvents.filter(
    (e) => new Date(e.timestamp) >= todayStart
  );

  const factors: ScoreFactors = {
    tasksCompleted: todayEvents.filter((e) => e.type === 'complete').length,
    tasksSwitchedAway: todayEvents.filter((e) => e.type === 'switch_away').length,
    pushbackOverrides: todayEvents.filter((e) => e.type === 'pushback_override').length,
    tasksAbandoned: todayEvents.filter((e) => e.type === 'abandon').length,
  };

  let score = 50;
  score += factors.tasksCompleted * 20;
  score -= factors.tasksSwitchedAway * 10;
  score -= factors.pushbackOverrides * 5;
  score -= factors.tasksAbandoned * 15;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function scoreLabel(score: number): string {
  if (score >= 90) return 'Deep Focus';
  if (score >= 70) return 'Good Focus';
  if (score >= 50) return 'Moderate';
  return 'Context Collapse';
}
