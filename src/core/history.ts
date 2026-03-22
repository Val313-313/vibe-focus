import type { VibeFocusState, FocusEvent } from '../types/index.js';
import { computeScoreFromFactors } from './scoring.js';

export interface DailyStats {
  date: string;           // "2026-03-21"
  score: number;          // 0-100
  tasksCompleted: number;
  tasksSwitched: number;
  tasksAbandoned: number;
  overrides: number;
  tasksStarted: number;
  eventCount: number;
}

function dateKey(timestamp: string): string {
  return timestamp.slice(0, 10); // "2026-03-21T14:00:00.000Z" → "2026-03-21"
}

export function getDailyHistory(state: VibeFocusState, maxDays: number = 14): DailyStats[] {
  if (state.focusEvents.length === 0) return [];

  // Group events by date
  const grouped = new Map<string, FocusEvent[]>();
  for (const event of state.focusEvents) {
    const key = dateKey(event.timestamp);
    const list = grouped.get(key) ?? [];
    list.push(event);
    grouped.set(key, list);
  }

  // Build stats per day
  const days: DailyStats[] = [];
  for (const [date, events] of grouped) {
    const stats = {
      tasksCompleted: events.filter(e => e.type === 'complete').length,
      tasksSwitched: events.filter(e => e.type === 'switch_away').length,
      tasksAbandoned: events.filter(e => e.type === 'abandon').length,
      overrides: events.filter(e => e.type === 'pushback_override').length,
      tasksStarted: events.filter(e => e.type === 'start').length,
    };

    days.push({
      date,
      score: computeScoreFromFactors({
        tasksCompleted: stats.tasksCompleted,
        tasksSwitchedAway: stats.tasksSwitched,
        pushbackOverrides: stats.overrides,
        tasksAbandoned: stats.tasksAbandoned,
      }),
      ...stats,
      eventCount: events.length,
    });
  }

  // Sort by date ascending, return last N
  days.sort((a, b) => a.date.localeCompare(b.date));
  return days.slice(-maxDays);
}

export function getStreak(history: DailyStats[]): number {
  let streak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].score >= 50) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

export function getAverageScore(history: DailyStats[]): number {
  if (history.length === 0) return 0;
  const sum = history.reduce((acc, d) => acc + d.score, 0);
  return Math.round(sum / history.length);
}
