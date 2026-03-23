export type AgentType = 'claude' | 'cursor' | 'copilot' | 'windsurf' | 'generic';

export interface AgentConfig {
  type: AgentType;
  rulesDir: string;
  rulesFile: string;
  supportsHook: boolean;
  hookDir: string | null;
  settingsFile: string | null;
  envDetectVar: string | null;
  displayName: string;
}

export const AGENT_CONFIGS: Record<AgentType, AgentConfig> = {
  claude: {
    type: 'claude',
    rulesDir: '.claude/rules',
    rulesFile: 'vibe-focus.md',
    supportsHook: true,
    hookDir: '.claude/hooks',
    settingsFile: '.claude/settings.json',
    envDetectVar: 'CLAUDE_PROJECT_DIR',
    displayName: 'Claude Code',
  },
  copilot: {
    type: 'copilot',
    rulesDir: '.github',
    rulesFile: 'copilot-instructions.md',
    supportsHook: false,
    hookDir: null,
    settingsFile: null,
    envDetectVar: null,
    displayName: 'GitHub Copilot',
  },
  cursor: {
    type: 'cursor',
    rulesDir: '.cursor/rules',
    rulesFile: 'vibe-focus.mdc',
    supportsHook: false,
    hookDir: null,
    settingsFile: null,
    envDetectVar: null,
    displayName: 'Cursor',
  },
  windsurf: {
    type: 'windsurf',
    rulesDir: '',
    rulesFile: '.windsurfrules',
    supportsHook: false,
    hookDir: null,
    settingsFile: null,
    envDetectVar: null,
    displayName: 'Windsurf',
  },
  generic: {
    type: 'generic',
    rulesDir: '',
    rulesFile: '',
    supportsHook: false,
    hookDir: null,
    settingsFile: null,
    envDetectVar: null,
    displayName: 'Generic AI Agent',
  },
};
