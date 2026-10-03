-- ==============================================================================
-- SecuritySTEX Database Migration: Create Verifications Table
-- ==============================================================================

-- 1. Create the verifications table
CREATE TABLE IF NOT EXISTS public.verifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    discord_id TEXT UNIQUE NOT NULL,
    ip_hash TEXT UNIQUE NOT NULL,
    verified_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.verifications ENABLE ROW LEVEL SECURITY;

-- 3. Create indices for high performance lookups
CREATE INDEX IF NOT EXISTS idx_verifications_discord_id ON public.verifications (discord_id);
CREATE INDEX IF NOT EXISTS idx_verifications_ip_hash ON public.verifications (ip_hash);

-- 4. Document columns and table
COMMENT ON TABLE public.verifications IS 'Stores verified Discord users and their hashed IP signatures for anti-alt security enforcement.';
COMMENT ON COLUMN public.verifications.id IS 'Unique identifier for the verification entry';
COMMENT ON COLUMN public.verifications.discord_id IS 'Unique Discord snowflake user ID';
COMMENT ON COLUMN public.verifications.ip_hash IS 'HMAC-SHA256 salted hash of the user public IP address';
COMMENT ON COLUMN public.verifications.verified_at IS 'UTC timestamp when the user completed verification';

-- 5. (Optional) Read-only policy for authenticated dashboards if needed in future
-- By default with RLS enabled and no public policies, anon access is blocked and 
-- only service_role (used by Next.js API routes) can perform read/write operations.
