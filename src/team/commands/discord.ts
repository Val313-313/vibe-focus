import { Command } from 'commander';
import chalk from 'chalk';
import { readTeamConfig, writeTeamConfig, isTeamInitialized } from '../core/team-state.js';
import { testDiscordWebhook } from '../core/discord.js';

export const discordCommand = new Command('discord')
  .description('Configure Discord webhook for team notifications')
  .argument('[webhook-url]', 'Discord webhook URL (omit to show status)')
  .option('--off', 'Disable Discord notifications')
  .action(async (webhookUrl?: string, opts?: { off?: boolean }) => {
    if (!isTeamInitialized()) {
      console.log(chalk.red('  Team not initialized. Run: vf team init --user <name>'));
      return;
    }

    const config = readTeamConfig();

    // Disable mode
    if (opts?.off) {
      if (!config.settings.discordWebhookUrl) {
        console.log(chalk.dim('  Discord notifications are already off.'));
        return;
      }
      delete config.settings.discordWebhookUrl;
      writeTeamConfig(config);
      console.log(chalk.green('  ✓ Discord notifications disabled.'));
      return;
    }

    // Status mode (no args)
    if (!webhookUrl) {
      if (config.settings.discordWebhookUrl) {
        const masked = config.settings.discordWebhookUrl.replace(/\/[\w-]+$/, '/****');
        console.log(chalk.green('  ✓ Discord notifications enabled'));
        console.log(chalk.dim(`  Webhook: ${masked}`));
      } else {
        console.log(chalk.dim('  Discord notifications are off.'));
        console.log(chalk.dim('  Run: vf team discord "https://discord.com/api/webhooks/..."'));
      }
      return;
    }

    // Validate URL
    try {
      const url = new URL(webhookUrl);
      if (url.protocol !== 'https:') {
        console.log(chalk.red('  Webhook URL must use HTTPS.'));
        return;
      }
      if (!url.hostname.includes('discord.com') && !url.hostname.includes('discordapp.com')) {
        console.log(chalk.yellow('  Warning: URL does not look like a Discord webhook.'));
        console.log(chalk.dim('  Expected: https://discord.com/api/webhooks/...'));
      }
    } catch {
      console.log(chalk.red('  Invalid URL format.'));
      return;
    }

    // Test the webhook
    console.log(chalk.dim('  Testing webhook...'));
    const ok = await testDiscordWebhook(webhookUrl, config.teamName);

    if (!ok) {
      console.log(chalk.red('  Webhook test failed. Check the URL and try again.'));
      return;
    }

    // Save
    config.settings.discordWebhookUrl = webhookUrl;
    writeTeamConfig(config);

    console.log(chalk.green('  ✓ Discord notifications enabled!'));
    console.log(chalk.dim('  A test message was sent to your channel.'));
    console.log(chalk.dim('  Task events will now post automatically.'));
  });
