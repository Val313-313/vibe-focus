import { describe, it, expect } from 'vitest';
import {
  buildGuardContext,
  buildNoTaskMessage,
  buildTeamBlock,
  type GuardInput,
  type TeamContext,
} from '../hook/context-builder.js';

function makeInput(overrides: Partial<GuardInput> = {}): GuardInput {
  return {
    task: {
      id: 't1',
      title: 'Build login page',
      metCount: 1,
      totalCount: 3,
      unmetCriteria: ['Add form validation', 'Handle errors'],
    },
    worker: { currentWorker: null, otherWorkers: [] },
    scope: null,
    noteCount: 0,
    session: null,
    team: null,
    ...overrides,
  };
}

describe('buildNoTaskMessage', () => {
  it('returns message without worker', () => {
    const output = buildNoTaskMessage(null);
    expect(output.result).toContain('No active task');
    expect(output.result).toContain('vf add "task"');
    expect(output.result).not.toContain('--worker');
    expect(output.suppressPrompt).toBe(false);
  });

  it('includes worker hint and flag', () => {
    const output = buildNoTaskMessage('tab-2');
    expect(output.result).toContain('(worker: tab-2)');
    expect(output.result).toContain('--worker tab-2');
  });
});

describe('buildGuardContext', () => {
  it('includes task info and criteria', () => {
    const output = buildGuardContext(makeInput());
    expect(output.result).toContain('VIBE FOCUS ACTIVE - STRICT MODE');
    expect(output.result).toContain('CURRENT TASK: t1 - Build login page');
    expect(output.result).toContain('PROGRESS: 1/3 criteria met');
    expect(output.result).toContain('REMAINING CRITERIA:');
    expect(output.result).toContain('  - Add form validation');
    expect(output.result).toContain('  - Handle errors');
  });

  it('shows all-done message when criteria met', () => {
    const output = buildGuardContext(makeInput({
      task: { id: 't1', title: 'Done task', metCount: 2, totalCount: 2, unmetCriteria: [] },
    }));
    expect(output.result).toContain('ALL CRITERIA MET - run: vf done');
    expect(output.result).not.toContain('REMAINING CRITERIA');
  });

  it('shows worker label', () => {
    const output = buildGuardContext(makeInput({
      worker: { currentWorker: 'tab-2', otherWorkers: [] },
    }));
    expect(output.result).toContain('WORKER: tab-2');
  });

  it('shows done with worker flag when all criteria met', () => {
    const output = buildGuardContext(makeInput({
      task: { id: 't1', title: 'Done', metCount: 1, totalCount: 1, unmetCriteria: [] },
      worker: { currentWorker: 'tab-2', otherWorkers: [] },
    }));
    expect(output.result).toContain('vf done --worker tab-2');
  });

  it('shows other local workers', () => {
    const output = buildGuardContext(makeInput({
      worker: { currentWorker: 'tab-1', otherWorkers: ['tab-2: Fix bug', 'tab-3: Write docs'] },
    }));
    expect(output.result).toContain('OTHER ACTIVE WORKERS:');
    expect(output.result).toContain('  - tab-2: Fix bug');
    expect(output.result).toContain('  - tab-3: Write docs');
  });

  it('shows parked notes count', () => {
    const output = buildGuardContext(makeInput({ noteCount: 5 }));
    expect(output.result).toContain('PARKED NOTES: 5 ideas saved for later');
  });

  it('omits notes section when count is 0', () => {
    const output = buildGuardContext(makeInput({ noteCount: 0 }));
    expect(output.result).not.toContain('PARKED NOTES');
  });

  it('shows scope warnings', () => {
    const output = buildGuardContext(makeInput({
      scope: { outOfScope: ['Web UI', 'Cloud Sync'] },
    }));
    expect(output.result).toContain('OUT OF SCOPE (refuse these): Web UI, Cloud Sync');
  });

  it('includes enforcement rules', () => {
    const output = buildGuardContext(makeInput());
    expect(output.result).toContain('ENFORCEMENT: Before responding');
    expect(output.result).toContain('STOP immediately');
    expect(output.result).toContain('vf note');
    expect(output.result).toContain('Build login page');
    expect(output.result).toContain('SAFETY:');
  });

  it('shows session context', () => {
    const output = buildGuardContext(makeInput({
      session: {
        summary: 'Implemented auth flow',
        savedAt: new Date(Date.now() - 3600000 * 2).toISOString(), // 2h ago
        decisions: ['Chose JWT', 'Using bcrypt'],
        openQuestions: ['Rate limiting?'],
        projectState: 'local dev',
        techStack: ['node', 'express'],
      },
    }));
    expect(output.result).toContain('PREVIOUS SESSION CONTEXT');
    expect(output.result).toContain('2h ago');
    expect(output.result).toContain('Implemented auth flow');
    expect(output.result).toContain('KEY DECISIONS:');
    expect(output.result).toContain('  - Chose JWT');
    expect(output.result).toContain('OPEN QUESTIONS:');
    expect(output.result).toContain('  ? Rate limiting?');
    expect(output.result).toContain('PROJECT STATE: local dev');
    expect(output.result).toContain('TECH STACK: node, express');
  });

  it('shows session saved just now', () => {
    const output = buildGuardContext(makeInput({
      session: {
        summary: 'Recent work',
        savedAt: new Date(Date.now() - 60000).toISOString(), // 1 min ago
      },
    }));
    expect(output.result).toContain('saved just now');
  });

  it('shows session saved days ago', () => {
    const output = buildGuardContext(makeInput({
      session: {
        summary: 'Old work',
        savedAt: new Date(Date.now() - 3600000 * 48).toISOString(), // 2 days
      },
    }));
    expect(output.result).toContain('2d ago');
  });
});

describe('buildTeamBlock', () => {
  it('returns empty string for no coworkers', () => {
    expect(buildTeamBlock({ coworkers: [], myActiveFiles: [] })).toBe('');
  });

  it('shows coworker status and tasks', () => {
    const team: TeamContext = {
      coworkers: [
        { username: 'bob', status: 'active', taskInfo: 't2 - Fix bug', progressInfo: ' (1/3)', activeFiles: ['src/utils.ts'] },
        { username: 'charlie', status: 'idle', taskInfo: 'idle', progressInfo: '', activeFiles: [] },
      ],
      myActiveFiles: ['src/index.ts'],
    };
    const block = buildTeamBlock(team);
    expect(block).toContain('TEAM CONTEXT (vibe-focus-team):');
    expect(block).toContain('bob [active]');
    expect(block).toContain('t2 - Fix bug (1/3)');
    expect(block).toContain('charlie [idle]');
  });

  it('detects file conflicts', () => {
    const team: TeamContext = {
      coworkers: [
        { username: 'bob', status: 'active', taskInfo: 't2 - Bug', progressInfo: '', activeFiles: ['src/index.ts', 'src/utils.ts'] },
      ],
      myActiveFiles: ['src/index.ts', 'src/app.ts'],
    };
    const block = buildTeamBlock(team);
    expect(block).toContain('CONFLICT WARNINGS:');
    expect(block).toContain('FILE CONFLICT with bob: src/index.ts');
    expect(block).toContain('Coordinate before modifying shared files!');
  });

  it('shows no conflict when files differ', () => {
    const team: TeamContext = {
      coworkers: [
        { username: 'bob', status: 'active', taskInfo: 't2', progressInfo: '', activeFiles: ['lib/other.ts'] },
      ],
      myActiveFiles: ['src/index.ts'],
    };
    const block = buildTeamBlock(team);
    expect(block).not.toContain('CONFLICT');
  });

  it('detects multiple conflicts', () => {
    const team: TeamContext = {
      coworkers: [
        { username: 'bob', status: 'active', taskInfo: 't2', progressInfo: '', activeFiles: ['src/a.ts'] },
        { username: 'charlie', status: 'active', taskInfo: 't3', progressInfo: '', activeFiles: ['src/b.ts'] },
      ],
      myActiveFiles: ['src/a.ts', 'src/b.ts'],
    };
    const block = buildTeamBlock(team);
    expect(block).toContain('FILE CONFLICT with bob: src/a.ts');
    expect(block).toContain('FILE CONFLICT with charlie: src/b.ts');
  });
});

describe('buildGuardContext with team', () => {
  it('integrates team context into full output', () => {
    const output = buildGuardContext(makeInput({
      team: {
        coworkers: [
          { username: 'bob', status: 'active', taskInfo: 't2 - API', progressInfo: ' (2/4)', activeFiles: [] },
        ],
        myActiveFiles: [],
      },
    }));
    expect(output.result).toContain('TEAM CONTEXT');
    expect(output.result).toContain('bob [active]');
    expect(output.result).toContain('ENFORCEMENT:'); // team comes before enforcement
  });
});
