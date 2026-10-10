-- ==============================================================================
-- SecuritySTEX Database Migration: Ensure IPv6 TEXT Storage & Guild Roles
-- ==============================================================================

-- 1. Ensure all IP address columns are TEXT type (supports full IPv6 up to 45 chars)
ALTER TABLE public.verifications ALTER COLUMN ip_address TYPE TEXT;
ALTER TABLE public.ip_limits ALTER COLUMN ip_address TYPE TEXT;
ALTER TABLE public.ip_blacklist ALTER COLUMN ip_address TYPE TEXT;

-- 2. Add dynamic role configuration columns to guild_settings
ALTER TABLE public.guild_settings ADD COLUMN IF NOT EXISTS verified_role_id TEXT;
ALTER TABLE public.guild_settings ADD COLUMN IF NOT EXISTS unverified_role_id TEXT;

-- 3. Create audit_logs table with TEXT ip_address for persistent audit records
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    guild_id TEXT NOT NULL,
    discord_id TEXT NOT NULL,
    discord_username TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    event_type TEXT NOT NULL,
    status TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_guild ON public.audit_logs (guild_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_discord ON public.audit_logs (discord_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip ON public.audit_logs (ip_address);

-- 4. Enable Row Level Security (RLS) on audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow full access for audit_logs" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);

-- 5. Document new columns and table
COMMENT ON TABLE public.audit_logs IS 'Persistent audit logging for SecuritySTEX verification attempts and security events.';
COMMENT ON COLUMN public.guild_settings.verified_role_id IS 'Dynamic Discord role ID assigned to verified members.';
COMMENT ON COLUMN public.guild_settings.unverified_role_id IS 'Optional Discord role ID removed when a member completes verification.';
