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
 * Assigns verified role and removes unverified role from a member via Discord REST API.
 */
export async function assignVerifiedRoles(params: {
  guildId: string;
  discordId: string;
  verifiedRoleId: string;
  unverifiedRoleId?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { guildId, discordId, verifiedRoleId, unverifiedRoleId } = params;

  if (!process.env.DISCORD_BOT_TOKEN) {
    const errorMsg =
      "DISCORD_BOT_TOKEN is not configured in the runtime environment. Cannot assign Discord roles.";
    console.error(`[Discord API] ${errorMsg}`);
    return { success: false, error: errorMsg };
  }

  if (!verifiedRoleId || verifiedRoleId.trim() === "") {
    return { success: false, error: "No verified role ID configured." };
  }

  // 1. Add Verified Role via PUT /guilds/{guild.id}/members/{user.id}/roles/{role.id}
  try {
    const addRoleUrl = `${DISCORD_API_BASE}/guilds/${guildId}/members/${discordId}/roles/${verifiedRoleId}`;
    const addRoleRes = await fetch(addRoleUrl, {
      method: "PUT",
      headers: getAuthHeader("SecuritySTEX Verification Completed"),
    });

    if (!addRoleRes.ok && addRoleRes.status !== 204) {
      const errorBody = await addRoleRes.text().catch(() => "");
      console.error(
        `[Discord API] Failed to add verified role ${verifiedRoleId} to ${discordId}: HTTP ${addRoleRes.status}`,
        errorBody
      );

      if (addRoleRes.status === 403) {
        return {
          success: false,
          error:
            "Discord Role Hierarchy Error: Bot has insufficient permissions (403 Forbidden). Ensure the bot has 'Manage Roles' permission and its highest role is positioned ABOVE the 'Verified' role in Discord Server Settings > Roles.",
        };
      } else if (addRoleRes.status === 404) {
        return {
          success: false,
          error:
            "Member or role not found in Discord server. Please verify you are in the server and the configured role exists.",
        };
      }

      return {
        success: false,
        error: `Discord REST API error (HTTP ${addRoleRes.status}): Failed to assign verified role.`,
      };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Network error assigning verified role: ${message}`,
    };
  }

  // 2. Remove Unverified Role (if specified)
  if (unverifiedRoleId && unverifiedRoleId.trim() !== "") {
    try {
      const removeRoleUrl = `${DISCORD_API_BASE}/guilds/${guildId}/members/${discordId}/roles/${unverifiedRoleId}`;
      const removeRoleRes = await fetch(removeRoleUrl, {
        method: "DELETE",
        headers: getAuthHeader("SecuritySTEX Verification Completed - Removing Unverified Role"),
      });

      if (!removeRoleRes.ok && removeRoleRes.status !== 204 && removeRoleRes.status !== 404) {
        const errorBody = await removeRoleRes.text().catch(() => "");
        console.warn(
          `[Discord API] Note: Failed to remove unverified role ${unverifiedRoleId} (HTTP ${removeRoleRes.status}):`,
          errorBody
        );
      }
    } catch (err) {
      console.warn("[Discord API] Warning removing unverified role:", err);
    }
  }

  return { success: true };
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

