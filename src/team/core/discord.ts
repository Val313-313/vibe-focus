import { readTeamConfig, isTeamInitialized } from './team-state.js';

export interface DiscordEvent {
  type: 'task_started' | 'task_completed' | 'criterion_checked' | 'task_abandoned' | 'message';
  taskId?: string;
  taskTitle?: string;
  worker?: string;
  progress?: string;
  message?: string;
}

interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  timestamp: string;
  footer?: { text: string };
}

const COLORS: Record<DiscordEvent['type'], number> = {
  task_started: 0x00cc66,    // green
  task_completed: 0x00bcd4,  // cyan
  criterion_checked: 0xffc107, // yellow
  task_abandoned: 0xf44336,  // red
  message: 0x9c27b0,         // purple
};

const ICONS: Record<DiscordEvent['type'], string> = {
  task_started: '▶',
  task_completed: '✓',
  criterion_checked: '☑',
  task_abandoned: '✗',
  message: '💬',
};

function buildDiscordEmbed(event: DiscordEvent, teamName: string): DiscordEmbed {
  const icon = ICONS[event.type];
  const worker = event.worker ?? 'unknown';

  if (event.type === 'message') {
    return {
      title: `${icon} ${worker}`,
      description: event.message ?? '',
      color: COLORS.message,
      timestamp: new Date().toISOString(),
      footer: { text: `vibe-focus | ${teamName}` },
    };
  }

  const action =
    event.type === 'task_started' ? 'started' :
    event.type === 'task_completed' ? 'completed' :
    event.type === 'criterion_checked' ? 'checked criteria on' :
    'abandoned';

  let description = `**${event.taskId}**: ${event.taskTitle ?? ''}`;
  if (event.progress) {
    description += `\nProgress: ${event.progress}`;
  }

  return {
    title: `${icon} ${worker} ${action} ${event.taskId ?? ''}`,
    description,
    color: COLORS[event.type],
    timestamp: new Date().toISOString(),
    footer: { text: `vibe-focus | ${teamName}` },
  };
}

async function sendDiscordEmbed(webhookUrl: string, embed: DiscordEmbed): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [embed],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fire-and-forget Discord notification. Safe to call from any command.
 *
 * - Returns immediately (does not await)
 * - Swallows ALL errors silently
 * - Does nothing if team not initialized or no webhook configured
 * - Never blocks the CLI
 */
export function fireDiscordEvent(event: DiscordEvent): void {
  try {
    if (!isTeamInitialized()) return;

    const config = readTeamConfig();
    const webhookUrl = config.settings.discordWebhookUrl;
    if (!webhookUrl) return;

    const embed = buildDiscordEmbed(event, config.teamName);

    // Fire and forget
    sendDiscordEmbed(webhookUrl, embed).catch(() => {});
  } catch {
    // Silently ignore
  }
}

/**
 * Send a test message to verify the webhook works. Returns success/failure.
 */
export async function testDiscordWebhook(webhookUrl: string, teamName: string): Promise<boolean> {
  try {
    const embed: DiscordEmbed = {
      title: '✓ vibe-focus connected',
      description: `Discord notifications enabled for **${teamName}**.\nTask events will appear here automatically.`,
      color: COLORS.task_completed,
      timestamp: new Date().toISOString(),
      footer: { text: `vibe-focus | ${teamName}` },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] }),
        signal: controller.signal,
      });
      return res.ok;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return false;
  }
}
