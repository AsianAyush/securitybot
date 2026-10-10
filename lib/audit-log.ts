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
      console.error("[AuditLog] Error fetching guild_settings:", error.message || error);
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

export type AuditLogPayload = {
  type: "success" | "failure";
  discordId: string;
  username: string;
  avatarUrl?: string | null;
  ipAddress: string;
  verifiedAt?: Date;
  failureCode?: string;
  failureReason?: string;
  linkedAltDiscordId?: string | null;
  linkedAltUsername?: string | null;
  attemptedAt?: Date;
  details?: Record<string, unknown>;
  guildId?: string;
};

/**
 * Robust helper function that dispatches audit logs without interrupting verification flow.
 * Supports both signatures:
 *   sendAuditLog(guildId, payload)
 *   sendAuditLog(params)
 */
export async function sendAuditLog(
  guildIdOrParams: string | AuditLogParams,
  payloadArg?: AuditLogPayload
): Promise<void> {
  try {
    let guildId: string;
    let payload: AuditLogPayload;

    if (typeof guildIdOrParams === "string") {
      guildId = guildIdOrParams;
      payload = payloadArg || ({} as AuditLogPayload);
    } else {
      payload = guildIdOrParams;
      guildId = guildIdOrParams.guildId || "";
    }

    if (!payload.discordId) {
      console.warn("[AuditLog] Skipped dispatch: Missing discordId in payload.");
      return;
    }

    const embed =
      payload.type === "success"
        ? buildSuccessEmbed({
            type: "success",
            guildId,
            discordId: payload.discordId,
            username: payload.username,
            avatarUrl: payload.avatarUrl,
            ipAddress: payload.ipAddress,
            verifiedAt: payload.verifiedAt || new Date(),
          })
        : buildFailureEmbed({
            type: "failure",
            guildId,
            discordId: payload.discordId,
            username: payload.username,
            avatarUrl: payload.avatarUrl,
            ipAddress: payload.ipAddress,
            failureCode: payload.failureCode || "VERIFICATION_FAILED",
            failureReason: payload.failureReason || "Verification rejected by security rules.",
            linkedAltDiscordId: payload.linkedAltDiscordId,
            linkedAltUsername: payload.linkedAltUsername,
            attemptedAt: payload.attemptedAt || new Date(),
          });

    // 1. Resolve log_channel_id from guild_settings
    let logChannelId: string | null = null;
    if (guildId) {
      logChannelId = await getLogChannelId(guildId);
    }

    // Fallback: If not found, attempt to find any configured log_channel_id
    if (!logChannelId) {
      try {
        const supabase = getSupabaseAdmin();
        const { data } = await supabase
          .from("guild_settings")
          .select("log_channel_id")
          .not("log_channel_id", "is", null)
          .limit(1)
          .maybeSingle();

        if (data?.log_channel_id) {
          logChannelId = data.log_channel_id;
        }
      } catch (err) {
        console.warn("[AuditLog] Could not query default guild_settings:", err);
      }
    }

    // 2. Dispatch to the guild-configured log channel via Discord REST API
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

        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          console.error(
            `[AuditLog] Failed to send to channel ${logChannelId} (HTTP ${res.status}):`,
            errBody
          );
        }
      } catch (err) {
        console.error("[AuditLog] Exception sending to log channel:", err);
      }
    }

    // 3. Dispatch to the webhook URL (if configured)
    const webhookUrl = process.env.DISCORD_LOG_WEBHOOK_URL;
    if (webhookUrl && webhookUrl.trim() !== "" && webhookUrl !== "your-discord-webhook-url-here") {
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

    // 4. Record entry to public.audit_logs database table (non-blocking)
    try {
      const supabase = getSupabaseAdmin();
      await supabase.from("audit_logs").insert({
        guild_id: guildId || process.env.DISCORD_GUILD_ID || "global",
        discord_id: payload.discordId,
        discord_username: payload.username,
        ip_address: payload.ipAddress,
        event_type: payload.type,
        status: payload.type === "success" ? "VERIFIED" : (payload.failureCode || "FAILED"),
        details: {
          failure_reason: payload.failureReason,
          linked_alt_id: payload.linkedAltDiscordId,
          linked_alt_username: payload.linkedAltUsername,
        },
        created_at: new Date().toISOString(),
      });
    } catch {
      // Ignore if audit_logs table not yet migrated
    }
  } catch (outerErr) {
    // Top-level catch ensures logging never interrupts the user's verification flow
    console.error("[AuditLog] Top-level error in sendAuditLog:", outerErr);
  }
}

