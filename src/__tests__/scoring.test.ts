import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateDailyScore, scoreLabel } from '../core/scoring.js';
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

function todayAt(hour: number): string {
  const d = new Date('2026-03-21T00:00:00.000Z');
  d.setHours(hour);
  return d.toISOString();
}

function yesterday(hour: number): string {
  const d = new Date('2026-03-20T00:00:00.000Z');
  d.setHours(hour);
  return d.toISOString();
}

describe('calculateDailyScore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-21T14:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns base score of 50 with no events', () => {
    const state = makeState([]);
    expect(calculateDailyScore(state)).toBe(50);
  });

  it('adds 20 points per completed task', () => {
    const state = makeState([
      { type: 'complete', taskId: 't1', timestamp: todayAt(10) },
    ]);
    expect(calculateDailyScore(state)).toBe(70);
  });

  it('adds points for multiple completions', () => {
    const state = makeState([
      { type: 'complete', taskId: 't1', timestamp: todayAt(10) },
      { type: 'complete', taskId: 't2', timestamp: todayAt(12) },
    ]);
    expect(calculateDailyScore(state)).toBe(90);
  });

  it('subtracts 10 per switch_away', () => {
    const state = makeState([
      { type: 'switch_away', taskId: 't1', timestamp: todayAt(10) },
    ]);
    expect(calculateDailyScore(state)).toBe(40);
  });

  it('subtracts 5 per pushback_override', () => {
    const state = makeState([
      { type: 'pushback_override', taskId: 't1', timestamp: todayAt(10) },
    ]);
    expect(calculateDailyScore(state)).toBe(45);
  });

  it('subtracts 15 per abandoned task', () => {
    const state = makeState([
      { type: 'abandon', taskId: 't1', timestamp: todayAt(10) },
    ]);
    expect(calculateDailyScore(state)).toBe(35);
  });

  it('combines all factors correctly', () => {
    const state = makeState([
      { type: 'complete', taskId: 't1', timestamp: todayAt(9) },    // +20
      { type: 'switch_away', taskId: 't2', timestamp: todayAt(10) }, // -10
      { type: 'pushback_override', taskId: 't3', timestamp: todayAt(11) }, // -5
      { type: 'abandon', taskId: 't4', timestamp: todayAt(12) },    // -15
    ]);
    // 50 + 20 - 10 - 5 - 15 = 40
    expect(calculateDailyScore(state)).toBe(40);
  });

  it('clamps score to minimum 0', () => {
    const state = makeState([
      { type: 'abandon', taskId: 't1', timestamp: todayAt(10) },
      { type: 'abandon', taskId: 't2', timestamp: todayAt(11) },
      { type: 'abandon', taskId: 't3', timestamp: todayAt(12) },
      { type: 'abandon', taskId: 't4', timestamp: todayAt(13) },
    ]);
    // 50 - 60 = -10 → clamped to 0
    expect(calculateDailyScore(state)).toBe(0);
  });

  it('clamps score to maximum 100', () => {
    const state = makeState([
      { type: 'complete', taskId: 't1', timestamp: todayAt(9) },
      { type: 'complete', taskId: 't2', timestamp: todayAt(10) },
      { type: 'complete', taskId: 't3', timestamp: todayAt(11) },
      { type: 'complete', taskId: 't4', timestamp: todayAt(12) },
    ]);
    // 50 + 80 = 130 → clamped to 100
    expect(calculateDailyScore(state)).toBe(100);
  });

  it('ignores events from yesterday', () => {
    const state = makeState([
      { type: 'complete', taskId: 't1', timestamp: yesterday(10) },
      { type: 'abandon', taskId: 't2', timestamp: yesterday(12) },
    ]);
    // Yesterday events don't count → base 50
    expect(calculateDailyScore(state)).toBe(50);
  });

  it('ignores start and switch_to events (only counts complete/switch_away/override/abandon)', () => {
    const state = makeState([
      { type: 'start', taskId: 't1', timestamp: todayAt(10) },
      { type: 'switch_to', taskId: 't2', timestamp: todayAt(11) },
    ]);
    expect(calculateDailyScore(state)).toBe(50);
  });
});

describe('scoreLabel', () => {
  it('returns "Deep Focus" for 90-100', () => {
    expect(scoreLabel(90)).toBe('Deep Focus');
    expect(scoreLabel(95)).toBe('Deep Focus');
    expect(scoreLabel(100)).toBe('Deep Focus');
  });

  it('returns "Good Focus" for 70-89', () => {
    expect(scoreLabel(70)).toBe('Good Focus');
    expect(scoreLabel(80)).toBe('Good Focus');
    expect(scoreLabel(89)).toBe('Good Focus');
  });

  it('returns "Moderate" for 50-69', () => {
    expect(scoreLabel(50)).toBe('Moderate');
    expect(scoreLabel(60)).toBe('Moderate');
    expect(scoreLabel(69)).toBe('Moderate');
  });

  it('returns "Context Collapse" for 0-49', () => {
    expect(scoreLabel(0)).toBe('Context Collapse');
    expect(scoreLabel(25)).toBe('Context Collapse');
    expect(scoreLabel(49)).toBe('Context Collapse');
  });
});
