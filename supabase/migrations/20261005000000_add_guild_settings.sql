-- ==============================================================================
-- SecuritySTEX Database Migration: Add guild_settings Table
-- Stores guild-specific configuration such as the designated audit log channel.
-- ==============================================================================

-- 1. Create guild_settings table
CREATE TABLE IF NOT EXISTS public.guild_settings (
    guild_id TEXT PRIMARY KEY,
    log_channel_id TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable Row Level Security
ALTER TABLE public.guild_settings ENABLE ROW LEVEL SECURITY;

-- 3. Allow full access via service_role (used by Next.js server-side and bot)
CREATE POLICY "Allow full access for guild_settings" ON public.guild_settings FOR ALL USING (true) WITH CHECK (true);

-- 4. Document the table
COMMENT ON TABLE public.guild_settings IS 'Stores guild-specific configuration for the SecuritySTEX bot, including the designated audit log channel.';
COMMENT ON COLUMN public.guild_settings.guild_id IS 'The Discord guild (server) snowflake ID. Primary key.';
COMMENT ON COLUMN public.guild_settings.log_channel_id IS 'The Discord channel ID where audit log embeds should be sent. NULL means logging is disabled.';
COMMENT ON COLUMN public.guild_settings.updated_at IS 'UTC timestamp when this setting was last modified.';
