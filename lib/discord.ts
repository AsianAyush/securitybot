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
