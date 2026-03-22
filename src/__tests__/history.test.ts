import { describe, it, expect } from 'vitest';
import { getDailyHistory, getStreak, getAverageScore } from '../core/history.js';
import type { VibeFocusState, FocusEvent } from '../types/index.js';

function makeState(events: FocusEvent[] = []): VibeFocusState {
  return {
    version: 1,
    projectName: 'test',
    projectScope: null,
    activeTaskId: null,
    activeWorkers: {},
    nextTaskNumber: 1,
    tasks: [],
    notes: [],
    nextNoteNumber: 1,
    currentSession: null,
    focusEvents: events,
    sessionContexts: [],
    nextContextNumber: 1,
  };
}

function eventAt(date: string, type: FocusEvent['type'], taskId = 't1'): FocusEvent {
  return { type, taskId, timestamp: `${date}T10:00:00.000Z` };
}

describe('getDailyHistory', () => {
  it('returns empty array when no events', () => {
    const state = makeState([]);
    expect(getDailyHistory(state)).toEqual([]);
  });

  it('groups events by date', () => {
    const state = makeState([
      eventAt('2026-03-19', 'start'),
      eventAt('2026-03-19', 'complete'),
      eventAt('2026-03-20', 'start', 't2'),
    ]);

    const history = getDailyHistory(state);

    expect(history).toHaveLength(2);
    expect(history[0].date).toBe('2026-03-19');
    expect(history[1].date).toBe('2026-03-20');
  });

  it('counts events correctly per day', () => {
    const state = makeState([
      eventAt('2026-03-21', 'start'),
      eventAt('2026-03-21', 'complete'),
      eventAt('2026-03-21', 'switch_away', 't2'),
      eventAt('2026-03-21', 'pushback_override', 't2'),
    ]);

    const history = getDailyHistory(state);

    expect(history).toHaveLength(1);
    const day = history[0];
    expect(day.tasksCompleted).toBe(1);
    expect(day.tasksSwitched).toBe(1);
    expect(day.overrides).toBe(1);
    expect(day.tasksStarted).toBe(1);
    expect(day.tasksAbandoned).toBe(0);
    expect(day.eventCount).toBe(4);
  });

  it('computes score correctly: base 50 + modifiers', () => {
    // 1 complete (+20), 1 switch (-10), 1 override (-5) = 50+20-10-5 = 55
    const state = makeState([
      eventAt('2026-03-21', 'complete'),
      eventAt('2026-03-21', 'switch_away', 't2'),
      eventAt('2026-03-21', 'pushback_override', 't2'),
    ]);

    const history = getDailyHistory(state);
    expect(history[0].score).toBe(55);
  });

  it('clamps score to 0-100', () => {
    // 4 abandons: 50 - 60 = -10 → clamped to 0
    const state = makeState([
      eventAt('2026-03-21', 'abandon', 't1'),
      eventAt('2026-03-21', 'abandon', 't2'),
      eventAt('2026-03-21', 'abandon', 't3'),
      eventAt('2026-03-21', 'abandon', 't4'),
    ]);
    expect(getDailyHistory(state)[0].score).toBe(0);

    // 4 completions: 50 + 80 = 130 → clamped to 100
    const state2 = makeState([
      eventAt('2026-03-21', 'complete', 't1'),
      eventAt('2026-03-21', 'complete', 't2'),
      eventAt('2026-03-21', 'complete', 't3'),
      eventAt('2026-03-21', 'complete', 't4'),
    ]);
    expect(getDailyHistory(state2)[0].score).toBe(100);
  });

  it('sorts by date ascending', () => {
    const state = makeState([
      eventAt('2026-03-21', 'start'),
      eventAt('2026-03-19', 'start'),
      eventAt('2026-03-20', 'start'),
    ]);

    const history = getDailyHistory(state);

    expect(history.map(h => h.date)).toEqual([
      '2026-03-19',
      '2026-03-20',
      '2026-03-21',
    ]);
  });

  it('respects maxDays limit', () => {
    const events: FocusEvent[] = [];
    for (let i = 1; i <= 20; i++) {
      const day = String(i).padStart(2, '0');
      events.push(eventAt(`2026-03-${day}`, 'start'));
    }
    const state = makeState(events);

    const history = getDailyHistory(state, 5);

    expect(history).toHaveLength(5);
    expect(history[0].date).toBe('2026-03-16');
    expect(history[4].date).toBe('2026-03-20');
  });

  it('counts abandon events', () => {
    const state = makeState([
      eventAt('2026-03-21', 'start'),
      eventAt('2026-03-21', 'abandon'),
    ]);

    const history = getDailyHistory(state);
    expect(history[0].tasksAbandoned).toBe(1);
    // 50 - 15 = 35
    expect(history[0].score).toBe(35);
  });
});

describe('getStreak', () => {
  it('returns 0 for empty history', () => {
    expect(getStreak([])).toBe(0);
  });

  it('counts consecutive days with score >= 50 from the end', () => {
    const history = [
      { date: '2026-03-19', score: 30 },
      { date: '2026-03-20', score: 70 },
      { date: '2026-03-21', score: 60 },
    ] as any;

    expect(getStreak(history)).toBe(2);
  });

  it('breaks streak at score < 50', () => {
    const history = [
      { date: '2026-03-19', score: 80 },
      { date: '2026-03-20', score: 40 },
      { date: '2026-03-21', score: 90 },
    ] as any;

    expect(getStreak(history)).toBe(1);
  });

  it('counts full history when all scores >= 50', () => {
    const history = [
      { date: '2026-03-19', score: 50 },
      { date: '2026-03-20', score: 70 },
      { date: '2026-03-21', score: 90 },
    ] as any;

    expect(getStreak(history)).toBe(3);
  });

  it('returns 0 when last day score < 50', () => {
    const history = [
      { date: '2026-03-19', score: 90 },
      { date: '2026-03-20', score: 80 },
      { date: '2026-03-21', score: 30 },
    ] as any;

    expect(getStreak(history)).toBe(0);
  });
});

describe('getAverageScore', () => {
  it('returns 0 for empty history', () => {
    expect(getAverageScore([])).toBe(0);
  });

  it('calculates average score rounded', () => {
    const history = [
      { score: 70 },
      { score: 80 },
      { score: 60 },
    ] as any;

    expect(getAverageScore(history)).toBe(70);
  });

  it('rounds correctly', () => {
    const history = [
      { score: 33 },
      { score: 33 },
      { score: 34 },
    ] as any;

    // (33+33+34)/3 = 33.33 → 33
    expect(getAverageScore(history)).toBe(33);
  });
});
