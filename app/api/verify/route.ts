import { NextRequest, NextResponse } from "next/server";
import { getClientIp, isValidIp, normalizeIp } from "@/lib/ip";
import { checkIpWithProxyCheck } from "@/lib/proxycheck";
import { getSupabaseAdmin } from "@/lib/supabase";
import { assignVerifiedRoles, getDiscordMember } from "@/lib/discord";
import { sendAuditLog } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

interface VerificationRequestBody {
  discord_id?: string;
  username?: string;
  global_name?: string;
  guild_id?: string;
}

/**
 * Resolves the target Discord guild ID from request, database settings, or environment.
 */
async function resolveGuildId(
  requestedGuildId?: string | null
): Promise<string> {
  if (requestedGuildId && requestedGuildId.trim() !== "") {
    return requestedGuildId.trim();
  }

  if (process.env.DISCORD_GUILD_ID && process.env.DISCORD_GUILD_ID.trim() !== "") {
    return process.env.DISCORD_GUILD_ID.trim();
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("guild_settings")
      .select("guild_id")
      .limit(1)
      .maybeSingle();

    if (data?.guild_id) {
      return data.guild_id;
    }
  } catch (err) {
    console.warn("[Verification] Could not query fallback guild_settings:", err);
  }

  return "";
}

/**
 * Builds a Discord avatar URL from member data or falls back to default.
 */
function buildAvatarUrl(discordId: string, avatar: string | null): string {
  return avatar
    ? `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png?size=128`
    : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordId) % 5}.png`;
}

/**
 * Helper to fire an audit log for verification failures without blocking or interrupting the response.
 */
async function logFailure(params: {
  guildId: string;
  discordId: string;
  username: string;
  avatarUrl?: string | null;
  ipAddress: string;
  failureCode: string;
  failureReason: string;
  linkedAltDiscordId?: string | null;
  linkedAltUsername?: string | null;
}): Promise<void> {
  try {
    await sendAuditLog(params.guildId, {
      type: "failure",
      discordId: params.discordId,
      username: params.username,
      avatarUrl: params.avatarUrl,
      ipAddress: params.ipAddress,
      failureCode: params.failureCode,
      failureReason: params.failureReason,
      linkedAltDiscordId: params.linkedAltDiscordId,
      linkedAltUsername: params.linkedAltUsername,
      attemptedAt: new Date(),
    });
  } catch (err) {
    console.error("[Verification] Failed to dispatch failure audit log:", err);
  }
}

export async function POST(req: NextRequest) {
  try {
    let discordId: string | null = null;
    let requestedUsername: string | null = null;
    let requestedGlobalName: string | null = null;
    let requestedGuildId: string | null = null;

    // 1. Parse payload from JSON body or URL search parameters
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = (await req.json().catch(() => ({}))) as VerificationRequestBody;
      discordId = body.discord_id || null;
      requestedUsername = body.username || null;
      requestedGlobalName = body.global_name || null;
      requestedGuildId = body.guild_id || null;
    }

    if (!discordId) {
      discordId = req.nextUrl.searchParams.get("discord_id");
    }
    if (!requestedUsername) {
      requestedUsername = req.nextUrl.searchParams.get("username");
    }
    if (!requestedGlobalName) {
      requestedGlobalName = req.nextUrl.searchParams.get("global_name");
    }
    if (!requestedGuildId) {
      requestedGuildId = req.nextUrl.searchParams.get("guild_id");
    }

    // Validate Discord snowflake ID format (17 to 20 digits)
    if (!discordId || !/^\d{17,20}$/.test(discordId.trim())) {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_DISCORD_ID",
          error:
            "Invalid Discord User ID format. Please ensure you clicked the unique verification link provided by the bot.",
        },
        { status: 400 }
      );
    }

    discordId = discordId.trim();

    // 2. Resolve Guild ID and Dynamic Server Roles
    const guildId = await resolveGuildId(requestedGuildId);
    const supabase = getSupabaseAdmin();

    let verifiedRoleId = process.env.DISCORD_VERIFIED_ROLE_ID || "";
    let unverifiedRoleId = process.env.DISCORD_UNVERIFIED_ROLE_ID || "";

    // Dynamically fetch configured role IDs from guild_settings table
    if (guildId) {
      try {
        const { data: guildConfig, error: configError } = await supabase
          .from("guild_settings")
          .select("verified_role_id, unverified_role_id")
          .eq("guild_id", guildId)
          .maybeSingle();

        if (configError) {
          console.warn("[Verification] Could not fetch role configuration from guild_settings:", configError.message);
        } else if (guildConfig) {
          if (guildConfig.verified_role_id) {
            verifiedRoleId = guildConfig.verified_role_id;
          }
          if (guildConfig.unverified_role_id) {
            unverifiedRoleId = guildConfig.unverified_role_id;
          }
        }
      } catch (err) {
        console.warn("[Verification] Exception querying guild_settings for roles:", err);
      }
    }

    // 3. Resolve Real Discord Username & Avatar early (Fixes placeholder User_5524 handles)
    let discordUsername = requestedUsername || requestedGlobalName || "";
    let avatarUrl: string | null = null;
    let memberDetails = null;

    if (process.env.DISCORD_BOT_TOKEN) {
      // Look up guild member first if guild ID is known
      if (guildId) {
        const memberResult = await getDiscordMember(guildId, discordId);
        if (memberResult.member) {
          memberDetails = memberResult.member;
          discordUsername =
            memberDetails.user.discriminator && memberDetails.user.discriminator !== "0"
              ? `${memberDetails.user.username}#${memberDetails.user.discriminator}`
              : (memberDetails.user.global_name || memberDetails.user.username);
          avatarUrl = buildAvatarUrl(discordId, memberDetails.user.avatar);
        }
      }

      // If username not yet resolved from guild member, query Discord user API directly
      if (!discordUsername) {
        try {
          const userRes = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
            headers: {
              Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
            },
          });
          if (userRes.ok) {
            const u = await userRes.json();
            discordUsername =
              u.discriminator && u.discriminator !== "0"
                ? `${u.username}#${u.discriminator}`
                : (u.global_name || u.username);
            if (u.avatar && !avatarUrl) {
              avatarUrl = buildAvatarUrl(discordId, u.avatar);
            }
          }
        } catch (fetchErr) {
          console.warn("[Discord API] Could not fetch user directly:", fetchErr);
        }
      }
    }

    // Fallback only if no username was resolved from OAuth, member, or user API
    if (!discordUsername) {
      discordUsername = `User_${discordId.slice(-4)}`;
    }

    // 4. Already Verified Check: Block re-verification of existing Discord IDs early
    const { data: existingVerification, error: existingVerificationError } = await supabase
      .from("verifications")
      .select("id, discord_id, discord_username, ip_address, verified_at")
      .eq("discord_id", discordId)
      .maybeSingle();

    if (existingVerificationError) {
      console.error("[Supabase Error] Already-verified lookup failed:", existingVerificationError);
    }

    if (existingVerification) {
      return NextResponse.json(
        {
          success: false,
          code: "ALREADY_VERIFIED",
          error:
            "You are already registered and verified! Your account has already been granted server access. If you are having role issues, please contact a server administrator.",
          details: {
            discord_id: existingVerification.discord_id,
            discord_username: existingVerification.discord_username,
            verified_at: existingVerification.verified_at,
          },
        },
        { status: 409 }
      );
    }

    // 5. Extract Client IP and Normalize (dual-stack: native IPv6 intact, ::ffff: mapped IPv4 normalized)
    const rawIp = getClientIp(req);
    const userIp = normalizeIp(isValidIp(rawIp) ? rawIp : "127.0.0.1") || "127.0.0.1";

    // 6. Blacklist Check: Query ip_blacklist table using normalized plain-text userIp
    const { data: blacklisted, error: blacklistError } = await supabase
      .from("ip_blacklist")
      .select("id, ip_address, reason, created_at")
      .eq("ip_address", userIp)
      .maybeSingle();

    if (blacklistError) {
      console.error("[Supabase Error] Blacklist lookup failed:", blacklistError);
    }

    if (blacklisted) {
      await logFailure({
        guildId,
        discordId,
        username: discordUsername,
        avatarUrl,
        ipAddress: userIp,
        failureCode: "IP_BLACKLISTED",
        failureReason: `IP address \`${userIp}\` is blacklisted.${blacklisted.reason ? ` Reason: ${blacklisted.reason}` : ""}`,
      });

      return NextResponse.json(
        {
          success: false,
          code: "IP_BLACKLISTED",
          error: `Access Denied: Your IP address (${userIp}) is blacklisted from this server.${
            blacklisted.reason ? ` Reason: ${blacklisted.reason}` : ""
          }`,
          details: {
            ip: userIp,
            reason: blacklisted.reason,
            blacklistedAt: blacklisted.created_at,
          },
        },
        { status: 403 }
      );
    }

    // 7. Proxy & VPN Detection via ProxyCheck.io
    const proxyCheck = await checkIpWithProxyCheck(userIp);
    if (!proxyCheck.isClean) {
      await logFailure({
        guildId,
        discordId,
        username: discordUsername,
        avatarUrl,
        ipAddress: userIp,
        failureCode: "VPN_OR_PROXY_DETECTED",
        failureReason: `VPN/Proxy detected. Type: ${proxyCheck.type || "Unknown"}, Risk: ${proxyCheck.risk ?? "N/A"}, Provider: ${proxyCheck.provider || "Unknown"}`,
      });

      return NextResponse.json(
        {
          success: false,
          code: "VPN_OR_PROXY_DETECTED",
          error:
            "Security Alert: A VPN, Proxy, or Hosting network was detected. Please disable your VPN, proxy, or anonymizer and retry.",
          details: {
            ip: userIp,
            networkType: proxyCheck.type,
            riskScore: proxyCheck.risk,
            provider: proxyCheck.provider,
          },
        },
        { status: 403 }
      );
    }

    // 8. Dynamic IP Account Limit Check
    const [ipCountResult, ipLimitResult] = await Promise.all([
      supabase
        .from("verifications")
        .select("id, discord_id, discord_username", { count: "exact" })
        .eq("ip_address", userIp),
      supabase
        .from("ip_limits")
        .select("max_accounts")
        .eq("ip_address", userIp)
        .maybeSingle(),
    ]);

    if (ipCountResult.error) {
      console.error("[Supabase Error] IP account count query failed:", ipCountResult.error);
    }

    if (ipLimitResult.error) {
      console.error("[Supabase Error] IP limit lookup failed:", ipLimitResult.error);
    }

    const currentAccountCount = ipCountResult.count ?? (ipCountResult.data?.length ?? 0);
    const maxAccounts = ipLimitResult.data?.max_accounts ?? 1;

    const isIpAlreadyAtLimit = currentAccountCount >= maxAccounts;

    if (isIpAlreadyAtLimit) {
      const existingIpAccounts = ipCountResult.data ?? [];
      const allBelongToThisUser = existingIpAccounts.every(
        (record) => record.discord_id === discordId
      );

      if (!allBelongToThisUser) {
        const altAccount = existingIpAccounts.find((r) => r.discord_id !== discordId);

        await logFailure({
          guildId,
          discordId,
          username: discordUsername,
          avatarUrl,
          ipAddress: userIp,
          failureCode: "IP_LIMIT_REACHED",
          failureReason: `Exceeded IP limit (${currentAccountCount}/${maxAccounts} accounts). Detected alternative account.`,
          linkedAltDiscordId: altAccount?.discord_id ?? null,
          linkedAltUsername: altAccount?.discord_username ?? null,
        });

        return NextResponse.json(
          {
            success: false,
            code: "IP_LIMIT_REACHED",
            error: `This IP address has reached its maximum account registration limit (${maxAccounts} account${maxAccounts !== 1 ? "s" : ""}). If you believe this is an error, please contact a server administrator.`,
            details: {
              ip: userIp,
              currentCount: currentAccountCount,
              maxAccounts,
            },
          },
          { status: 403 }
        );
      }
    }

    // 9. Legacy Single-IP Check (for default maxAccounts === 1 policy)
    const { data: singleIpRecord, error: singleIpError } = await supabase
      .from("verifications")
      .select("id, discord_id, discord_username, ip_address, verified_at")
      .eq("ip_address", userIp)
      .neq("discord_id", discordId)
      .limit(1)
      .maybeSingle();

    if (singleIpError) {
      console.error("[Supabase Error] Single-IP lookup failed:", singleIpError);
      return NextResponse.json(
        {
          success: false,
          code: "DATABASE_ERROR",
          error: "Failed to query verification records. Please try again shortly.",
        },
        { status: 500 }
      );
    }

    if (singleIpRecord && maxAccounts === 1) {
      await logFailure({
        guildId,
        discordId,
        username: discordUsername,
        avatarUrl,
        ipAddress: userIp,
        failureCode: "IP_ALREADY_USED",
        failureReason: `IP already used by another account. Alt detection triggered.`,
        linkedAltDiscordId: singleIpRecord.discord_id,
        linkedAltUsername: singleIpRecord.discord_username,
      });

      return NextResponse.json(
        {
          success: false,
          code: "IP_ALREADY_USED",
          error: `Security Policy Violation: The IP address ${userIp} has already been used to verify another Discord account (@${
            singleIpRecord.discord_username || singleIpRecord.discord_id
          }). Multiple accounts per IP address are prohibited.`,
          details: {
            ip: userIp,
            registeredDiscordId: singleIpRecord.discord_id,
            registeredUsername: singleIpRecord.discord_username,
            verifiedAt: singleIpRecord.verified_at,
          },
        },
        { status: 409 }
      );
    }

    // 10. Verify Membership in Discord Server
    if (guildId && process.env.DISCORD_BOT_TOKEN) {
      if (!memberDetails) {
        const memberCheck = await getDiscordMember(guildId, discordId);
        if (memberCheck.status === 404 || !memberCheck.member) {
          await logFailure({
            guildId,
            discordId,
            username: discordUsername,
            avatarUrl,
            ipAddress: userIp,
            failureCode: "MEMBER_NOT_IN_GUILD",
            failureReason: "User is not a member of the required Discord server.",
          });

          return NextResponse.json(
            {
              success: false,
              code: "MEMBER_NOT_IN_GUILD",
              error:
                "You are not a member of the required Discord server. Please join the Discord server before attempting verification.",
            },
            { status: 404 }
          );
        } else {
          memberDetails = memberCheck.member;
        }
      }
    }

    const verifiedAt = new Date();

    // 11. Insert Verification Record into Supabase with Real Username & Normalized IP
    const verificationPayload = {
      discord_id: discordId,
      discord_username: discordUsername,
      ip_address: userIp,
      verified_at: verifiedAt.toISOString(),
    };

    const { error: upsertError } = await supabase.from("verifications").upsert(
      verificationPayload,
      {
        onConflict: "discord_id",
      }
    );

    if (upsertError) {
      console.error("[Supabase Error] Upsert record failed:", upsertError);
      return NextResponse.json(
        {
          success: false,
          code: "RECORD_SAVE_FAILED",
          error: "Failed to persist verification status. Please try again.",
        },
        { status: 500 }
      );
    }

    // 12. Assign Discord Roles via Discord REST API (PUT /guilds/{guild.id}/members/{user.id}/roles/{role.id})
    if (guildId && verifiedRoleId) {
      if (!process.env.DISCORD_BOT_TOKEN) {
        console.error(
          "[Verification] DISCORD_BOT_TOKEN is missing in API runtime environment. Role assignment cannot proceed."
        );
        return NextResponse.json(
          {
            success: false,
            code: "BOT_TOKEN_MISSING",
            error:
              "Server configuration issue: DISCORD_BOT_TOKEN is not configured. Please contact an administrator.",
          },
          { status: 500 }
        );
      }

      const roleResult = await assignVerifiedRoles({
        guildId,
        discordId,
        verifiedRoleId,
        unverifiedRoleId,
      });

      if (!roleResult.success) {
        console.error(`[Verification] Role assignment failed for ${discordId}:`, roleResult.error);
        return NextResponse.json(
          {
            success: false,
            code: "ROLE_ASSIGNMENT_FAILED",
            error:
              roleResult.error ||
              "Your identity was validated, but Discord role assignment failed. Ensure the bot's highest role is positioned ABOVE the verified role in Server Settings > Roles.",
          },
          { status: 502 }
        );
      }
    } else {
      console.warn(
        `[Verification] Role assignment skipped: guildId='${guildId}', verifiedRoleId='${verifiedRoleId}'. Configure DISCORD_VERIFIED_ROLE_ID or use /role set in Discord.`
      );
    }

    // 13. Dispatch Audit Log — Success (non-blocking, wrapped in try/catch)
    try {
      await sendAuditLog(guildId, {
        type: "success",
        discordId,
        username: discordUsername,
        avatarUrl,
        ipAddress: userIp,
        verifiedAt,
      });
    } catch (auditErr) {
      console.error("[Verification] Failed to dispatch success audit log:", auditErr);
    }

    return NextResponse.json({
      success: true,
      code: "VERIFICATION_SUCCESSFUL",
      message:
        "Verification completed successfully! You may now close this tab and return to Discord.",
      data: {
        discord_id: discordId,
        discord_username: discordUsername,
        ip_address: userIp,
        verified_at: verifiedAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Verification API] Unexpected error:", message);
    return NextResponse.json(
      {
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        error: "An unexpected error occurred during verification. Please try again.",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const discordId = req.nextUrl.searchParams.get("discord_id");
  if (!discordId) {
    return NextResponse.json(
      {
        success: false,
        error: "Missing 'discord_id' query parameter.",
      },
      { status: 400 }
    );
  }
  return POST(req);
}
