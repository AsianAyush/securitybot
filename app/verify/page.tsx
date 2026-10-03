"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Server,
  Lock,
  Wifi,
  ExternalLink,
  ChevronRight,
  Fingerprint,
} from "lucide-react";

interface MemberInfo {
  id: string;
  username: string;
  global_name?: string | null;
  avatar: string;
  joined_at?: string;
}

interface GuildInfo {
  id: string;
  name: string;
  icon: string | null;
}

type VerificationStatus = "idle" | "verifying" | "success" | "error";

function VerifyContent() {
  const searchParams = useSearchParams();
  const rawDiscordId = searchParams.get("discord_id");

  const [discordId, setDiscordId] = useState<string>("");
  const [member, setMember] = useState<MemberInfo | null>(null);
  const [guild, setGuild] = useState<GuildInfo | null>(null);
  const [isAlreadyVerified, setIsAlreadyVerified] = useState<boolean>(false);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);

  const [status, setStatus] = useState<VerificationStatus>("idle");
  const [activeStep, setActiveStep] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [errorCode, setErrorCode] = useState<string>("");
  const [errorDetails, setErrorDetails] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (rawDiscordId) {
      const sanitized = rawDiscordId.trim();
      setDiscordId(sanitized);

      // Fetch member preview & guild info
      fetch(`/api/member?discord_id=${encodeURIComponent(sanitized)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setMember(data.member);
            setGuild(data.guild);
            if (data.isAlreadyVerified) {
              setIsAlreadyVerified(true);
            }
          }
        })
        .catch((err) => {
          console.warn("Could not load preview details:", err);
        })
        .finally(() => {
          setInitialLoading(false);
        });
    } else {
      setInitialLoading(false);
    }
  }, [rawDiscordId]);

  const handleStartVerification = async () => {
    if (!discordId) return;

    setStatus("verifying");
    setErrorMessage("");
    setErrorCode("");
    setErrorDetails(null);
    setActiveStep(1);

    // Step animation interval simulation for better user feedback
    const stepTimer1 = setTimeout(() => setActiveStep(2), 500);
    const stepTimer2 = setTimeout(() => setActiveStep(3), 1100);

    try {
      const response = await fetch("/api/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ discord_id: discordId }),
      });

      const data = await response.json();

      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setActiveStep(4);

      if (response.ok && data.success) {
        setTimeout(() => {
          setStatus("success");
          setIsAlreadyVerified(true);
        }, 500);
      } else {
        setStatus("error");
        setErrorCode(data.code || "VERIFICATION_FAILED");
        setErrorMessage(
          data.error ||
            "Verification was rejected by security filters. Please check your network and retry."
        );
        if (data.details) {
          setErrorDetails(data.details);
        }
      }
    } catch (err: unknown) {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setStatus("error");
      setErrorCode("NETWORK_ERROR");
      setErrorMessage(
        "Network connection error while contacting verification server. Please retry."
      );
    }
  };

  const stepsList = [
    { title: "Network Header Extraction", desc: "Analyzing reverse proxy & client signature" },
    { title: "ProxyCheck.io Threat Scan", desc: "Filtering VPNs, proxies, and hosting datacenters" },
    { title: "Multi-Account IP Integrity", desc: "Enforcing 1-account-per-IP integrity rule" },
    { title: "Discord Role Synchronization", desc: "Provisioning verified server roles" },
  ];

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 bg-cyber-grid">
      {/* Background radial gradient glow */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[550px] w-[550px] rounded-full bg-indigo-600/10 blur-[130px]" />
        <div className="h-[400px] w-[400px] rounded-full bg-cyan-600/10 blur-[120px] -translate-y-24" />
      </div>

      <header className="relative z-10 mb-8 text-center flex flex-col items-center">
        <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full glass-card border border-indigo-500/20 text-indigo-300 text-xs font-semibold tracking-wider uppercase mb-3 glow-brand">
          <Shield className="w-3.5 h-3.5 text-indigo-400" />
          <span>SecuritySTEX Shield Gateway</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-100 to-indigo-300 tracking-tight">
          Discord Account Verification
        </h1>
        <p className="mt-2 text-sm text-slate-400 max-w-md">
          Automated multi-account and VPN defense protecting your Discord community.
        </p>
      </header>

      {/* Main Container */}
      <main className="relative z-10 w-full max-w-lg">
        {/* Missing Discord ID Warning */}
        {!discordId && !initialLoading && (
          <div className="glass-panel rounded-2xl p-6 sm:p-8 text-center border-amber-500/30">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Missing Verification Link</h2>
            <p className="text-sm text-slate-300 mb-6 leading-relaxed">
              No Discord identifier was detected. To verify your account, please return to Discord
              and click the <strong>&ldquo;Verify&rdquo;</strong> button generated in your server&rsquo;s verification channel.
            </p>
            <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-800 text-left text-xs text-slate-400 space-y-2">
              <p className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-indigo-400" /> Expected URL Format:
              </p>
              <code className="block bg-slate-950 px-3 py-2 rounded font-mono text-indigo-300 overflow-x-auto">
                https://your-domain.com/verify?discord_id=YOUR_USER_ID
              </code>
            </div>
          </div>
        )}

        {/* Verification Card with Valid Discord ID */}
        {discordId && (
          <div className="glass-panel rounded-3xl p-6 sm:p-8 transition-all duration-300">
            {/* Guild & User Card Header */}
            <div className="flex items-center justify-between pb-6 mb-6 border-b border-slate-800/80">
              <div className="flex items-center gap-3.5">
                {member?.avatar ? (
                  <img
                    src={member.avatar}
                    alt={member.username}
                    className="w-12 h-12 rounded-2xl border-2 border-indigo-500/40 shadow-lg object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                    <Fingerprint className="w-6 h-6" />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-base">
                      {member?.global_name || member?.username || "Discord Member"}
                    </span>
                    {isAlreadyVerified && (
                      <span className="text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Verified
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-mono text-slate-400">
                    ID: <span className="text-indigo-300">{discordId}</span>
                  </p>
                </div>
              </div>

              {guild && (
                <div className="hidden sm:flex items-center gap-2 text-right">
                  <div>
                    <span className="text-xs font-medium text-slate-300 block">
                      {guild.name}
                    </span>
                    <span className="text-[10px] text-slate-500 flex items-center justify-end gap-1">
                      <Server className="w-2.5 h-2.5" /> Target Server
                    </span>
                  </div>
                  {guild.icon ? (
                    <img
                      src={guild.icon}
                      alt={guild.name}
                      className="w-8 h-8 rounded-lg border border-slate-700 object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 text-xs font-bold">
                      {guild.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* STATE: IDLE */}
            {status === "idle" && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                    <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                      <Wifi className="w-5 h-5" />
                    </div>
                    <div className="text-xs">
                      <span className="font-semibold text-slate-200 block">
                        Proxy &amp; VPN Protection
                      </span>
                      <span className="text-slate-400">
                        Ensures connection is genuine residential internet.
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                    <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                      <Lock className="w-5 h-5" />
                    </div>
                    <div className="text-xs">
                      <span className="font-semibold text-slate-200 block">
                        Multiple Account Prevention Security System
                      </span>
                      <span className="text-slate-400">
                        IP address and Discord metadata are recorded to prevent alternate raid accounts.
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-xs text-slate-400 bg-indigo-950/20 border border-indigo-900/30 p-3.5 rounded-xl flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                  <span>
                    Your Connection Will be Verified For To Protect Our Community To Provide Better Service
                  </span>
                </div>

                <button
                  id="verify-submit-btn"
                  onClick={handleStartVerification}
                  className="w-full relative group overflow-hidden rounded-xl p-[1px] focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-indigo-600 to-cyan-500 rounded-xl transition-all duration-300 group-hover:opacity-90" />
                  <span className="relative flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-slate-950 font-semibold text-white transition-all duration-200 group-hover:bg-opacity-80">
                    <ShieldCheck className="w-5 h-5 text-indigo-400 group-hover:scale-110 transition-transform" />
                    <span>
                      {isAlreadyVerified ? "Re-Verify / Refresh Roles" : "Verify With SecuritySTEX"}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
                  </span>
                </button>
              </div>
            )}

            {/* STATE: VERIFYING / LOADING */}
            {status === "verifying" && (
              <div className="py-4 space-y-6">
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="relative mb-4">
                    <div className="w-16 h-16 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
                    <Shield className="w-7 h-7 text-indigo-400 absolute inset-0 m-auto" />
                  </div>
                  <h2 className="text-lg font-bold text-white">Analyzing Security Posture</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Validating connection against automated threat criteria...
                  </p>
                </div>

                {/* Progress Steps */}
                <div className="space-y-3 pt-2">
                  {stepsList.map((step, idx) => {
                    const stepNum = idx + 1;
                    const isDone = activeStep > stepNum;
                    const isCurrent = activeStep === stepNum;

                    return (
                      <div
                        key={step.title}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-300 ${
                          isDone
                            ? "bg-emerald-950/20 border-emerald-800/40 text-emerald-300"
                            : isCurrent
                            ? "bg-indigo-950/30 border-indigo-500/40 text-white"
                            : "bg-slate-900/30 border-slate-800/50 text-slate-500 opacity-60"
                        }`}
                      >
                        <div className="shrink-0">
                          {isDone ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                          ) : isCurrent ? (
                            <div className="w-5 h-5 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
                          ) : (
                            <div className="w-5 h-5 rounded-full border border-slate-700 flex items-center justify-center text-[10px]">
                              {stepNum}
                            </div>
                          )}
                        </div>
                        <div className="text-xs">
                          <span className="font-semibold block">{step.title}</span>
                          <span className="text-[11px] text-slate-400">{step.desc}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* STATE: SUCCESS */}
            {status === "success" && (
              <div className="py-2 text-center space-y-5">
                <div className="w-16 h-16 mx-auto rounded-3xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 glow-emerald animate-bounce">
                  <CheckCircle2 className="w-9 h-9" />
                </div>

                <div>
                  <h2 className="text-xl font-extrabold text-white">
                    Verification Complete!
                  </h2>
                  <p className="mt-2 text-sm text-emerald-300/90 font-medium leading-relaxed px-4">
                    Verification completed successfully! You may now close this tab and return to Discord.
                  </p>
                </div>

                <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 text-xs text-left space-y-2.5">
                  <div className="flex justify-between items-center text-slate-300">
                    <span className="text-slate-400">Discord User:</span>
                    <span className="font-semibold text-white">
                      {member?.username || discordId}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-300">
                    <span className="text-slate-400">Server Roles:</span>
                    <span className="font-semibold text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Verified Role Assigned
                    </span>
                  </div>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row gap-3">
                  <a
                    id="return-discord-btn"
                    href="https://discord.com/channels/@me"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-white text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/25"
                  >
                    <span>Open Discord</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>

                  <button
                    id="re-verify-btn"
                    onClick={() => setStatus("idle")}
                    className="py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 font-semibold text-slate-300 text-sm flex items-center justify-center gap-2 transition-all"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Run Check Again</span>
                  </button>
                </div>
              </div>
            )}

            {/* STATE: ERROR */}
            {status === "error" && (
              <div className="py-2 text-center space-y-5">
                <div className="w-16 h-16 mx-auto rounded-3xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 glow-rose">
                  <ShieldAlert className="w-9 h-9" />
                </div>

                <div>
                  <h2 className="text-xl font-extrabold text-white">Verification Rejected</h2>
                  <p className="mt-2 text-xs font-mono uppercase tracking-wider text-rose-400">
                    Code: {errorCode}
                  </p>
                  <p className="mt-2 text-sm text-slate-300 leading-relaxed px-2">
                    {errorMessage}
                  </p>
                </div>

                {errorDetails && (
                  <div className="bg-rose-950/20 border border-rose-900/30 rounded-xl p-3.5 text-xs text-left text-rose-300/80 space-y-1">
                    <p className="font-semibold text-rose-300">Technical Details:</p>
                    {Object.entries(errorDetails).map(([k, v]) => (
                      <p key={k} className="font-mono text-[11px]">
                        {k}: {String(v)}
                      </p>
                    ))}
                  </div>
                )}

                <div className="bg-slate-900/60 rounded-xl p-3.5 border border-slate-800 text-xs text-slate-400 text-left space-y-1.5">
                  <p className="font-semibold text-slate-300">How to resolve this:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    {errorCode === "ALREADY_VERIFIED" && (
                      <>
                        <li>Your Discord account is already registered and verified on this server.</li>
                        <li>If you lost your server roles, please contact a server administrator to have them manually re-applied.</li>
                        <li>Do <strong>not</strong> attempt to create another Discord account — that may trigger the IP duplicate check.</li>
                      </>
                    )}
                    {errorCode === "IP_LIMIT_REACHED" && (
                      <>
                        <li>Your IP address has already been used to register the maximum number of allowed Discord accounts.</li>
                        <li>If you share a network with others in your household, contact server staff and ask for a limit increase.</li>
                        <li>An administrator can run <code>/limit</code> in Discord to raise your IP&apos;s account cap.</li>
                      </>
                    )}
                    {errorCode === "IP_BLACKLISTED" && (
                      <>
                        <li>Your IP address has been administratively blacklisted.</li>
                        <li>Contact the server moderation team to request an unban or review.</li>
                      </>
                    )}
                    {errorCode === "VPN_OR_PROXY_DETECTED" && (
                      <>
                        <li>Disconnect from any active VPN software (NordVPN, ExpressVPN, etc.)</li>
                        <li>Turn off browser extensions or iCloud Private Relay</li>
                        <li>Switch to your standard home WiFi or cellular network</li>
                      </>
                    )}
                    {errorCode === "IP_ALREADY_USED" && (
                      <>
                        <li>This IP address is already bound to another Discord account.</li>
                        <li>If you share a household or network, contact the server staff.</li>
                      </>
                    )}
                    {errorCode !== "ALREADY_VERIFIED" &&
                      errorCode !== "IP_LIMIT_REACHED" &&
                      errorCode !== "VPN_OR_PROXY_DETECTED" &&
                      errorCode !== "IP_ALREADY_USED" &&
                      errorCode !== "IP_BLACKLISTED" && (
                      <>
                        <li>Make sure you have joined the Discord server first.</li>
                        <li>Check that your network connection is stable and retry.</li>
                      </>
                    )}
                  </ul>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row gap-3">
                  <button
                    id="retry-verify-btn"
                    onClick={handleStartVerification}
                    className="flex-1 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-white text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/25"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Try Again</span>
                  </button>

                  <button
                    onClick={() => setStatus("idle")}
                    className="py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 font-semibold text-slate-300 text-sm flex items-center justify-center gap-2 transition-all"
                  >
                    <span>Back to Overview</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="relative z-10 mt-8 text-center text-xs text-slate-500">
        <p>Security STEX Protection Gateway Build by @agentfx_2</p>
      </footer>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#080c14] text-slate-300">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            <span className="text-sm font-medium">Loading SecuritySTEX Gateway...</span>
          </div>
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
