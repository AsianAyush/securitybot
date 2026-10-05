import { getSupabaseAdmin } from "./supabase";

/**
 * Parameters for a successful verification audit log entry.
 */
export interface AuditLogSuccessParams {
  type: "success";
  guildId: string;
  discordId: string;
  username: string;
  avatarUrl?: string | null;
  ipAddress: string;
  verifiedAt: Date;
}

/**
 * Parameters for a failed verification audit log entry.
 */
export interface AuditLogFailureParams {
  type: "failure";
  guildId: string;
  discordId: string;
  username: string;
  avatarUrl?: string | null;
  ipAddress: string;
  failureCode: string;
  failureReason: string;
  /** Linked alt account Discord ID (if detected) */
  linkedAltDiscordId?: string | null;
  /** Linked alt account username (if detected) */
  linkedAltUsername?: string | null;
  attemptedAt: Date;
}

export type AuditLogParams = AuditLogSuccessParams | AuditLogFailureParams;

/**
 * Calculates Discord account creation date from a snowflake ID.
 * Formula: (snowflake >> 22) + 1420070400000 ms
 */
function getDiscordAccountCreatedAt(snowflake: string): { date: Date; timestampSec: number } {
  try {
    const snowflakeBigInt = BigInt(snowflake);
    const timestampMs = Number((snowflakeBigInt >> 22n) + 1420070400000n);
    const date = new Date(timestampMs);
    return { date, timestampSec: Math.floor(timestampMs / 1000) };
  } catch {
    return { date: new Date(), timestampSec: Math.floor(Date.now() / 1000) };
  }
}

/**
 * Fetches the configured log_channel_id for a guild from the guild_settings table.
 * Returns null if no log channel is configured or if the lookup fails.
 */
export async function getLogChannelId(guildId: string): Promise<string | null> {
  if (!guildId) return null;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("guild_settings")
      .select("log_channel_id")
      .eq("guild_id", guildId)
      .maybeSingle();

    if (error) {
      console.error("[AuditLog] Error fetching guild_settings:", error);
      return null;
    }

    return data?.log_channel_id ?? null;
  } catch (err) {
    console.error("[AuditLog] Exception fetching log channel:", err);
    return null;
  }
}

/**
 * Builds a Discord embed payload for a successful verification event.
 */
function buildSuccessEmbed(params: AuditLogSuccessParams) {
  const { timestampSec: createdAtSec } = getDiscordAccountCreatedAt(params.discordId);
  const verifiedSec = Math.floor(params.verifiedAt.getTime() / 1000);

  return {
    title: "✅ Verification Successful",
    color: 0x10b981, // Emerald Green
    description: `<@${params.discordId}> successfully registered with SecuritySTEX.`,
    fields: [
      {
        name: "👤 Member",
        value: `**${params.username}** (<@${params.discordId}>)`,
        inline: true,
      },
      {
        name: "🆔 Discord ID",
        value: `\`${params.discordId}\``,
        inline: true,
      },
      {
        name: "🌐 IP Address",
        value: `\`${params.ipAddress}\``,
        inline: true,
      },
      {
        name: "📅 Account Created",
        value: `<t:${createdAtSec}:F> (<t:${createdAtSec}:R>)`,
        inline: false,
      },
      {
        name: "⏰ Verified At",
        value: `<t:${verifiedSec}:F> (\`${params.verifiedAt.toISOString()}\`)`,
        inline: false,
      },
    ],
    thumbnail: params.avatarUrl ? { url: params.avatarUrl } : undefined,
    footer: {
      text: "SecuritySTEX • Audit Log Engine",
    },
    timestamp: params.verifiedAt.toISOString(),
  };
}

/**
 * Builds a Discord embed payload for a failed verification event.
 */
function buildFailureEmbed(params: AuditLogFailureParams) {
  const attemptedSec = Math.floor(params.attemptedAt.getTime() / 1000);

  const fields = [
    {
      name: "👤 Member",
      value: `**${params.username}** (<@${params.discordId}>)`,
      inline: true,
    },
    {
      name: "🆔 Discord ID",
      value: `\`${params.discordId}\``,
      inline: true,
    },
    {
      name: "🌐 IP Address",
      value: `\`${params.ipAddress}\``,
      inline: true,
    },
    {
      name: "❗ Failure Code",
      value: `\`${params.failureCode}\``,
      inline: true,
    },
    {
      name: "📝 Reason",
      value: params.failureReason,
      inline: false,
    },
    {
      name: "⏰ Attempted At",
      value: `<t:${attemptedSec}:F>`,
      inline: false,
    },
  ];

  // Include linked alt account info if present
  if (params.linkedAltDiscordId) {
    fields.push({
      name: "🔗 Linked Alt Account",
      value: params.linkedAltUsername
        ? `**${params.linkedAltUsername}** (<@${params.linkedAltDiscordId}>)`
        : `<@${params.linkedAltDiscordId}>`,
      inline: false,
    });
  }

  return {
    title: "❌ Verification Failed",
    color: 0xed4245, // Discord Red
    description: `<@${params.discordId}> failed registration. Reason: ${params.failureReason}`,
    fields,
    thumbnail: params.avatarUrl ? { url: params.avatarUrl } : undefined,
    footer: {
      text: "SecuritySTEX • Audit Log Engine",
    },
    timestamp: params.attemptedAt.toISOString(),
  };
}

/**
 * Sends an audit log embed to the configured guild log channel via the Discord bot REST API.
 * This uses the Discord REST API directly (no bot process dependency) by POSTing a message
 * to the designated channel using the bot token.
 *
 * Falls back to the legacy webhook URL (DISCORD_LOG_WEBHOOK_URL) if no guild log channel
 * is configured or if the channel send fails.
 */
export async function sendAuditLog(params: AuditLogParams): Promise<void> {
  const embed = params.type === "success" ? buildSuccessEmbed(params) : buildFailureEmbed(params);

  // 1. Try sending to the guild-configured log channel via Discord REST API
  const logChannelId = await getLogChannelId(params.guildId);
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (logChannelId && botToken) {
    try {
      const res = await fetch(
        `https://discord.com/api/v10/channels/${logChannelId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bot ${botToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ embeds: [embed] }),
        }
      );

      if (res.ok) {
        return; // Successfully sent to configured channel
      }

      const errBody = await res.text().catch(() => "");
      console.error(
        `[AuditLog] Failed to send to channel ${logChannelId} (HTTP ${res.status}):`,
        errBody
      );
    } catch (err) {
      console.error("[AuditLog] Exception sending to log channel:", err);
    }
  }

  // 2. Fallback: Send to the legacy webhook URL (if configured)
  const webhookUrl = process.env.DISCORD_LOG_WEBHOOK_URL;
  if (!webhookUrl || webhookUrl.trim() === "" || webhookUrl === "your-discord-webhook-url-here") {
    return;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "SecuritySTEX Audit Logger",
        avatar_url: "https://cdn.discordapp.com/embed/avatars/0.png",
        embeds: [embed],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(
        `[AuditLog] Webhook request failed with HTTP ${res.status}:`,
        errBody
      );
    }
  } catch (err) {
    console.error("[AuditLog] Error dispatching webhook log:", err);
  }
}
