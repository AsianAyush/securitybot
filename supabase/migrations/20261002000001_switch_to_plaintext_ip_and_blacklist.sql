-- ==============================================================================
-- SecuritySTEX Database Migration: Switch to Plain-Text IP & IP Blacklist
-- ==============================================================================

-- 1. Create or replace verifications table
DROP TABLE IF EXISTS public.verifications CASCADE;
CREATE TABLE public.verifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    discord_id TEXT UNIQUE NOT NULL,
    discord_username TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    verified_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_verifications_ip ON public.verifications (ip_address);
CREATE INDEX IF NOT EXISTS idx_verifications_discord_id ON public.verifications (discord_id);

ALTER TABLE public.verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow full access for verifications" ON public.verifications FOR ALL USING (true) WITH CHECK (true);

-- 2. Create or replace ip_blacklist table
DROP TABLE IF EXISTS public.ip_blacklist CASCADE;
CREATE TABLE public.ip_blacklist (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ip_address TEXT UNIQUE NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ip_blacklist_ip ON public.ip_blacklist (ip_address);

ALTER TABLE public.ip_blacklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow full access for ip_blacklist" ON public.ip_blacklist FOR ALL USING (true) WITH CHECK (true);
