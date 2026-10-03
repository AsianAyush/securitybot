import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  ButtonInteraction,
  Message,
} from "discord.js";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { Database } from "../lib/database.types";

// Load environment variables from .env.local or .env
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
let SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_KEY || SUPABASE_KEY === "your-supabase-service-role-key-here") {
  SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn("⚠️ Warning: Supabase credentials missing. IP blacklisting database commands may fail.");
}

const supabase = createClient<Database>(SUPABASE_URL || "http://localhost:54321", SUPABASE_KEY || "dummy", {
  auth: { persistSession: false, autoRefreshToken: false },
});

if (!BOT_TOKEN) {
  console.error("❌ ERROR: DISCORD_BOT_TOKEN is not set in environment variables!");
  console.error("Please add DISCORD_BOT_TOKEN to your .env or .env.local file.");
  process.exit(1);
}

// Initialize Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

/**
 * Creates the persistent verification embed and button
 */
function createVerificationMessage() {
  const embed = new EmbedBuilder()
    .setColor(0x6366f1) // Indigo / Blurple
    .setTitle("🛡️ SecuritySTEX Verification Gateway")
    .setDescription(
      "Welcome to StreetExchanges! To protect our community from automated raids, malicious bots, and alternate accounts, all new members must complete our secure verification process.\n\nClick the **Verify Now** button below to generate your secure one-time verification link."
    )
    .addFields(
      {
        name: "🔒 Multi-Account Prevention",
        value: "Strictly Enforces 1 Discord Account Per User",
        inline: true,
      },
      {
        name: "🌐 VPN & Proxy Filtering",
        value: "Turn Off any VPN or Proxy Else You will not able to register",
        inline: true,
      },
      {
        name: "⚡ Instant Access",
        value: "Verified server roles are assigned automatically once confirmed.",
        inline: false,
      }
    )
    .setFooter({
      text: "SecuritySTEX Secure Gateway Build by @agentfx_2",
    })
    .setTimestamp();

  const verifyButton = new ButtonBuilder()
    .setCustomId("securitystex_verify_button")
    .setLabel("Verify Now")
    .setEmoji("🛡️")
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(verifyButton);

  return { embeds: [embed], components: [row] };
}

// 1. Bot Ready Event & Slash Commands Registration
client.once("ready", async () => {
  console.log(`====================================================`);
  console.log(`🤖 SecuritySTEX Discord Bot is ONLINE!`);
  console.log(`Logged in as: ${client.user?.tag} (ID: ${client.user?.id})`);
  console.log(`Verification Gateway Base URL: ${APP_URL}`);
  console.log(`Target Guild ID: ${GUILD_ID || "Not set"}`);
  console.log(`====================================================`);

  // Register slash commands: /setup-verify, /blockip, /unblockip
  if (BOT_TOKEN && CLIENT_ID) {
    try {
      const rest = new REST({ version: "10" }).setToken(BOT_TOKEN);

      const setupCommand = new SlashCommandBuilder()
        .setName("setup-verify")
        .setDescription("Sets up the SecuritySTEX verification message in this channel")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

      const blockIpCommand = new SlashCommandBuilder()
        .setName("blockip")
        .setDescription("Blacklists a plain-text IP address from verifying")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption((option) =>
          option
            .setName("ip")
            .setDescription("The raw plain-text IP address to blacklist (e.g. 192.168.1.1)")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Optional reason for blacklisting this IP")
            .setRequired(false)
        );

      const unblockIpCommand = new SlashCommandBuilder()
        .setName("unblockip")
        .setDescription("Removes a plain-text IP address from the verification blacklist")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption((option) =>
          option
            .setName("ip")
            .setDescription("The raw plain-text IP address to unblock")
            .setRequired(true)
        );

      const limitCommand = new SlashCommandBuilder()
        .setName("limit")
        .setDescription("Sets a custom maximum account registration limit for an IP address")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addIntegerOption((option) =>
          option
            .setName("max")
            .setDescription("New maximum number of accounts allowed from this IP (e.g. 3)")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100)
        )
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("Target a Discord member — their registered IP will be looked up automatically")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("ip")
            .setDescription("Direct plain-text IP address to set the limit for (e.g. 203.0.113.5)")
            .setRequired(false)
        );

      const commandsJson = [
        setupCommand.toJSON(),
        blockIpCommand.toJSON(),
        unblockIpCommand.toJSON(),
        limitCommand.toJSON(),
      ];

      if (GUILD_ID) {
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
          body: commandsJson,
        });
        console.log(`✅ Registered guild slash commands (/setup-verify, /blockip, /unblockip, /limit) for guild ${GUILD_ID}`);
      } else {
        await rest.put(Routes.applicationCommands(CLIENT_ID), {
          body: commandsJson,
        });
        console.log(`✅ Registered global slash commands (/setup-verify, /blockip, /unblockip, /limit)`);
      }
    } catch (err) {
      console.warn("⚠️ Warning: Failed to register slash commands:", err);
    }
  }
});

// 2. Prefix Command Handler (!setup-verify, !blockip, !unblockip)
client.on("messageCreate", async (message: Message) => {
  if (message.author.bot || !message.guild) return;

  const content = message.content.trim();
  const args = content.split(/\s+/);
  const command = args[0].toLowerCase();

  // Command: !setup-verify
  if (command === "!setup-verify") {
    const member = message.member;
    if (
      !member ||
      (!member.permissions.has(PermissionFlagsBits.Administrator) &&
        !member.permissions.has(PermissionFlagsBits.ManageGuild))
    ) {
      await message.reply({
        content: "❌ You need Administrator or Manage Server permissions to use this command.",
      });
      return;
    }

    try {
      const { embeds, components } = createVerificationMessage();
      if ("send" in message.channel) {
        await message.channel.send({ embeds, components });
      }
      await message.delete().catch(() => {});
      console.log(`[Command] !setup-verify posted in #${(message.channel as any).name || message.channelId} by ${message.author.tag}`);
    } catch (err) {
      console.error("[Command] Failed to post verification message:", err);
      if ("send" in message.channel) {
        await message.channel.send("❌ Failed to post verification message. Please verify bot permissions.");
      }
    }
  }

  // Command: !blockip <ip> [reason]
  if (command === "!blockip") {
    const member = message.member;
    if (
      !member ||
      (!member.permissions.has(PermissionFlagsBits.Administrator) &&
        !member.permissions.has(PermissionFlagsBits.ManageGuild))
    ) {
      await message.reply({
        content: "❌ You need Administrator or Manage Server permissions to use this command.",
      });
      return;
    }

    const targetIp = args[1];
    if (!targetIp) {
      await message.reply("❌ Usage: `!blockip <ip_address> [reason]`");
      return;
    }

    const reason = args.slice(2).join(" ") || "Manually blacklisted by administrator";

    try {
      const { error } = await supabase.from("ip_blacklist").upsert(
        {
          ip_address: targetIp.trim(),
          reason,
          created_at: new Date().toISOString(),
        },
        { onConflict: "ip_address" }
      );

      if (error) {
        throw error;
      }

      const embed = new EmbedBuilder()
        .setColor(0xed4245) // Discord Red
        .setTitle("⛔ IP Address Blacklisted")
        .setDescription(`The IP address \`${targetIp.trim()}\` has been added to the blacklist.`)
        .addFields(
          { name: "Plain-Text IP", value: `\`${targetIp.trim()}\``, inline: true },
          { name: "Reason", value: reason, inline: true },
          { name: "Enforced By", value: `<@${message.author.id}>`, inline: true }
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
      console.log(`[Blacklist] Blocked IP ${targetIp.trim()} by ${message.author.tag}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Blacklist] Error inserting into ip_blacklist:", msg);
      await message.reply(`❌ Database Error blacklisting IP: ${msg}`);
    }
  }

  // Command: !limit <@user|ip> <max>
  // Usage: !limit @User 3   OR   !limit 203.0.113.5 3
  if (command === "!limit") {
    const member = message.member;
    if (
      !member ||
      (!member.permissions.has(PermissionFlagsBits.Administrator) &&
        !member.permissions.has(PermissionFlagsBits.ManageGuild))
    ) {
      await message.reply({
        content: "❌ You need Administrator or Manage Server permissions to use this command.",
      });
      return;
    }

    // Parse: !limit <@mention|ip> <max>
    const targetArg = args[1];
    const maxArg = args[2];

    if (!targetArg || !maxArg) {
      await message.reply("❌ Usage: `!limit <@user | ip_address> <max_accounts>`");
      return;
    }

    const newMax = parseInt(maxArg, 10);
    if (isNaN(newMax) || newMax < 1) {
      await message.reply("❌ `max_accounts` must be a positive integer.");
      return;
    }

    let targetIp: string | null = null;
    const mentionMatch = targetArg.match(/^<@!?(\d{17,20})>$/);

    if (mentionMatch) {
      const targetUserId = mentionMatch[1];
      try {
        const { data, error } = await supabase
          .from("verifications")
          .select("ip_address, discord_username")
          .eq("discord_id", targetUserId)
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          await message.reply(`⚠️ <@${targetUserId}> has not completed verification yet. No IP on record.`);
          return;
        }
        targetIp = data.ip_address;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        await message.reply(`❌ Database error looking up user: ${msg}`);
        return;
      }
    } else {
      targetIp = targetArg.trim();
    }

    if (!targetIp) {
      await message.reply("❌ Could not resolve a target IP address.");
      return;
    }

    try {
      const { error } = await supabase.from("ip_limits").upsert(
        { ip_address: targetIp, max_accounts: newMax },
        { onConflict: "ip_address" }
      );

      if (error) throw error;

      const embed = new EmbedBuilder()
        .setColor(0xfbbf24) // Amber
        .setTitle("🔢 IP Account Limit Updated")
        .setDescription(`Custom account limit applied to IP \`${targetIp}\`.`)
        .addFields(
          { name: "IP Address", value: `\`${targetIp}\``, inline: true },
          { name: "Max Accounts", value: `**${newMax}**`, inline: true },
          { name: "Set By", value: `<@${message.author.id}>`, inline: true }
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
      console.log(`[Limit] !limit set ${targetIp} → max ${newMax} by ${message.author.tag}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await message.reply(`❌ Database error setting IP limit: ${msg}`);
    }
  }

  // Command: !unblockip <ip>
  if (command === "!unblockip") {
    const member = message.member;
    if (
      !member ||
      (!member.permissions.has(PermissionFlagsBits.Administrator) &&
        !member.permissions.has(PermissionFlagsBits.ManageGuild))
    ) {
      await message.reply({
        content: "❌ You need Administrator or Manage Server permissions to use this command.",
      });
      return;
    }

    const targetIp = args[1];
    if (!targetIp) {
      await message.reply("❌ Usage: `!unblockip <ip_address>`");
      return;
    }

    try {
      const { error } = await supabase
        .from("ip_blacklist")
        .delete()
        .eq("ip_address", targetIp.trim());

      if (error) {
        throw error;
      }

      const embed = new EmbedBuilder()
        .setColor(0x57f287) // Discord Green
        .setTitle("✅ IP Address Unblocked")
        .setDescription(`The IP address \`${targetIp.trim()}\` has been removed from the blacklist.`)
        .addFields(
          { name: "Plain-Text IP", value: `\`${targetIp.trim()}\``, inline: true },
          { name: "Unblocked By", value: `<@${message.author.id}>`, inline: true }
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
      console.log(`[Blacklist] Unblocked IP ${targetIp.trim()} by ${message.author.tag}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Blacklist] Error deleting from ip_blacklist:", msg);
      await message.reply(`❌ Database Error unblocking IP: ${msg}`);
    }
  }
});

// 3. Interaction Handler: Slash Commands and Buttons
client.on("interactionCreate", async (interaction) => {
  // Handle Slash Commands
  if (interaction.isChatInputCommand()) {
    const cmdInteraction = interaction as ChatInputCommandInteraction;

    // /setup-verify
    if (cmdInteraction.commandName === "setup-verify") {
      if (
        !cmdInteraction.memberPermissions?.has(PermissionFlagsBits.Administrator) &&
        !cmdInteraction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
      ) {
        await cmdInteraction.reply({
          content: "❌ You need Administrator permissions to use this command.",
          ephemeral: true,
        });
        return;
      }

      const { embeds, components } = createVerificationMessage();
      if (cmdInteraction.channel && "send" in cmdInteraction.channel) {
        await cmdInteraction.channel.send({ embeds, components });
      }
      await cmdInteraction.reply({
        content: "✅ Verification message posted successfully to this channel!",
        ephemeral: true,
      });
      return;
    }

    // /blockip <ip> [reason]
    if (cmdInteraction.commandName === "blockip") {
      if (
        !cmdInteraction.memberPermissions?.has(PermissionFlagsBits.Administrator) &&
        !cmdInteraction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
      ) {
        await cmdInteraction.reply({
          content: "❌ You need Administrator permissions to use this command.",
          ephemeral: true,
        });
        return;
      }

      const targetIp = cmdInteraction.options.getString("ip", true).trim();
      const reason =
        cmdInteraction.options.getString("reason") || "Manually blacklisted by administrator";

      await cmdInteraction.deferReply({ ephemeral: false });

      try {
        const { error } = await supabase.from("ip_blacklist").upsert(
          {
            ip_address: targetIp,
            reason,
            created_at: new Date().toISOString(),
          },
          { onConflict: "ip_address" }
        );

        if (error) {
          throw error;
        }

        const embed = new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle("⛔ IP Address Blacklisted")
          .setDescription(`The plain-text IP \`${targetIp}\` has been added to the blacklist.`)
          .addFields(
            { name: "IP Address", value: `\`${targetIp}\``, inline: true },
            { name: "Reason", value: reason, inline: true },
            { name: "Enforced By", value: `<@${cmdInteraction.user.id}>`, inline: true }
          )
          .setTimestamp();

        await cmdInteraction.editReply({ embeds: [embed] });
        console.log(`[Blacklist] /blockip ${targetIp} by ${cmdInteraction.user.tag}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        await cmdInteraction.editReply(`❌ Database error while blacklisting IP: ${msg}`);
      }
      return;
    }

    // /limit [user] [ip] <max>
    if (cmdInteraction.commandName === "limit") {
      if (
        !cmdInteraction.memberPermissions?.has(PermissionFlagsBits.Administrator) &&
        !cmdInteraction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
      ) {
        await cmdInteraction.reply({
          content: "❌ You need Administrator permissions to use this command.",
          ephemeral: true,
        });
        return;
      }

      const newMax = cmdInteraction.options.getInteger("max", true);
      const targetUser = cmdInteraction.options.getUser("user");
      const directIp = cmdInteraction.options.getString("ip")?.trim() ?? null;

      if (!targetUser && !directIp) {
        await cmdInteraction.reply({
          content: "❌ You must provide either a `user` mention or a direct `ip` address.",
          ephemeral: true,
        });
        return;
      }

      await cmdInteraction.deferReply({ ephemeral: true });

      let targetIp: string | null = directIp;
      let resolvedUsername: string | null = null;

      // If a user mention was provided, look up their IP from the verifications table
      if (targetUser) {
        try {
          const { data, error } = await supabase
            .from("verifications")
            .select("ip_address, discord_username")
            .eq("discord_id", targetUser.id)
            .maybeSingle();

          if (error) throw error;

          if (!data) {
            await cmdInteraction.editReply(
              `⚠️ **${targetUser.username}** (<@${targetUser.id}>) has not completed verification yet. No IP address is on record.`
            );
            return;
          }

          targetIp = data.ip_address;
          resolvedUsername = data.discord_username || targetUser.username;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          await cmdInteraction.editReply(`❌ Database error looking up user's IP: ${msg}`);
          return;
        }
      }

      if (!targetIp) {
        await cmdInteraction.editReply("❌ Could not resolve a target IP address.");
        return;
      }

      try {
        const { error } = await supabase.from("ip_limits").upsert(
          { ip_address: targetIp, max_accounts: newMax },
          { onConflict: "ip_address" }
        );

        if (error) throw error;

        const embed = new EmbedBuilder()
          .setColor(0xfbbf24) // Amber
          .setTitle("🔢 IP Account Limit Updated")
          .setDescription(
            resolvedUsername
              ? `Custom account limit applied to **${resolvedUsername}**'s IP address.`
              : `Custom account limit applied to IP \`${targetIp}\`.`
          )
          .addFields(
            { name: "IP Address", value: `\`${targetIp}\``, inline: true },
            { name: "Max Accounts", value: `**${newMax}**`, inline: true },
            { name: "Set By", value: `<@${cmdInteraction.user.id}>`, inline: true },
            ...(resolvedUsername
              ? [{ name: "Target User", value: `**${resolvedUsername}** (<@${targetUser!.id}>)`, inline: false }]
              : [])
          )
          .setFooter({ text: "Limit takes effect immediately on the next verification attempt." })
          .setTimestamp();

        await cmdInteraction.editReply({ embeds: [embed] });
        console.log(`[Limit] /limit set ${targetIp} → max ${newMax} by ${cmdInteraction.user.tag}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        await cmdInteraction.editReply(`❌ Database error setting IP limit: ${msg}`);
      }
      return;
    }

    // /unblockip <ip>
    if (cmdInteraction.commandName === "unblockip") {
      if (
        !cmdInteraction.memberPermissions?.has(PermissionFlagsBits.Administrator) &&
        !cmdInteraction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
      ) {
        await cmdInteraction.reply({
          content: "❌ You need Administrator permissions to use this command.",
          ephemeral: true,
        });
        return;
      }

      const targetIp = cmdInteraction.options.getString("ip", true).trim();

      await cmdInteraction.deferReply({ ephemeral: false });

      try {
        const { error } = await supabase
          .from("ip_blacklist")
          .delete()
          .eq("ip_address", targetIp);

        if (error) {
          throw error;
        }

        const embed = new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("✅ IP Address Unblocked")
          .setDescription(`The plain-text IP \`${targetIp}\` has been removed from the blacklist.`)
          .addFields(
            { name: "IP Address", value: `\`${targetIp}\``, inline: true },
            { name: "Unblocked By", value: `<@${cmdInteraction.user.id}>`, inline: true }
          )
          .setTimestamp();

        await cmdInteraction.editReply({ embeds: [embed] });
        console.log(`[Blacklist] /unblockip ${targetIp} by ${cmdInteraction.user.tag}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        await cmdInteraction.editReply(`❌ Database error while unblocking IP: ${msg}`);
      }
      return;
    }
  }

  // Handle Verify Button Click
  if (interaction.isButton()) {
    const btnInteraction = interaction as ButtonInteraction;

    if (btnInteraction.customId === "securitystex_verify_button") {
      const user = btnInteraction.user;
      const verifyUrl = `${APP_URL}/verify?discord_id=${user.id}`;

      const ephemeralEmbed = new EmbedBuilder()
        .setColor(0x6366f1)
        .setTitle("🔒 Your Personal Verification Link")
        .setDescription(
          `Hello **${user.username}**! Click the button below to complete verification in your browser.\n\n⚠️ **Important Security Reminders:**\n• **Turn OFF VPN or Proxy:** Residential connections only.\n• **Do not share this link:** It is tied to your Discord account.\n• Once verified, your server roles will be updated automatically.`
        )
        .addFields({
          name: "Direct Gateway URL",
          value: `[Open Verification Gateway](${verifyUrl})`,
        })
        .setFooter({ text: "This link is valid only for your account." });

      const linkButton = new ButtonBuilder()
        .setLabel("Open Verification Gateway")
        .setStyle(ButtonStyle.Link)
        .setURL(verifyUrl)
        .setEmoji("🔗");

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(linkButton);

      await btnInteraction.reply({
        embeds: [ephemeralEmbed],
        components: [row],
        ephemeral: true,
      });

      console.log(`[Verify Request] Sent ephemeral link to ${user.tag} (ID: ${user.id})`);
    }
  }
});

// Start the Discord Bot
client.login(BOT_TOKEN).catch((err) => {
  console.error("❌ Failed to log in to Discord:", err);
});
