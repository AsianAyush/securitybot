# 🛡️ SecuritySTEX - Secure Discord Verification System

A high-performance, production-ready Discord verification web app and bot system built with **Next.js (App Router, TypeScript, Tailwind CSS)**, **Supabase PostgreSQL**, and **Discord.js v14**.

---

## 🌟 Key Features

- **🌐 Real-Time VPN, Proxy & Datacenter Filtering**: Direct integration with **ProxyCheck.io** to block commercial VPNs, proxies, and TOR exit nodes.
- **🔒 Cryptographic Anti-Alt Protection**: User IP addresses are never saved in raw plaintext. Every IP is salted and hashed using **HMAC-SHA256**. The system enforces a strict 1-account-per-IP policy in Supabase.
- **⚡ Automated Discord Role Synchronization**: Seamlessly assigns the **Verified** role and removes any quarantined/unverified roles directly via Discord REST API v10.
- **🤖 Companion Discord Bot**: Built with `discord.js` v14. Supports `!setup-verify` and `/setup-verify` commands to post a persistent verification embed with interactive buttons that generate secure ephemeral verification links.
- **✨ Cyberpunk Dark Mode UI**: Built with glassmorphism, responsive Tailwind CSS styling, animated security posture checklist, and informative error messages with troubleshooting advice.

---

## 🏗️ Architecture & Verification Flow

```
[Discord Server]
       │
       ▼ (User clicks "Verify Now" in welcome channel)
[Discord Bot]
       │
       ▼ (Sends Ephemeral Message with unique link)
https://stexsecurity.vercel.app/verify?discord_id=<USER_SNOWFLAKE>
       │
       ▼ (User opens browser gateway)
[Next.js App Router Frontend]
       │
       ▼ (POST /api/verify)
[Next.js Verification API Engine]
       ├── 1. Extract Real Public IP (cf-connecting-ip, x-forwarded-for)
       ├── 2. ProxyCheck.io Threat Intelligence Scan (VPN/Proxy/TOR)
       ├── 3. HMAC-SHA256 Salted IP Hash
       ├── 4. Supabase Anti-Alt Integrity Check (Reject if IP belongs to another user)
       ├── 5. Supabase Upsert Verification Record
       └── 6. Discord REST API (PUT verified role, DELETE unverified role)
       │
       ▼
[User Verified & Roles Updated in Discord Server]
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **Supabase**: Account & Project (or use the preconfigured SecuritySTEX project)
- **Discord Developer Portal**: Bot token & Application ID
- **ProxyCheck.io**: Free API key (optional for local testing, recommended for production)

### 2. Installation

Clone or navigate to the project directory:
```bash
cd securitySTEX
npm install
```

### 3. Database Setup (Supabase)

Run the SQL migration in your Supabase SQL Editor (or apply via Supabase CLI):

```sql
-- 1. Create the verifications table
CREATE TABLE IF NOT EXISTS public.verifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    discord_id TEXT UNIQUE NOT NULL,
    ip_hash TEXT UNIQUE NOT NULL,
    verified_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.verifications ENABLE ROW LEVEL SECURITY;

-- 3. Create high performance indices
CREATE INDEX IF NOT EXISTS idx_verifications_discord_id ON public.verifications (discord_id);
CREATE INDEX IF NOT EXISTS idx_verifications_ip_hash ON public.verifications (ip_hash);
```

### 4. Configure Environment Variables

Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Fill in the required variables:
```env
# Web application URL (Production default: https://stexsecurity.vercel.app)
NEXT_PUBLIC_APP_URL="https://stexsecurity.vercel.app"

# Supabase
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"

# ProxyCheck.io
PROXYCHECK_API_KEY="your-proxycheck-api-key"

# Discord Bot Credentials
DISCORD_BOT_TOKEN="your-discord-bot-token"
DISCORD_CLIENT_ID="your-bot-client-id"
DISCORD_GUILD_ID="your-target-server-id"
DISCORD_VERIFIED_ROLE_ID="your-verified-role-id"
DISCORD_UNVERIFIED_ROLE_ID="your-unverified-role-id"

# Anti-Alt Secret Salt
IP_HASH_SALT="your-custom-secret-salt-key"
```

---

## ⚙️ Discord Bot & Server Configuration

### Discord Developer Portal Setup:
1. Go to [Discord Developer Portal](https://discord.com/developers/applications).
2. Create an Application, navigate to the **Bot** tab, and generate a **Bot Token**.
3. Under **Privileged Gateway Intents**, enable:
   - ✅ **Server Members Intent** (required to check and modify member roles)
   - ✅ **Message Content Intent** (required for `!setup-verify` command)
4. Under **OAuth2 > URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Manage Roles`, `Send Messages`, `Embed Links`, `Use External Emojis`, `Read Message History`
   - Copy the generated URL to invite the bot to your server.

### ⚠️ CRITICAL Discord Server Role Hierarchy:
In Discord, a bot can **only manage roles that are positioned BELOW the bot's own highest role**.
1. Open **Discord Server Settings > Roles**.
2. Drag the **SecuritySTEX Bot** role so that it is positioned **ABOVE** the `@Verified` and `@Unverified` roles.
3. If the bot's role is below the target role, Discord will return a `403 Missing Permissions` error!

---

## 🏃 Running the Application

### Running the Next.js Web App:
```bash
# Start local development server (port 3000)
npm run dev

# Or build and run for production
npm run build
npm start
```

### Running the Discord Bot:
```bash
# Start the bot standalone
npm run bot

# Or run with live file reloading
npm run bot:dev
```

### Setting Up the Verification Embed in Discord:
1. Go to your server's verification channel (e.g., `#verify` or `#welcome`).
2. Run either:
   - Prefix command: `!setup-verify`
   - Slash command: `/setup-verify`
3. The bot will delete the trigger message and post the permanent verification embed with the interactive **Verify Now** button.

---

## 📂 Project Structure

```
securitySTEX/
├── app/
│   ├── api/
│   │   ├── member/
│   │   │   └── route.ts          # Fetches Discord user & guild preview metadata
│   │   └── verify/
│   │       └── route.ts          # Main verification endpoint (IP, ProxyCheck, Supabase, Roles)
│   ├── verify/
│   │   └── page.tsx              # Modern dark-mode verification gateway UI
│   ├── globals.css               # Cyber grid, glassmorphism, animations
│   ├── layout.tsx                # App root layout with SEO metadata
│   └── page.tsx                  # Landing page & interactive verification sandbox
├── bot/
│   └── index.ts                  # Standalone discord.js v14 verification bot
├── lib/
│   ├── database.types.ts         # Supabase TypeScript schema definitions
│   ├── discord.ts                # Discord REST API client (roles, members, guild info)
│   ├── ip.ts                     # Real IP header parser and HMAC-SHA256 hasher
│   ├── proxycheck.ts             # ProxyCheck.io API integration
│   └── supabase.ts               # Singleton Supabase admin client (Service Role)
├── supabase/
│   └── migrations/
│       └── 20261002000000_create_verifications.sql
├── .env.example                  # Environment configuration template
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

---

## 🛡️ Security Best Practices

1. **Raw IP Privacy**: User IP addresses are never written to database disks in raw form; only `crypto.createHmac('sha256', salt).update(ip).digest('hex')` hashes are persisted.
2. **Reverse Proxy Protection**: Evaluates `cf-connecting-ip` from Cloudflare and parses multi-hop `x-forwarded-for` arrays safely, ignoring spoofed client-side headers.
3. **Multi-Account Enforcement**: Rejects incoming verification attempts if the computed IP hash is already bound to a different Discord snowflake.
4. **Service Role Security**: The Supabase Service Role Key is used exclusively on the server (`lib/supabase.ts` and Next.js route handlers) and is never exposed in client bundles.

---

## 📄 License
MIT License. Built for secure Discord server operations.
