import type { VibeFocusState, WorkerMeta, FocusEvent } from '../types/index.js';
import { now } from '../utils/time.js';

export interface StateChange {
  type: FocusEvent['type'];
  worker: string;
  taskId: string;
  description: string;
  timestamp: string;
}

/**
 * Detect events from OTHER workers since this worker's lastSeenEventIndex.
 */
export function detectChanges(state: VibeFocusState, currentWorker: string): StateChange[] {
  const meta = state.workerMeta[currentWorker];
  const lastSeen = meta?.lastSeenEventIndex ?? 0;
  const changes: StateChange[] = [];

  for (let i = lastSeen; i < state.focusEvents.length; i++) {
    const event = state.focusEvents[i];
    // Skip events from our own worker (or events with no worker tag)
    if (event.worker && event.worker !== currentWorker) {
      changes.push({
        type: event.type,
        worker: event.worker,
        taskId: event.taskId,
        description: describeEvent(event),
        timestamp: event.timestamp,
      });
    }
  }

  return changes;
}

function describeEvent(event: FocusEvent): string {
  switch (event.type) {
    case 'start':
      return `started ${event.taskId}`;
    case 'complete':
      return `completed ${event.taskId}`;
    case 'abandon':
      return `abandoned ${event.taskId}`;
    case 'switch_away':
      return `switched away from ${event.taskId}`;
    case 'switch_to':
      return `switched to ${event.taskId}`;
    case 'pushback_override':
      return `overrode guardian on ${event.taskId}`;
    case 'message':
      return event.details ?? '(empty message)';
    default:
      return `${event.type} ${event.taskId}`;
  }
}

/**
 * Format changes into a human-readable banner string.
 */
export function formatChangeBanner(changes: StateChange[]): string {
  if (changes.length === 0) return '';

  const lines: string[] = [];
  const shown = changes.slice(-5);

  for (const c of shown) {
    const icon = eventIcon(c.type);
    lines.push(`  ${icon} ${c.worker}: ${c.description}`);
  }

  if (changes.length > 5) {
    lines.push(`  ... and ${changes.length - 5} more`);
  }

  return lines.join('\n');
}

function eventIcon(type: FocusEvent['type']): string {
  switch (type) {
    case 'start': return '▶';
    case 'complete': return '✓';
    case 'abandon': return '✗';
    case 'switch_away': return '◀';
    case 'switch_to': return '▶';
    case 'pushback_override': return '!';
    case 'message': return '💬';
    default: return '·';
  }
}

/**
 * Stamp this worker's meta to mark current focusEvents.length as seen.
 * Returns a new workerMeta record (immutable).
 */
export function stampWorkerMeta(
  state: VibeFocusState,
  worker: string,
): Record<string, WorkerMeta> {
  return {
    ...state.workerMeta,
    [worker]: {
      lastSeenEventIndex: state.focusEvents.length,
      lastCommandAt: now(),
    },
  };
}
