import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getDiscordGuild } from "@/lib/discord";
import { getClientIp, isValidIp, normalizeIpv6, sanitizeIp } from "@/lib/ip";
import { getAppUrl, getRequestOrigin, PRODUCTION_DOMAIN } from "@/lib/url";

export const dynamic = "force-dynamic";

/**
 * Masks sensitive tokens or keys for safe diagnostic reporting.
 * e.g., "sb_publishable_123456789" -> "sb_pu...6789"
 */
function maskSecret(secret?: string | null): string {
  if (!secret) return "[NOT_SET]";
  const trimmed = secret.trim();
  if (trimmed.length <= 8) return "[CONFIGURED]";
  return `${trimmed.slice(0, 5)}...${trimmed.slice(-4)}`;
}

export async function GET(req: NextRequest) {
  const timestamp = new Date().toISOString();
  const startTime = Date.now();

  const appUrl = getAppUrl();
  const requestOrigin = getRequestOrigin(req);
  const clientIp = getClientIp(req);

  // 1. Dual-Stack IP Parsing Verification
  const sampleIpv4 = "203.0.113.195";
  const sampleIpv6 = "2001:0db8:85a3:0000:0000:8a2e:0370:7334";
  const sampleMapped = "::ffff:192.0.2.128";

  const ipEngineValid =
    isValidIp(sampleIpv4) &&
    isValidIp(sampleIpv6) &&
    normalizeIpv6("2001:0DB8:0000:0000:0000:0000:0000:0001") === "2001:db8::1" &&
    sanitizeIp(sampleMapped) === "192.0.2.128";

  const ipDiagnostics = {
    status: ipEngineValid ? "healthy" : "degraded",
    detectedClientIp: clientIp,
    isClientIpValid: isValidIp(clientIp),
    dualStackSupport: {
      ipv4: isValidIp(sampleIpv4),
      ipv6: isValidIp(sampleIpv6),
      ipv6CanonicalNormalization: normalizeIpv6("2001:0DB8:0000:0000:0000:0000:0000:0001") === "2001:db8::1",
      mappedNormalization: sanitizeIp(sampleMapped) === "192.0.2.128",
    },
  };

  // 2. Supabase Connection & Key Verification
  let supabaseStatus: "healthy" | "degraded" | "error" = "error";
  let supabaseLatencyMs = 0;
  let supabaseMessage = "";
  const rawServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const rawAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const isServiceRoleActive = Boolean(
    rawServiceKey && rawServiceKey !== "your-supabase-service-role-key-here"
  );

  try {
    const supabaseStart = Date.now();
    const supabase = getSupabaseAdmin();
    // Query guild_settings with limit 1 as a lightweight connectivity ping
    const { error } = await supabase.from("guild_settings").select("guild_id").limit(1);
    supabaseLatencyMs = Date.now() - supabaseStart;

    if (error) {
      supabaseStatus = "degraded";
      supabaseMessage = error.message;
    } else {
      supabaseStatus = "healthy";
      supabaseMessage = "Connected successfully to Supabase";
    }
  } catch (err: unknown) {
    supabaseStatus = "error";
    supabaseMessage = err instanceof Error ? err.message : String(err);
  }

  const supabaseDiagnostics = {
    status: supabaseStatus,
    latencyMs: supabaseLatencyMs,
    message: supabaseMessage,
    targetHost: (() => {
      const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!url) return "[NOT_SET]";
      try {
        return new URL(url).hostname;
      } catch {
        return "[INVALID_URL]";
      }
    })(),
    authKeyMode: isServiceRoleActive ? "service_role (privileged)" : "anon_fallback (restricted)",
    keyMasked: isServiceRoleActive ? maskSecret(rawServiceKey) : maskSecret(rawAnonKey),
  };

  // 3. Discord REST API v10 Verification
  const guildId = process.env.DISCORD_GUILD_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;

  let discordStatus: "healthy" | "degraded" | "error" = "error";
  let discordGuildName: string | null = null;
  let discordMessage = "";

  if (!botToken) {
    discordMessage = "DISCORD_BOT_TOKEN is not configured.";
  } else if (!guildId) {
    discordMessage = "DISCORD_GUILD_ID is not configured.";
  } else {
    try {
      const guildInfo = await getDiscordGuild(guildId);
      if (guildInfo) {
        discordStatus = "healthy";
        discordGuildName = guildInfo.name;
        discordMessage = `Connected to Discord REST API v10 (Guild: ${guildInfo.name})`;
      } else {
        discordStatus = "degraded";
        discordMessage = "Failed to fetch Discord guild info. Verify bot token permissions or guild ID.";
      }
    } catch (err: unknown) {
      discordStatus = "error";
      discordMessage = err instanceof Error ? err.message : String(err);
    }
  }

  const discordDiagnostics = {
    status: discordStatus,
    message: discordMessage,
    apiEndpoint: "https://discord.com/api/v10",
    guildIdConfigured: Boolean(guildId),
    guildName: discordGuildName,
    botTokenMasked: maskSecret(botToken),
    clientIdMasked: maskSecret(clientId),
  };

  // 4. ProxyCheck.io Anti-VPN Config Status
  const proxyCheckKey = process.env.PROXYCHECK_API_KEY;
  const proxyCheckDiagnostics = {
    isConfigured: Boolean(proxyCheckKey && proxyCheckKey !== "your-proxycheck-api-key-here"),
    keyMasked: maskSecret(proxyCheckKey),
  };

  const totalDurationMs = Date.now() - startTime;
  const isHealthy = supabaseStatus === "healthy" && discordStatus === "healthy" && ipEngineValid;

  // Safe production debug log (no secrets exposed)
  console.log(
    `[HealthCheck] app=${appUrl} status=${isHealthy ? "OK" : "DEGRADED"} supabase=${supabaseStatus} discord=${discordStatus} ipEngine=${ipDiagnostics.status} duration=${totalDurationMs}ms`
  );

  return NextResponse.json(
    {
      status: isHealthy ? "healthy" : "degraded",
      timestamp,
      durationMs: totalDurationMs,
      environment: process.env.NODE_ENV || "production",
      urls: {
        configuredAppUrl: appUrl,
        requestOrigin,
        liveProductionDomain: PRODUCTION_DOMAIN,
        isProductionDomainActive: appUrl.includes("stexsecurity.vercel.app"),
      },
      checks: {
        ipEngine: ipDiagnostics,
        supabase: supabaseDiagnostics,
        discordApi: discordDiagnostics,
        proxyCheck: proxyCheckDiagnostics,
      },
    },
    {
      status: isHealthy ? 200 : 207,
    }
  );
}
