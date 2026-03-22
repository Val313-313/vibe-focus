import fs from 'node:fs';
import path from 'node:path';
import { getStateDir } from '../../core/state.js';
import { validateUsername } from './validation.js';
import type { TeamConfig, LocalConfig } from '../types.js';

const TEAM_DIR = 'team';
const CONFIG_FILE = 'config.json';
const LOCAL_FILE = 'local.json';
const WORKERS_DIR = 'workers';

export function getTeamDir(): string {
  return path.join(getStateDir(), TEAM_DIR);
}

export function getWorkersDir(): string {
  return path.join(getTeamDir(), WORKERS_DIR);
}

export function isTeamInitialized(): boolean {
  return fs.existsSync(path.join(getTeamDir(), CONFIG_FILE));
}

export function readTeamConfig(): TeamConfig {
  const filePath = path.join(getTeamDir(), CONFIG_FILE);
  if (!fs.existsSync(filePath)) {
    throw new Error('Team not initialized. Run "vf team init --user <name>" first.');
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (typeof parsed.version !== 'number' || !parsed.settings) {
      throw new Error('Invalid team config format.');
    }
    return parsed as TeamConfig;
  } catch (e: any) {
    throw new Error(`Corrupt team config: ${e.message}. Re-run "vf team init".`);
  }
}

export function writeTeamConfig(config: TeamConfig): void {
  const filePath = path.join(getTeamDir(), CONFIG_FILE);
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2));
  fs.renameSync(tmpPath, filePath);
}

export function readLocalConfig(): LocalConfig {
  const filePath = path.join(getTeamDir(), LOCAL_FILE);
  if (!fs.existsSync(filePath)) {
    throw new Error('Local config not found. Run "vf team init --user <name>" first.');
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (typeof parsed.username !== 'string') {
      throw new Error('Missing username field.');
    }
    return parsed as LocalConfig;
  } catch (e: any) {
    throw new Error(`Corrupt local config: ${e.message}. Re-run "vf team init --user <name>".`);
  }
}

export function writeLocalConfig(config: LocalConfig): void {
  const filePath = path.join(getTeamDir(), LOCAL_FILE);
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2));
  fs.renameSync(tmpPath, filePath);
}

export function getUsername(): string {
  const username = readLocalConfig().username;
  validateUsername(username); // re-validate on every read (defense in depth)
  return username;
}

export function createTeamDirs(): void {
  const teamDir = getTeamDir();
  const workersDir = getWorkersDir();
  fs.mkdirSync(teamDir, { recursive: true });
  fs.mkdirSync(workersDir, { recursive: true });
}

/**
 * Update .vibe-focus/.gitignore to track team/ but keep state.json ignored.
 */
export function updateGitignore(): void {
  const gitignorePath = path.join(getStateDir(), '.gitignore');
  const content = `# Personal state - never commit
*
# Team coordination - shared via Git
!team/
!team/**
# But ignore local config
team/local.json
`;
  fs.writeFileSync(gitignorePath, content);
}
