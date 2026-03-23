import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentType } from './types.js';
import { AGENT_CONFIGS } from './types.js';
import { readConfig } from '../core/config.js';

const VALID_AGENTS = Object.keys(AGENT_CONFIGS) as AgentType[];

// Directory markers for auto-detection (checked in priority order)
const DIRECTORY_MARKERS: [AgentType, string][] = [
  ['claude', '.claude'],
  ['cursor', '.cursor'],
  ['copilot', '.github/copilot-instructions.md'],
  ['windsurf', '.windsurfrules'],
];

export function isValidAgent(value: string): value is AgentType {
  return VALID_AGENTS.includes(value as AgentType);
}

export function resolveAgent(flagValue?: string): AgentType {
  // 1. Explicit flag
  if (flagValue) {
    if (isValidAgent(flagValue)) return flagValue;
    throw new Error(`Unknown agent "${flagValue}". Valid: ${VALID_AGENTS.join(', ')}`);
  }

  // 2. VF_AGENT env var
  const envAgent = process.env.VF_AGENT;
  if (envAgent) {
    if (isValidAgent(envAgent)) return envAgent;
    // Silently ignore invalid env value, fall through
  }

  // 3. Project config
  try {
    const config = readConfig();
    if (config.agent && isValidAgent(config.agent)) {
      return config.agent;
    }
  } catch {
    // No config file — not initialized yet, fall through
  }

  // 4. Auto-detect from environment
  if (process.env.CLAUDE_PROJECT_DIR) return 'claude';

  // 5. Auto-detect from directory markers
  const cwd = process.cwd();
  for (const [agentType, marker] of DIRECTORY_MARKERS) {
    if (existsSync(join(cwd, marker))) return agentType;
  }

  // 6. Fallback
  return 'generic';
}
