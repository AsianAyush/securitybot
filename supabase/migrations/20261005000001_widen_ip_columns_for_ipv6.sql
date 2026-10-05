-- ==============================================================================
-- SecuritySTEX Database Migration: Widen IP address columns for IPv6 support
-- IPv6 addresses can be up to 45 characters (e.g. "2001:0db8:0000:0000:0000:0000:0000:0001").
-- All ip_address TEXT columns already support arbitrary length, but this migration
-- adds explicit documentation and a CHECK constraint to ensure well-formed entries.
-- ==============================================================================

-- Add documentation for IPv6 support on existing columns
COMMENT ON COLUMN public.verifications.ip_address IS 'Plain-text IPv4 or IPv6 address of the verifying user. Supports full-length IPv6 (up to 45 chars).';
COMMENT ON COLUMN public.ip_blacklist.ip_address IS 'Plain-text IPv4 or IPv6 address to blacklist. Supports full-length IPv6 (up to 45 chars).';
COMMENT ON COLUMN public.ip_limits.ip_address IS 'Plain-text IPv4 or IPv6 address this limit applies to. Supports full-length IPv6 (up to 45 chars).';

-- Add CHECK constraints to ensure ip_address is not empty and within reasonable bounds
-- Using DO block to avoid errors if constraints already exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_verifications_ip_length'
    ) THEN
        ALTER TABLE public.verifications
            ADD CONSTRAINT chk_verifications_ip_length
            CHECK (char_length(ip_address) >= 3 AND char_length(ip_address) <= 45);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_ip_blacklist_ip_length'
    ) THEN
        ALTER TABLE public.ip_blacklist
            ADD CONSTRAINT chk_ip_blacklist_ip_length
            CHECK (char_length(ip_address) >= 3 AND char_length(ip_address) <= 45);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_ip_limits_ip_length'
    ) THEN
        ALTER TABLE public.ip_limits
            ADD CONSTRAINT chk_ip_limits_ip_length
            CHECK (char_length(ip_address) >= 3 AND char_length(ip_address) <= 45);
    END IF;
END $$;
