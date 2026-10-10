import { NextRequest, NextResponse } from "next/server";
import { exchangeDiscordOAuthCode, getDiscordOAuthUser } from "@/lib/discord";
import { getRequestOrigin } from "@/lib/url";

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

    // 2. Fetch authenticated Discord user profile
    const user = await getDiscordOAuthUser(tokenData.access_token);

    if (!user || !user.id) {
      throw new Error("Unable to retrieve Discord user profile from access token.");
    }

    // 3. Extract real username and redirect user to the verification gateway
    const params = new URLSearchParams({
      discord_id: user.id,
      username: user.username,
    });

    if (user.global_name) {
      params.set("global_name", user.global_name);
    }
    if (user.discriminator && user.discriminator !== "0") {
      params.set("discriminator", user.discriminator);
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
