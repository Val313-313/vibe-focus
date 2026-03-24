import chalk from 'chalk';
import { Command } from 'commander';
import { supabaseInsert, supabaseQuery } from '../../cloud/core/api.js';
import { readCloudConfig } from '../../cloud/core/cloud-state.js';
import type { CloudConfig } from '../../cloud/types.js';
import { fireDiscordEvent } from '../core/discord.js';

interface MessageRow {
  id: string;
  body: string;
  created_at: string;
  profiles: { username: string };
}

function getCloudConfig(): Pick<CloudConfig, 'userId' | 'projectId'> | null {
  try {
    const config = readCloudConfig();
    if (!config.userId || !config.projectId) return null;
    return { userId: config.userId, projectId: config.projectId };
  } catch {
    return null;
  }
}

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export const msgCommand = new Command('msg')
  .description('Send or read team messages')
  .argument('[message]', 'Message to send (omit to read recent messages)')
  .action(async (message?: string) => {
    const cfg = getCloudConfig();
    if (!cfg) {
      console.log(chalk.red('  Cloud not linked. Run: vf cloud login && vf cloud link'));
      return;
    }

    if (message) {
      // Send mode
      const trimmed = message.trim();
      if (trimmed.length === 0 || trimmed.length > 500) {
        console.log(chalk.red('  Message must be 1-500 characters.'));
        return;
      }

      const result = await supabaseInsert('messages', {
        project_id: cfg.projectId,
        user_id: cfg.userId,
        body: trimmed,
      });

      if (result.success) {
        console.log(chalk.green('  ✓ Message sent to team'));
        fireDiscordEvent({ type: 'message', message: trimmed });
      } else {
        console.log(chalk.red(`  Failed to send: ${result.error}`));
      }
    } else {
      // Read mode — show last 10 messages
      const params = [
        `project_id=eq.${cfg.projectId}`,
        'select=id,body,created_at,profiles:profiles(username)',
        'order=created_at.desc',
        'limit=10',
      ].join('&');

      const result = await supabaseQuery<MessageRow>('messages', params);

      if (!result.success) {
        console.log(chalk.red(`  Failed to fetch messages: ${result.error}`));
        return;
      }

      if (result.data.length === 0) {
        console.log(chalk.dim('  No team messages yet.'));
        return;
      }

      console.log(chalk.bold('\n  Team Messages (last 10)\n'));

      // Reverse to show oldest first
      const msgs = [...result.data].reverse();

      // Compute max username width for alignment
      const maxNameLen = Math.max(...msgs.map(m => (m.profiles?.username || '?').length));

      for (const msg of msgs) {
        const name = (msg.profiles?.username || '?').padEnd(maxNameLen);
        const age = formatAge(msg.created_at);
        console.log(`  ${chalk.cyanBright(name)}  ${msg.body}  ${chalk.dim(age)}`);
      }

      console.log('');
    }
  });
