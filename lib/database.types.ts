export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      verifications: {
        Row: {
          id: string;
          discord_id: string;
          discord_username: string;
          ip_address: string;
          verified_at: string;
        };
        Insert: {
          id?: string;
          discord_id: string;
          discord_username: string;
          ip_address: string;
          verified_at?: string;
        };
        Update: {
          id?: string;
          discord_id?: string;
          discord_username?: string;
          ip_address?: string;
          verified_at?: string;
        };
        Relationships: [];
      };
      ip_blacklist: {
        Row: {
          id: string;
          ip_address: string;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          ip_address: string;
          reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          ip_address?: string;
          reason?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      ip_limits: {
        Row: {
          id: string;
          ip_address: string;
          max_accounts: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          ip_address: string;
          max_accounts: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          ip_address?: string;
          max_accounts?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      guild_settings: {
        Row: {
          guild_id: string;
          log_channel_id: string | null;
          updated_at: string;
        };
        Insert: {
          guild_id: string;
          log_channel_id?: string | null;
          updated_at?: string;
        };
        Update: {
          guild_id?: string;
          log_channel_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

export type VerificationRow = Database["public"]["Tables"]["verifications"]["Row"];
export type VerificationInsert = Database["public"]["Tables"]["verifications"]["Insert"];
export type VerificationUpdate = Database["public"]["Tables"]["verifications"]["Update"];

export type IpBlacklistRow = Database["public"]["Tables"]["ip_blacklist"]["Row"];
export type IpBlacklistInsert = Database["public"]["Tables"]["ip_blacklist"]["Insert"];
export type IpBlacklistUpdate = Database["public"]["Tables"]["ip_blacklist"]["Update"];

export type IpLimitsRow = Database["public"]["Tables"]["ip_limits"]["Row"];
export type IpLimitsInsert = Database["public"]["Tables"]["ip_limits"]["Insert"];
export type IpLimitsUpdate = Database["public"]["Tables"]["ip_limits"]["Update"];

export type GuildSettingsRow = Database["public"]["Tables"]["guild_settings"]["Row"];
export type GuildSettingsInsert = Database["public"]["Tables"]["guild_settings"]["Insert"];
export type GuildSettingsUpdate = Database["public"]["Tables"]["guild_settings"]["Update"];
