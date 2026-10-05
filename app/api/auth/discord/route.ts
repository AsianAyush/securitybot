import { NextRequest, NextResponse } from "next/server";
import { getDiscordOAuthAuthorizeUrl } from "@/lib/discord";
import { getRequestOrigin } from "@/lib/url";

export const dynamic = "force-dynamic";

/**
 * Initiates Discord OAuth2 authentication flow.
 * Dynamically resolves the redirect URI from the incoming request origin
 * or the live production domain (https://stexsecurity.vercel.app).
 */
export async function GET(req: NextRequest) {
  try {
    const origin = getRequestOrigin(req);
    const redirectUri = `${origin}/api/auth/callback`;

    // Optional state parameter (can include return path or CSRF token)
    const state = req.nextUrl.searchParams.get("state") || undefined;

    const authorizeUrl = getDiscordOAuthAuthorizeUrl({
      redirectUri,
      state,
      scopes: ["identify", "guilds.members.read"],
    });

    return NextResponse.redirect(authorizeUrl);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[OAuth] Failed to initiate Discord OAuth flow:", message);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to initiate Discord OAuth authentication.",
        details: message,
      },
      { status: 500 }
    );
  }
}
