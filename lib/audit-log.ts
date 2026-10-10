import { getSupabaseAdmin } from "./supabase";

export { sendAuditLog, getDiscordAccountCreatedAt } from "./discord";
export type { AuditLogDispatchPayload } from "./discord";

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
  verifiedRoleId?: string | null;
  unverifiedRoleId?: string | null;
  verifiedRoleAssigned?: boolean;
  unverifiedRoleRemoved?: boolean;
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
  linkedAltDiscordId?: string | null;
  linkedAltUsername?: string | null;
  attemptedAt: Date;
}

export type AuditLogParams = AuditLogSuccessParams | AuditLogFailureParams;
export type AuditLogPayload = AuditLogSuccessParams | AuditLogFailureParams;

/**
 * Fetches the configured log_channel_id for a guild from the guild_settings table.
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
