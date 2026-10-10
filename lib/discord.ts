import { getSupabaseAdmin } from "./supabase";

export interface DiscordMemberInfo {
  user: {
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
    global_name?: string | null;
  };
  nick?: string | null;
  roles: string[];
  joined_at: string;
}

export interface DiscordGuildInfo {
  id: string;
  name: string;
  icon: string | null;
}

const DISCORD_API_BASE = "https://discord.com/api/v10";

/**
 * Gets Discord API Bot authorization header
 */
function getAuthHeader(auditReason?: string): { Authorization: string; "Content-Type": string; "X-Audit-Log-Reason"?: string } {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    throw new Error(
      "DISCORD_BOT_TOKEN is not configured in environment variables."
    );
  }
  const headers: { Authorization: string; "Content-Type": string; "X-Audit-Log-Reason"?: string } = {
    Authorization: `Bot ${botToken}`,
    "Content-Type": "application/json",
  };
  if (auditReason) {
    headers["X-Audit-Log-Reason"] = encodeURIComponent(auditReason);
  }
  return headers;
}

/**
 * Fetches basic Discord guild information
 */
export async function getDiscordGuild(guildId: string): Promise<DiscordGuildInfo | null> {
  try {
    const res = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}`, {
      headers: getAuthHeader(),
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[Discord API] Error fetching guild HTTP ${res.status}:`, errText);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error("[Discord API] Error fetching guild:", err);
    return null;
  }
}

export interface DiscordMemberResult {
  member: DiscordMemberInfo | null;
  /** HTTP status returned by Discord API */
  status: number;
  /** Human-readable error if lookup failed */
  error?: string;
}

/**
 * Fetches member info from the configured guild.
 * Returns a typed result so callers can distinguish between
 * "not in guild" (404), "bot token invalid" (401), and success.
 */
export async function getDiscordMember(
  guildId: string,
  discordId: string
): Promise<DiscordMemberResult> {
  try {
    const res = await fetch(
      `${DISCORD_API_BASE}/guilds/${guildId}/members/${discordId}`,
      {
        headers: getAuthHeader(),
        cache: "no-store",
      }
    );

    if (res.status === 404) {
      return { member: null, status: 404, error: "Member not found in guild" };
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[Discord API] Error ${res.status} fetching member:`, errText);
      return { member: null, status: res.status, error: `Discord API error HTTP ${res.status}` };
    }

    const data: DiscordMemberInfo = await res.json();
    return { member: data, status: 200 };
  } catch (err) {
    console.error("[Discord API] Exception fetching member:", err);
    return { member: null, status: 500, error: String(err) };
  }
}

/**
 * Checks if the bot has high enough role hierarchy to assign a target role.
 */
export async function checkRoleHierarchy(
  guildId: string,
  targetRoleId: string
): Promise<{ canManage: boolean; reason?: string }> {
  try {
    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!botToken) return { canManage: false, reason: "DISCORD_BOT_TOKEN not configured" };

    const headers = getAuthHeader();
    // 1. Fetch guild roles
    const rolesRes = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/roles`, { headers });
    if (!rolesRes.ok) return { canManage: true }; // Proceed optimistically if cannot query
    const roles: Array<{ id: string; name: string; position: number }> = await rolesRes.json();
    const targetRole = roles.find((r) => r.id === targetRoleId);
    if (!targetRole) {
      return { canManage: false, reason: `Target role ${targetRoleId} does not exist in this guild.` };
    }

    // 2. Fetch bot user
    const meRes = await fetch(`${DISCORD_API_BASE}/users/@me`, { headers });
    if (!meRes.ok) return { canManage: true };
    const me = await meRes.json();

    // 3. Fetch bot member in guild
    const botMemberRes = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/members/${me.id}`, { headers });
    if (!botMemberRes.ok) return { canManage: true };
    const botMember = await botMemberRes.json();

    let botHighestPosition = -1;
    for (const rId of botMember.roles || []) {
      const r = roles.find((role) => role.id === rId);
      if (r && r.position > botHighestPosition) {
        botHighestPosition = r.position;
      }
    }

    if (botHighestPosition <= targetRole.position) {
      return {
        canManage: false,
        reason: `Role Hierarchy Violation: Bot's highest role is at position ${botHighestPosition}, but target role '${targetRole.name}' is at position ${targetRole.position}. The bot's role must be positioned ABOVE '${targetRole.name}' in Discord Server Settings > Roles.`,
      };
    }

    return { canManage: true };
  } catch {
    return { canManage: true };
  }
}

/**
 * Calculates Discord account creation date from a snowflake ID.
 * Formula: (snowflake >> 22) + 1420070400000 ms
 */
export function getDiscordAccountCreatedAt(snowflake: string): { date: Date; timestampSec: number } {
  try {
    const snowflakeBigInt = BigInt(snowflake);
    const timestampMs = Number((snowflakeBigInt >> 22n) + 1420070400000n);
    const date = new Date(timestampMs);
    return { date, timestampSec: Math.floor(timestampMs / 1000) };
  } catch {
    const now = Date.now();
    return { date: new Date(now), timestampSec: Math.floor(now / 1000) };
  }
}

/**
 * Assigns verified role and removes unverified role from a member via Discord REST API.
 * Wraps operations so a missing unverified role does not prevent successful verification.
 */
export async function assignVerifiedRoles(params: {
  guildId: string;
  discordId: string;
  verifiedRoleId: string;
  unverifiedRoleId?: string;
}): Promise<{
  success: boolean;
  verifiedAssigned: boolean;
  unverifiedRemoved: boolean;
  error?: string;
}> {
  const { guildId, discordId, verifiedRoleId, unverifiedRoleId } = params;
  let verifiedAssigned = false;
  let unverifiedRemoved = false;

  if (!process.env.DISCORD_BOT_TOKEN) {
    const errorMsg =
      "DISCORD_BOT_TOKEN is not configured in the runtime environment. Cannot assign Discord roles.";
    console.error(`[Discord API] ${errorMsg}`);
    return { success: false, verifiedAssigned, unverifiedRemoved, error: errorMsg };
  }

  if (!verifiedRoleId || verifiedRoleId.trim() === "") {
    return { success: false, verifiedAssigned, unverifiedRemoved, error: "No verified role ID configured." };
  }

  // 1. Add Verified Role via PUT /guilds/{guild.id}/members/{user.id}/roles/{role.id}
  try {
    const addRoleUrl = `${DISCORD_API_BASE}/guilds/${guildId}/members/${discordId}/roles/${verifiedRoleId}`;
    const addRoleRes = await fetch(addRoleUrl, {
      method: "PUT",
      headers: getAuthHeader("SecuritySTEX Verification Completed - Adding Verified Role"),
    });

    if (addRoleRes.ok || addRoleRes.status === 204) {
      verifiedAssigned = true;
    } else {
      const errorBody = await addRoleRes.text().catch(() => "");
      console.error(
        `[Discord API] Failed to add verified role ${verifiedRoleId} to ${discordId}: HTTP ${addRoleRes.status}`,
        errorBody
      );

      if (addRoleRes.status === 403) {
        return {
          success: false,
          verifiedAssigned: false,
          unverifiedRemoved: false,
          error:
            "Discord Role Hierarchy Error: Bot has insufficient permissions (403 Forbidden). Ensure the bot has 'Manage Roles' permission and its highest role is positioned ABOVE the 'Verified' role in Discord Server Settings > Roles.",
        };
      } else if (addRoleRes.status === 404) {
        return {
          success: false,
          verifiedAssigned: false,
          unverifiedRemoved: false,
          error:
            "Member or role not found in Discord server. Please verify you are in the server and the configured role exists.",
        };
      }

      return {
        success: false,
        verifiedAssigned: false,
        unverifiedRemoved: false,
        error: `Discord REST API error (HTTP ${addRoleRes.status}): Failed to assign verified role.`,
      };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      verifiedAssigned: false,
      unverifiedRemoved: false,
      error: `Network error assigning verified role: ${message}`,
    };
  }

  // 2. Remove Unverified Role via DELETE /guilds/{guild.id}/members/{user.id}/roles/{role.id}
  // Wrapped in try/catch so a missing unverified role doesn't fail the verification response!
  if (unverifiedRoleId && unverifiedRoleId.trim() !== "") {
    try {
      const removeRoleUrl = `${DISCORD_API_BASE}/guilds/${guildId}/members/${discordId}/roles/${unverifiedRoleId}`;
      const removeRoleRes = await fetch(removeRoleUrl, {
        method: "DELETE",
        headers: getAuthHeader("SecuritySTEX Verification Completed - Removing Unverified Role"),
      });

      if (removeRoleRes.ok || removeRoleRes.status === 204) {
        unverifiedRemoved = true;
      } else if (removeRoleRes.status === 404) {
        console.info(
          `[Discord API] Note: Member ${discordId} did not have unverified role ${unverifiedRoleId} (HTTP 404), continuing.`
        );
      } else {
        const errorBody = await removeRoleRes.text().catch(() => "");
        console.warn(
          `[Discord API] Note: Failed to remove unverified role ${unverifiedRoleId} (HTTP ${removeRoleRes.status}):`,
          errorBody
        );
      }
    } catch (err) {
      console.warn("[Discord API] Warning removing unverified role (non-blocking):", err);
    }
  }

  return { success: true, verifiedAssigned, unverifiedRemoved };
}

/**
 * Payload interface for centralized audit log dispatching.
 */
export interface AuditLogDispatchPayload {
  type?: "success" | "failure";
  guildId?: string;
  discordId: string;
  username: string;
  avatarUrl?: string | null;
  ipAddress: string;
  verifiedAt?: Date;
  attemptedAt?: Date;
  verifiedRoleId?: string | null;
  unverifiedRoleId?: string | null;
  verifiedRoleAssigned?: boolean;
  unverifiedRoleRemoved?: boolean;
  failureCode?: string;
  failureReason?: string;
  linkedAltDiscordId?: string | null;
  linkedAltUsername?: string | null;
  details?: Record<string, unknown>;
}

/**
 * Centralized audit log utility.
 * - Fetches log_channel_id from guild_settings for the relevant guild_id.
 * - Constructs a structured embed with user mention/ID, creation date, verification time,
 *   verified role given / unverified role removed status, and dual-stack IP address.
 * - Posts via Discord REST API (POST /channels/{channel_id}/messages) or channel webhook.
 * - Wrapped in a non-blocking try/catch so logging errors never interrupt the verification flow.
 */
export async function sendAuditLog(
  guildIdOrPayload: string | AuditLogDispatchPayload,
  maybePayload?: AuditLogDispatchPayload
): Promise<void> {
  try {
    let guildId = "";
    let payload: AuditLogDispatchPayload;

    if (typeof guildIdOrPayload === "string") {
      guildId = guildIdOrPayload;
      payload = maybePayload || ({} as AuditLogDispatchPayload);
    } else {
      payload = guildIdOrPayload;
      guildId = guildIdOrPayload.guildId || "";
    }

    if (!payload || !payload.discordId) {
      console.warn("[AuditLog] Skipped dispatch: Missing discordId in payload.");
      return;
    }

    if (!guildId) {
      guildId = process.env.DISCORD_GUILD_ID || "";
    }

    // 1. Fetch log_channel_id from guild_settings
    let logChannelId: string | null = null;
    try {
      const supabase = getSupabaseAdmin();
      if (guildId) {
        const { data } = await supabase
          .from("guild_settings")
          .select("log_channel_id")
          .eq("guild_id", guildId)
          .maybeSingle();

        if (data?.log_channel_id) {
          logChannelId = data.log_channel_id;
        }
      }

      // Fallback: check any configured guild settings entry
      if (!logChannelId) {
        const { data } = await supabase
          .from("guild_settings")
          .select("log_channel_id")
          .not("log_channel_id", "is", null)
          .limit(1)
          .maybeSingle();

        if (data?.log_channel_id) {
          logChannelId = data.log_channel_id;
        }
      }
    } catch (dbErr) {
      console.warn("[AuditLog] Could not fetch log_channel_id from guild_settings:", dbErr);
    }

    // 2. Construct structured embed
    const isSuccess = payload.type !== "failure";
    const timestampDate = payload.verifiedAt || payload.attemptedAt || new Date();
    const { timestampSec: createdAtSec } = getDiscordAccountCreatedAt(payload.discordId);
    const eventTimestampSec = Math.floor(timestampDate.getTime() / 1000);

    let roleStatusText = "";
    if (payload.verifiedRoleId) {
      roleStatusText += payload.verifiedRoleAssigned !== false
        ? `• **Verified Role Given:** ✅ <@&${payload.verifiedRoleId}>\n`
        : `• **Verified Role Given:** ⚠️ Failed (<@&${payload.verifiedRoleId}>)\n`;
    } else {
      roleStatusText += "• **Verified Role Given:** ⚪ Not configured\n";
    }

    if (payload.unverifiedRoleId) {
      roleStatusText += payload.unverifiedRoleRemoved
        ? `• **Unverified Role Removed:** ✅ <@&${payload.unverifiedRoleId}>`
        : `• **Unverified Role Removed:** ⚪ Not present / Skipped (<@&${payload.unverifiedRoleId}>)`;
    } else {
      roleStatusText += "• **Unverified Role Removed:** ⚪ Not configured";
    }

    const embed = isSuccess
      ? {
          title: "✅ Member Verified Successfully",
          color: 0x10b981, // Emerald green
          description: `<@${payload.discordId}> has completed verification and received server access.`,
          fields: [
            {
              name: "👤 User",
              value: `**${payload.username}** (<@${payload.discordId}>)`,
              inline: true,
            },
            {
              name: "🆔 User ID",
              value: `\`${payload.discordId}\``,
              inline: true,
            },
            {
              name: "🌐 IP Address",
              value: `\`${payload.ipAddress}\``,
              inline: true,
            },
            {
              name: "📅 Account Created",
              value: `<t:${createdAtSec}:F> (<t:${createdAtSec}:R>)`,
              inline: false,
            },
            {
              name: "⏰ Verification Time",
              value: `<t:${eventTimestampSec}:F> (\`${timestampDate.toISOString()}\`)`,
              inline: false,
            },
            {
              name: "🛡️ Role Swap Status",
              value: roleStatusText,
              inline: false,
            },
          ],
          thumbnail: payload.avatarUrl ? { url: payload.avatarUrl } : undefined,
          footer: {
            text: "SecuritySTEX • Audit Log Engine",
          },
          timestamp: timestampDate.toISOString(),
        }
      : {
          title: "❌ Verification Attempt Failed",
          color: 0xed4245, // Red
          description: `<@${payload.discordId}> failed verification.`,
          fields: [
            {
              name: "👤 User",
              value: `**${payload.username}** (<@${payload.discordId}>)`,
              inline: true,
            },
            {
              name: "🆔 User ID",
              value: `\`${payload.discordId}\``,
              inline: true,
            },
            {
              name: "🌐 IP Address",
              value: `\`${payload.ipAddress}\``,
              inline: true,
            },
            {
              name: "❗ Failure Code",
              value: `\`${payload.failureCode || "VERIFICATION_FAILED"}\``,
              inline: true,
            },
            {
              name: "📝 Reason",
              value: payload.failureReason || "Security checks failed.",
              inline: false,
            },
            ...(payload.linkedAltDiscordId
              ? [
                  {
                    name: "🔗 Linked Alt Account",
                    value: payload.linkedAltUsername
                      ? `**${payload.linkedAltUsername}** (<@${payload.linkedAltDiscordId}>)`
                      : `<@${payload.linkedAltDiscordId}>`,
                    inline: false,
                  },
                ]
              : []),
            {
              name: "⏰ Attempted At",
              value: `<t:${eventTimestampSec}:F>`,
              inline: false,
            },
          ],
          thumbnail: payload.avatarUrl ? { url: payload.avatarUrl } : undefined,
          footer: {
            text: "SecuritySTEX • Audit Log Engine",
          },
          timestamp: timestampDate.toISOString(),
        };

    // 3. Post directly via Discord REST API (POST /channels/{channel_id}/messages)
    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (logChannelId && botToken) {
      try {
        const res = await fetch(`https://discord.com/api/v10/channels/${logChannelId}/messages`, {
          method: "POST",
          headers: {
            Authorization: `Bot ${botToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ embeds: [embed] }),
        });

        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          console.error(
            `[AuditLog] Failed to post to channel ${logChannelId} (HTTP ${res.status}):`,
            errBody
          );
        }
      } catch (postErr) {
        console.error("[AuditLog] REST API error posting log:", postErr);
      }
    }

    // 4. Post via channel webhook (if configured)
    const webhookUrl = process.env.DISCORD_LOG_WEBHOOK_URL;
    if (webhookUrl && webhookUrl.trim() !== "" && webhookUrl !== "your-discord-webhook-url-here") {
      try {
        const webhookRes = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: "SecuritySTEX Audit Logger",
            avatar_url: "https://cdn.discordapp.com/embed/avatars/0.png",
            embeds: [embed],
          }),
        });

        if (!webhookRes.ok) {
          const errBody = await webhookRes.text().catch(() => "");
          console.error(`[AuditLog] Webhook failed (HTTP ${webhookRes.status}):`, errBody);
        }
      } catch (webhookErr) {
        console.error("[AuditLog] Webhook error posting log:", webhookErr);
      }
    }

    // 5. Save audit log record to public.audit_logs database table
    try {
      const supabase = getSupabaseAdmin();
      await supabase.from("audit_logs").insert({
        guild_id: guildId || "global",
        discord_id: payload.discordId,
        discord_username: payload.username,
        ip_address: payload.ipAddress,
        event_type: payload.type || "success",
        status: payload.type === "failure" ? (payload.failureCode || "FAILED") : "VERIFIED",
        details: {
          failure_reason: payload.failureReason,
          verified_role_id: payload.verifiedRoleId,
          unverified_role_id: payload.unverifiedRoleId,
          verified_role_assigned: payload.verifiedRoleAssigned,
          unverified_role_removed: payload.unverifiedRoleRemoved,
          linked_alt_id: payload.linkedAltDiscordId,
          linked_alt_username: payload.linkedAltUsername,
        },
        created_at: timestampDate.toISOString(),
      });
    } catch {
      // Non-blocking DB write
    }
  } catch (outerErr) {
    // Non-blocking catch guarantees logging errors never prevent verification
    console.error("[AuditLog] Non-blocking exception in sendAuditLog:", outerErr);
  }
}

/**
 * Discord OAuth2 Configuration & Helpers
 */

export interface DiscordOAuthUser {
  id: string;
  username: string;
  discriminator: string;
  global_name?: string | null;
  avatar: string | null;
}

/**
 * Generates the Discord OAuth2 authorization URL with dynamic redirect_uri.
 */
export function getDiscordOAuthAuthorizeUrl(options: {
  redirectUri: string;
  clientId?: string;
  state?: string;
  scopes?: string[];
}): string {
  const clientId = options.clientId || process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    throw new Error("DISCORD_CLIENT_ID is not configured in environment variables.");
  }

  const scopes = options.scopes || ["identify", "guilds.members.read"];
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: options.redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    prompt: "consent",
  });

  if (options.state) {
    params.set("state", options.state);
  }

  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

/**
 * Exchanges a Discord OAuth2 authorization code for an access token.
 */
export async function exchangeDiscordOAuthCode(params: {
  code: string;
  redirectUri: string;
  clientId?: string;
  clientSecret?: string;
}): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}> {
  const clientId = params.clientId || process.env.DISCORD_CLIENT_ID;
  const clientSecret = params.clientSecret || process.env.DISCORD_CLIENT_SECRET;

  if (!clientId) {
    throw new Error("DISCORD_CLIENT_ID is not configured.");
  }
  if (!clientSecret) {
    throw new Error("DISCORD_CLIENT_SECRET is not configured.");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
  });

  const res = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(`Failed to exchange OAuth code (HTTP ${res.status}): ${errorBody}`);
  }

  return await res.json();
}

/**
 * Fetches the authenticated Discord user profile (@me) using an OAuth access token.
 */
export async function getDiscordOAuthUser(accessToken: string): Promise<DiscordOAuthUser> {
  const res = await fetch(`${DISCORD_API_BASE}/users/@me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(`Failed to fetch Discord user (HTTP ${res.status}): ${errorBody}`);
  }

  return await res.json();
}

