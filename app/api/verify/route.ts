import { NextRequest, NextResponse } from "next/server";
import { getClientIp, isValidIp } from "@/lib/ip";
import { checkIpWithProxyCheck } from "@/lib/proxycheck";
import { getSupabaseAdmin } from "@/lib/supabase";
import { assignVerifiedRoles, getDiscordMember } from "@/lib/discord";

export const dynamic = "force-dynamic";

interface VerificationRequestBody {
  discord_id?: string;
}

interface AuditWebhookParams {
  discordId: string;
  username: string;
  avatarUrl?: string | null;
  ip_address: string;
  userIp?: string;
  verifiedAt: Date;
}

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
 * Sends a rich audit log embed to the configured Discord Webhook
 */
async function sendAuditWebhook(params: AuditWebhookParams) {
  const webhookUrl = process.env.DISCORD_LOG_WEBHOOK_URL;
  if (!webhookUrl || webhookUrl.trim() === "" || webhookUrl === "your-discord-webhook-url-here") {
    return;
  }

  const resolvedIp = (params.ip_address || params.userIp || "127.0.0.1").trim() || "127.0.0.1";
  const { timestampSec: createdAtSec } = getDiscordAccountCreatedAt(params.discordId);
  const verifiedSec = Math.floor(params.verifiedAt.getTime() / 1000);

  const embed = {
    title: "🛡️ SecuritySTEX Verification Audit Log",
    color: 0x10b981, // Emerald Green
    description: `A member has successfully passed all security barriers and completed server verification.`,
    fields: [
      {
        name: "👤 Member",
        value: `**${params.username}** (<@${params.discordId}>)`,
        inline: true,
      },
      {
        name: "🆔 Discord Snowflake ID",
        value: `\`${params.discordId}\``,
        inline: true,
      },
      {
        name: "🌐 Plain-Text IP Address",
        value: `\`${resolvedIp}\``,
        inline: true,
      },
      {
        name: "📅 Account Created",
        value: `<t:${createdAtSec}:F> (<t:${createdAtSec}:R>)`,
        inline: false,
      },
      {
        name: "⏰ Verification Timestamp",
        value: `<t:${verifiedSec}:F> (\`${params.verifiedAt.toISOString()}\`)`,
        inline: false,
      },
    ],
    thumbnail: params.avatarUrl ? { url: params.avatarUrl } : undefined,
    footer: {
      text: "SecuritySTEX • Plain-Text Audit Engine",
    },
    timestamp: params.verifiedAt.toISOString(),
  };

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
        `[Audit Webhook] Webhook request failed with status HTTP ${res.status}:`,
        errBody
      );
    }
  } catch (err) {
    console.error("[Audit Webhook] Error dispatching webhook log:", err);
  }
}

export async function POST(req: NextRequest) {
  try {
    let discordId: string | null = null;

    // 1. Parse Discord ID from body or query params
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = (await req.json().catch(() => ({}))) as VerificationRequestBody;
      discordId = body.discord_id || null;
    }

    if (!discordId) {
      discordId = req.nextUrl.searchParams.get("discord_id");
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

    const supabase = getSupabaseAdmin();

    // 2. Already Verified Check: Block re-verification of existing Discord IDs early
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
          error: "You are already registered and verified! Your account has already been granted server access. If you are having role issues, please contact a server administrator.",
          details: {
            discord_id: existingVerification.discord_id,
            discord_username: existingVerification.discord_username,
            verified_at: existingVerification.verified_at,
          },
        },
        { status: 409 }
      );
    }

    // 3. Extract Client's Raw Plain-Text IP (No Hashing)
    const rawIp = getClientIp(req);
    const userIp = (isValidIp(rawIp) ? rawIp : "127.0.0.1").trim() || "127.0.0.1";

    // 4. Blacklist Check: Query ip_blacklist table using raw plain-text userIp
    const { data: blacklisted, error: blacklistError } = await supabase
      .from("ip_blacklist")
      .select("id, ip_address, reason, created_at")
      .eq("ip_address", userIp)
      .maybeSingle();

    if (blacklistError) {
      console.error("[Supabase Error] Blacklist lookup failed:", blacklistError);
    }

    if (blacklisted) {
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

    // 5. Proxy & VPN Detection via ProxyCheck.io
    const proxyCheck = await checkIpWithProxyCheck(userIp);
    if (!proxyCheck.isClean) {
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

    // 6. Dynamic IP Account Limit Check
    //    Count how many distinct Discord accounts are already verified under this IP.
    //    Then check ip_limits for a custom limit; default is 1.
    const [ipCountResult, ipLimitResult] = await Promise.all([
      supabase
        .from("verifications")
        .select("id, discord_id", { count: "exact" })
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

    // Determine if the current discordId is already one of the registered accounts on this IP.
    // (Since we already checked for the exact discord_id above and it wasn't there,
    //  currentAccountCount only includes OTHER discord accounts from this IP.)
    const isIpAlreadyAtLimit = currentAccountCount >= maxAccounts;

    if (isIpAlreadyAtLimit) {
      // Check if any of those existing records are for a *different* discord_id (anti-alt)
      const existingIpAccounts = ipCountResult.data ?? [];
      const allBelongToThisUser = existingIpAccounts.every(
        (record) => record.discord_id === discordId
      );

      if (!allBelongToThisUser) {
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

    // 7. Anti-Alt Protection: Reject if this IP is tied to a different Discord user (legacy single-IP check)
    //    This is superseded by the dynamic limit above when max_accounts=1, but kept as an
    //    explicit guard to surface a clearer error message for the default 1-account-per-IP policy.
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

    // 8. Fetch Discord Member Details & Guild Verification
    const guildId = process.env.DISCORD_GUILD_ID;
    const verifiedRoleId = process.env.DISCORD_VERIFIED_ROLE_ID;
    const unverifiedRoleId = process.env.DISCORD_UNVERIFIED_ROLE_ID;

    let memberDetails = null;
    let discordUsername = `User_${discordId.slice(-4)}`;
    let avatarUrl: string | null = null;

    if (guildId && process.env.DISCORD_BOT_TOKEN) {
      const memberResult = await getDiscordMember(guildId, discordId);

      if (memberResult.status === 401) {
        // Bot token is invalid — log a warning but don't block verification
        // The admin must fix the bot token; verification still proceeds so users aren't locked out
        console.error(
          "[Discord API] Bot token is invalid (401 Unauthorized). Role assignment will be skipped. Please fix DISCORD_BOT_TOKEN."
        );
      } else if (memberResult.status === 404 || !memberResult.member) {
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
        memberDetails = memberResult.member;
      }

      if (memberDetails) {
        discordUsername =
          memberDetails.user.discriminator && memberDetails.user.discriminator !== "0"
            ? `${memberDetails.user.username}#${memberDetails.user.discriminator}`
            : memberDetails.user.username;

        avatarUrl = memberDetails.user.avatar
          ? `https://cdn.discordapp.com/avatars/${memberDetails.user.id}/${memberDetails.user.avatar}.png?size=128`
          : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordId) % 5}.png`;
      }
    }

    const verifiedAt = new Date();

    // 9. Insert Verification Record into Supabase with Plain-Text IP & Rich Metadata
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

    // 10. Assign Discord Roles via Discord REST API
    if (guildId && verifiedRoleId && process.env.DISCORD_BOT_TOKEN) {
      const roleResult = await assignVerifiedRoles({
        guildId,
        discordId,
        verifiedRoleId,
        unverifiedRoleId,
      });

      if (!roleResult.success) {
        return NextResponse.json(
          {
            success: false,
            code: "ROLE_ASSIGNMENT_FAILED",
            error:
              roleResult.error ||
              "Your identity was validated, but Discord role assignment failed. Please contact a server administrator.",
          },
          { status: 502 }
        );
      }
    }

    // 11. Dispatch Rich Discord Webhook Audit Embed
    await sendAuditWebhook({
      discordId,
      username: discordUsername,
      avatarUrl,
      ip_address: userIp,
      userIp,
      verifiedAt,
    });

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
