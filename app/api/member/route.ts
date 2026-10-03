import { NextRequest, NextResponse } from "next/server";
import { getDiscordGuild, getDiscordMember } from "@/lib/discord";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const discordId = req.nextUrl.searchParams.get("discord_id");
    const guildId = process.env.DISCORD_GUILD_ID;

    if (!discordId || !/^\d{17,20}$/.test(discordId.trim())) {
      return NextResponse.json(
        { success: false, error: "Invalid Discord ID" },
        { status: 400 }
      );
    }

    const cleanDiscordId = discordId.trim();

    // Check if already verified in Supabase
    let isAlreadyVerified = false;
    let verifiedAt: string | null = null;
    try {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from("verifications")
        .select("verified_at")
        .eq("discord_id", cleanDiscordId)
        .maybeSingle();

      if (data) {
        isAlreadyVerified = true;
        verifiedAt = data.verified_at;
      }
    } catch (e) {
      console.warn("Could not check existing verification:", e);
    }

    let memberResult = null;
    let guild = null;

    if (guildId && process.env.DISCORD_BOT_TOKEN) {
      [memberResult, guild] = await Promise.all([
        getDiscordMember(guildId, cleanDiscordId),
        getDiscordGuild(guildId),
      ]);
    }

    const member = memberResult?.member ?? null;

    return NextResponse.json({
      success: true,
      member: member
        ? {
            id: member.user.id,
            username: member.user.username,
            global_name: member.user.global_name,
            avatar: member.user.avatar
              ? `https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.png?size=128`
              : `https://cdn.discordapp.com/embed/avatars/${parseInt(member.user.id) % 5}.png`,
            joined_at: member.joined_at,
          }
        : null,
      guild: guild
        ? {
            id: guild.id,
            name: guild.name,
            icon: guild.icon
              ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`
              : null,
          }
        : null,
      isAlreadyVerified,
      verifiedAt,
    });
  } catch (error) {
    console.error("Error in member lookup API:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch member details" },
      { status: 500 }
    );
  }
}
