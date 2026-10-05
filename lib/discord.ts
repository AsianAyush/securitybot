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
function getAuthHeader(): { Authorization: string; "Content-Type": string } {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    throw new Error(
      "DISCORD_BOT_TOKEN is not configured in environment variables."
    );
  }
  return {
    Authorization: `Bot ${botToken}`,
    "Content-Type": "application/json",
  };
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
      const errText = await res.text();
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
 * Assigns verified role and removes unverified role from a member via Discord REST API.
 */
export async function assignVerifiedRoles(params: {
  guildId: string;
  discordId: string;
  verifiedRoleId: string;
  unverifiedRoleId?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { guildId, discordId, verifiedRoleId, unverifiedRoleId } = params;
  const headers = getAuthHeader();

  // 1. Add Verified Role
  try {
    const addRoleUrl = `${DISCORD_API_BASE}/guilds/${guildId}/members/${discordId}/roles/${verifiedRoleId}`;
    const addRoleRes = await fetch(addRoleUrl, {
      method: "PUT",
      headers,
    });

    if (!addRoleRes.ok) {
      const errorBody = await addRoleRes.text();
      console.error(
        `[Discord API] Failed to add verified role ${verifiedRoleId} to ${discordId}: HTTP ${addRoleRes.status}`,
        errorBody
      );

      if (addRoleRes.status === 403) {
        return {
          success: false,
          error:
            "Bot has insufficient permissions to assign roles. Please check that the bot's role is positioned ABOVE the verified role in Discord Server Settings > Roles.",
        };
      } else if (addRoleRes.status === 404) {
        return {
          success: false,
          error:
            "Member not found in Discord server. Please join the Discord server first before verifying.",
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
        headers,
      });

      if (!removeRoleRes.ok && removeRoleRes.status !== 404) {
        const errorBody = await removeRoleRes.text();
        console.warn(
          `[Discord API] Note: Failed to remove unverified role ${unverifiedRoleId} (HTTP ${removeRoleRes.status}):`,
          errorBody
        );
        // Non-blocking warning: verified role has already been assigned
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

