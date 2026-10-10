import { NextRequest, NextResponse } from "next/server";
import { exchangeDiscordOAuthCode, getDiscordOAuthUser } from "@/lib/discord";
import { getRequestOrigin } from "@/lib/url";

import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Handles Discord OAuth2 callback.
 * Exchanges the authorization code for an access token using the exact matching
 * redirect URI, fetches user identity, and redirects to the verification gateway.
 */
export async function GET(req: NextRequest) {
  const origin = getRequestOrigin(req);
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const errorDescription = req.nextUrl.searchParams.get("error_description");

  // User cancelled or Discord returned error
  if (error) {
    console.warn(`[OAuth Callback] Received error from Discord: ${error} (${errorDescription})`);
    return NextResponse.redirect(
      `${origin}/verify?error=${encodeURIComponent(errorDescription || error)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/verify?error=${encodeURIComponent("Missing authorization code from Discord.")}`
    );
  }

  const redirectUri = `${origin}/api/auth/callback`;

  try {
    // 1. Exchange authorization code for access token
    const tokenData = await exchangeDiscordOAuthCode({
      code,
      redirectUri,
    });

    // 2. Fetch authenticated Discord user profile from OAuth @me
    const discordUser = await getDiscordOAuthUser(tokenData.access_token);

    if (!discordUser || !discordUser.id) {
      throw new Error("Unable to retrieve Discord user profile from access token.");
    }

    // Extract the real handle using specified logic
    const username = discordUser.username || discordUser.global_name || 'Unknown User';

    // Sync real username if record exists
    try {
      const supabase = getSupabaseAdmin();
      await supabase
        .from("verifications")
        .update({
          discord_username: username,
          username: username,
        })
        .eq("discord_id", discordUser.id);
    } catch (dbErr) {
      console.warn("[OAuth Callback] Note: Non-blocking DB update:", dbErr);
    }

    // 3. Redirect user to the verification gateway with their Discord ID and real username
    const params = new URLSearchParams({
      discord_id: discordUser.id,
      username: username,
    });

    if (discordUser.global_name) {
      params.set("global_name", discordUser.global_name);
    }
    if (discordUser.discriminator && discordUser.discriminator !== "0") {
      params.set("discriminator", discordUser.discriminator);
    }

    return NextResponse.redirect(`${origin}/verify?${params.toString()}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[OAuth Callback] Error during token exchange or user lookup:", message);

    return NextResponse.redirect(
      `${origin}/verify?error=${encodeURIComponent(`Authentication failed: ${message}`)}`
    );
  }
}
