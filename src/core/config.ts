import fs from 'node:fs';
import path from 'node:path';
import { getStateDir } from './state.js';

const CONFIG_FILE = 'config.json';

export interface VibeFocusConfig {
  agent?: string;
}

export function readConfig(): VibeFocusConfig {
  try {
    const configPath = path.join(getStateDir(), CONFIG_FILE);
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch {
    // Return empty config on any error
  }
  return {};
}

export function writeConfig(config: VibeFocusConfig): void {
  const dir = getStateDir();
  fs.mkdirSync(dir, { recursive: true });
  const configPath = path.join(dir, CONFIG_FILE);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export function updateConfig(updates: Partial<VibeFocusConfig>): void {
  const config = readConfig();
  writeConfig({ ...config, ...updates });
}
