import { isLocalOrPrivateIp } from "./ip";

export interface ProxyCheckResult {
  isClean: boolean;
  isProxy: boolean;
  type?: string;
  risk?: number;
  country?: string;
  provider?: string;
  error?: string;
  raw?: unknown;
}

/**
 * Checks an IP address against the ProxyCheck.io v2 API to detect VPNs, Proxies, TOR nodes, and Datacenters.
 */
export async function checkIpWithProxyCheck(ip: string): Promise<ProxyCheckResult> {
  const apiKey = process.env.PROXYCHECK_API_KEY;

  // In local development, private / loopback IPs cannot be looked up by external APIs
  if (isLocalOrPrivateIp(ip)) {
    // Allow local development without failing
    return {
      isClean: true,
      isProxy: false,
      type: "Local/Private Development IP",
      risk: 0,
      country: "Localhost",
      provider: "Local Environment",
    };
  }

  // Construct ProxyCheck query
  // &vpn=1 (enables deep VPN detection)
  // &asn=1 (returns ASN and network operator)
  // &risk=1 (returns risk score 0-100)
  const url = new URL(`https://proxycheck.io/v2/${encodeURIComponent(ip)}`);
  url.searchParams.set("vpn", "1");
  url.searchParams.set("asn", "1");
  url.searchParams.set("risk", "1");

  if (apiKey && apiKey !== "YOUR_PROXYCHECK_API_KEY") {
    url.searchParams.set("key", apiKey);
  }

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "User-Agent": "SecuritySTEX-DiscordVerification/1.0",
      },
      next: { revalidate: 300 }, // Cache lookups for 5 minutes
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.error(
        `[ProxyCheck] HTTP Error: ${response.status} ${response.statusText}`,
        errBody
      );
      // Fallback: If ProxyCheck is temporarily unreachable, decide whether to allow or block
      return {
        isClean: true,
        isProxy: false,
        error: `ProxyCheck HTTP ${response.status}`,
      };
    }

    const data = await response.json();

    if (data.status === "error") {
      console.error("[ProxyCheck] API Error:", data.message);
      return {
        isClean: true,
        isProxy: false,
        error: data.message || "ProxyCheck API error",
      };
    }

    const ipData = data[ip];
    if (!ipData) {
      return {
        isClean: true,
        isProxy: false,
      };
    }

    const isProxy = ipData.proxy === "yes";
    const risk = typeof ipData.risk === "number" ? ipData.risk : 0;
    const isHighRisk = risk >= 67; // Common threshold for risky hosting/datacenter traffic

    const isClean = !isProxy && !isHighRisk;

    return {
      isClean,
      isProxy: isProxy || isHighRisk,
      type: ipData.type || (isProxy ? "Proxy/VPN" : "Residential"),
      risk,
      country: ipData.country || ipData.isocode,
      provider: ipData.provider || ipData.organisation,
      raw: ipData,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ProxyCheck] Network error checking IP:", message);
    return {
      isClean: true,
      isProxy: false,
      error: message,
    };
  }
}
