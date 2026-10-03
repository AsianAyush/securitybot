-- ==============================================================================
-- SecuritySTEX Database Migration: Add ip_limits Table
-- Allows administrators to define custom per-IP maximum account registration limits.
-- ==============================================================================

-- 1. Create ip_limits table
CREATE TABLE IF NOT EXISTS public.ip_limits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ip_address TEXT UNIQUE NOT NULL,
    max_accounts INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_ip_limits_ip ON public.ip_limits (ip_address);

-- 3. Enable Row Level Security
ALTER TABLE public.ip_limits ENABLE ROW LEVEL SECURITY;

-- 4. Allow full access via service_role (used by Next.js server-side and bot)
CREATE POLICY "Allow full access for ip_limits" ON public.ip_limits FOR ALL USING (true) WITH CHECK (true);

-- 5. Document the table
COMMENT ON TABLE public.ip_limits IS 'Stores administrator-defined per-IP maximum account registration limits for the SecuritySTEX verification gateway.';
COMMENT ON COLUMN public.ip_limits.ip_address IS 'The plain-text IP address this limit applies to.';
COMMENT ON COLUMN public.ip_limits.max_accounts IS 'Maximum number of Discord accounts that can verify from this IP address. Defaults to 1.';
