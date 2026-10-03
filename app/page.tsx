"use client";

import React from "react";
import {
  Shield,
  ShieldCheck,
  Lock,
  Wifi,
  Bot,
  Terminal,
  ExternalLink,
  Sparkles,
  Zap,
  MessageSquare,
  Users,
} from "lucide-react";

export default function HomePage() {
  const features = [
    {
      icon: <Wifi className="w-6 h-6 text-cyan-400" />,
      title: "Real-Time VPN & Proxy Defense",
      desc: "Scans incoming connection signatures in real time, immediately mitigating commercial VPNs, TOR exit nodes, and datacenter proxies.",
    },
    {
      icon: <Lock className="w-6 h-6 text-indigo-400" />,
      title: "Multiple Account Prevention",
      desc: "Strictly enforces single account integrity per network user with automated blacklist screening and dynamic access controls.",
    },
    {
      icon: <ShieldCheck className="w-6 h-6 text-emerald-400" />,
      title: "Encrypted Audit Logging",
      desc: "Secure, tamper-resistant audit records and administrative security feeds with real-time threat dispatching.",
    },
    {
      icon: <Zap className="w-6 h-6 text-amber-400" />,
      title: "Instant Role Provisioning",
      desc: "Automated verification gateway that securely provisions server access and handles quarantined role transitions in milliseconds.",
    },
  ];

  return (
    <div className="relative min-h-screen bg-cyber-grid text-slate-100 flex flex-col justify-between">
      {/* Background ambient lighting */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-[-100px] left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-indigo-600/15 rounded-full blur-[140px]" />
        <div className="absolute top-[300px] right-[10%] w-[400px] h-[300px] bg-cyan-600/10 rounded-full blur-[120px]" />
      </div>

      {/* Navigation Bar */}
      <nav className="relative z-20 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-extrabold text-lg tracking-tight text-white">
                Security<span className="text-indigo-400">STEX</span>
              </span>
              <span className="hidden sm:inline-block ml-2 text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                Enterprise Gateway
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Gateway Online</span>
            </div>
            <a
              href="https://discord.gg/A57nBQ86Jd"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-white transition-colors flex items-center gap-1"
            >
              <span>Support</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 max-w-6xl mx-auto px-6 py-12 sm:py-20 flex-1">
        <div className="text-center max-w-3xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-card border border-indigo-500/30 text-indigo-300 text-xs font-semibold glow-brand">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Enterprise Discord Server Protection</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-indigo-300 tracking-tight leading-tight">
            Stop Discord Raids &amp; Alt Accounts with Certainty
          </h1>

          <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-2xl mx-auto">
            SecuritySTEX delivers an impenetrable security gateway that filters VPNs, proxies, and
            unauthorized multi-accounts in real time before granting access to your community.
          </p>

          {/* Prominent Contact Developer Button */}
          <div className="pt-6 max-w-xl mx-auto flex flex-col items-center">
            <a
              id="contact-developer-discord-btn"
              href="https://discord.gg/A57nBQ86Jd"
              target="_blank"
              rel="noopener noreferrer"
              className="relative group overflow-hidden rounded-2xl p-[1px] focus:outline-none focus:ring-2 focus:ring-indigo-400 w-full sm:w-auto transition-transform active:scale-[0.99]"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-500 rounded-2xl transition-all duration-300 group-hover:opacity-90 animate-pulse" />
              <span className="relative flex items-center justify-center gap-3 px-8 py-4 rounded-2xl bg-slate-950/90 font-semibold text-white transition-all duration-200 group-hover:bg-opacity-70 shadow-2xl">
                <svg
                  className="w-6 h-6 text-[#5865F2] group-hover:scale-110 transition-transform fill-current"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
                <div className="text-left">
                  <div className="text-xs uppercase tracking-wider text-indigo-300 font-bold">
                    Join Discord Server
                  </div>
                  <div className="text-sm sm:text-base font-extrabold text-white">
                    Contact @agentfx_2 via Tickets
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </span>
            </a>
            <p className="mt-3 text-xs text-slate-400 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-indigo-400" />
              <span>Official Developer &amp; Technical Assistance Gateway</span>
            </p>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="mt-20 grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((item) => (
            <div
              key={item.title}
              className="glass-panel p-6 rounded-2xl hover:border-indigo-500/40 transition-all duration-300 group"
            >
              <div className="w-12 h-12 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                {item.icon}
              </div>
              <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>

        {/* Bot Companion & Administrative Features Card */}
        <div className="mt-16 glass-panel rounded-3xl p-8 border border-slate-800">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-800">
            <div>
              <div className="inline-flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-2">
                <Bot className="w-4 h-4" />
                <span>Discord Integration</span>
              </div>
              <h2 className="text-2xl font-bold text-white">Automated Bot &amp; Verification Gateway</h2>
              <p className="text-sm text-slate-400 mt-1">
                Deploy interactive verification embeds directly to your Discord server channels.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs font-medium text-indigo-300 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" /> Fully Automated
              </span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div className="space-y-3">
              <h4 className="font-semibold text-slate-200 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-indigo-400" /> Administrative Commands
              </h4>
              <ul className="space-y-2 text-xs text-slate-400">
                <li className="flex items-start gap-2 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                  <code className="text-indigo-300 font-mono font-bold">/setup-verify</code>
                  <span>Deploys the official verification portal into the current channel.</span>
                </li>
                <li className="flex items-start gap-2 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                  <code className="text-indigo-300 font-mono font-bold">/limit</code>
                  <span>Configures custom account thresholds per IP for household exemptions.</span>
                </li>
                <li className="flex items-start gap-2 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                  <code className="text-indigo-300 font-mono font-bold">/blockip &amp; /unblockip</code>
                  <span>Directly manages network blacklist rules for high-threat actors.</span>
                </li>
              </ul>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold text-slate-200 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> Automated Safeguards
              </h4>
              <ul className="space-y-2 text-xs text-slate-400">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Ephemeral button responses prevent user link tampering or sniffing.</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Validates server membership prior to authorization.</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Automated audit logging and real-time security alerts.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-20 border-t border-slate-800/80 bg-slate-950/80 px-6 py-6 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-500" />
            <span className="font-semibold text-slate-400">SecuritySTEX System</span>
            <span>&bull; Enterprise Discord Verification Gateway</span>
          </div>
          <div>
            <p>Security STEX Protection Gateway Build by @agentfx_2</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

