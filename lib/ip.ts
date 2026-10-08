import { NextRequest } from "next/server";

/**
 * Basic IPv4 validator (0.0.0.0 to 255.255.255.255)
 */
const IPV4_REGEX =
  /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

/**
 * Comprehensive IPv6 validator supporting:
 * - Full notation: 2001:0db8:0000:0000:0000:0000:0000:0001
 * - Compressed notation: 2001:db8::1
 * - Loopback: ::1
 * - IPv4-mapped: ::ffff:192.0.2.128
 */
const IPV6_REGEX =
  /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^(([0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4})?::(([0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4})?$/;

/**
 * Normalizes an IPv6 address to its canonical lowercase compressed form.
 * Expands :: shorthand, strips leading zeroes, then re-compresses the longest
 * run of consecutive all-zero groups with ::. This ensures consistent storage
 * and comparison of IPv6 addresses regardless of the input format.
 *
 * @example
 *   normalizeIpv6("2001:0DB8:0000:0000:0000:0000:0000:0001") => "2001:db8::1"
 *   normalizeIpv6("::FFFF:192.168.1.1") => "::ffff:192.168.1.1"
 */
export function normalizeIpv6(raw: string): string {
  if (!raw || typeof raw !== "string") return raw;

  let ip = raw.trim().toLowerCase();

  // Handle IPv4-mapped IPv6 (::ffff:x.x.x.x) — preserve the mapped form
  const v4MappedMatch = ip.match(/^(::ffff:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (v4MappedMatch) {
    return `::ffff:${v4MappedMatch[2]}`;
  }

  // Split on ::
  const halves = ip.split("::");
  if (halves.length > 2) return ip; // malformed

  let groups: string[];

  if (halves.length === 2) {
    const left = halves[0] ? halves[0].split(":") : [];
    const right = halves[1] ? halves[1].split(":") : [];
    const missing = 8 - left.length - right.length;
    const fill: string[] = Array(Math.max(0, missing)).fill("0");
    groups = [...left, ...fill, ...right];
  } else {
    groups = ip.split(":");
  }

  if (groups.length !== 8) return ip; // malformed, return as-is

  // Strip leading zeroes from each group
  groups = groups.map((g) => {
    const stripped = g.replace(/^0+/, "");
    return stripped || "0";
  });

  // Re-compress: find the longest run of consecutive "0" groups
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  let curLen = 0;

  for (let i = 0; i < 8; i++) {
    if (groups[i] === "0") {
      if (curStart === -1) curStart = i;
      curLen++;
      if (curLen > bestLen) {
        bestStart = curStart;
        bestLen = curLen;
      }
    } else {
      curStart = -1;
      curLen = 0;
    }
  }

  if (bestLen >= 2) {
    const before = groups.slice(0, bestStart);
    const after = groups.slice(bestStart + bestLen);
    return `${before.join(":")}::${after.join(":")}`;
  }

  return groups.join(":");
}

/**
 * Strips port numbers, quotes, brackets, and IPv4-mapped IPv6 prefixes if present.
 * Also normalizes IPv6 addresses to canonical lowercase compressed form.
 * Examples:
 * - "192.168.1.1:54321" -> "192.168.1.1"
 * - "[2001:db8::1]:80" -> "2001:db8::1"
 * - "[2001:db8::1]" -> "2001:db8::1"
 * - "::ffff:192.168.1.1" -> "192.168.1.1"
 * - "2001:0DB8:0000:0000:0000:0000:0000:0001" -> "2001:db8::1"
 */
export function sanitizeIp(ip: string): string {
  if (!ip || typeof ip !== "string") return "";
  let cleaned = ip.trim().replace(/^["']|["']$/g, "").trim();

  // Strip brackets from IPv6 with port: [2001:db8::1]:8080
  if (cleaned.startsWith("[") && cleaned.includes("]:")) {
    cleaned = cleaned.substring(1, cleaned.indexOf("]:"));
  } else if (cleaned.startsWith("[") && cleaned.endsWith("]")) {
    cleaned = cleaned.slice(1, -1);
  } else if (
    cleaned.includes(":") &&
    !cleaned.includes("::") &&
    cleaned.split(":").length === 2
  ) {
    // IPv4 with port: 192.168.1.1:8080
    cleaned = cleaned.split(":")[0];
  }

  // Strip IPv4-mapped IPv6 prefix: ::ffff:192.0.2.128 -> 192.0.2.128
  if (cleaned.toLowerCase().startsWith("::ffff:") && cleaned.length > 7) {
    const potentialIpv4 = cleaned.substring(7);
    if (IPV4_REGEX.test(potentialIpv4)) {
      cleaned = potentialIpv4;
    }
  }

  // Normalize IPv6 to canonical compressed lowercase form
  if (cleaned.includes(":") && !IPV4_REGEX.test(cleaned)) {
    cleaned = normalizeIpv6(cleaned);
  }

  return cleaned.trim();
}

/**
 * Basic IPv4/IPv6 validator
 */
export function isValidIp(ip: string): boolean {
  if (!ip || typeof ip !== "string") return false;
  const trimmed = ip.trim();
  if (trimmed.length < 3) return false;

  // IPv4 simple regex
  if (IPV4_REGEX.test(trimmed)) return true;

  // IPv6 check: loopback, compressed shorthand, or full notation
  return (
    (trimmed === "::1" || trimmed.includes("::") || IPV6_REGEX.test(trimmed)) &&
    trimmed.length <= 45
  );
}

/**
 * Checks if the IP is localhost or a private RFC1918 / RFC4193 / link-local range
 */
export function isLocalOrPrivateIp(ip: string): boolean {
  const sanitized = sanitizeIp(ip);
  if (
    sanitized === "127.0.0.1" ||
    sanitized === "::1" ||
    sanitized === "localhost" ||
    sanitized.startsWith("10.") ||
    sanitized.startsWith("192.168.") ||
    sanitized.startsWith("fc00:") ||
    sanitized.startsWith("fd") ||
    sanitized.startsWith("fe80:")
  ) {
    return true;
  }
  if (sanitized.startsWith("172.")) {
    const parts = sanitized.split(".");
    const secondOctet = parseInt(parts[1], 10);
    if (secondOctet >= 16 && secondOctet <= 31) return true;
  }
  return false;
}

/**
 * Extracts the client's public IP address from standard reverse proxy and CDN headers.
 * Fully supports both IPv4 and IPv6 addresses.
 * Order of priority:
 * 1. cf-connecting-ip (Cloudflare)
 * 2. x-real-ip (Standard proxies/Nginx)
 * 3. x-forwarded-for (Comma-separated list; grab the very first IP in the list and trim whitespace)
 * 4. true-client-ip / fastly-client-ip / x-client-ip
 * 5. Fallback to request.ip or a safe fallback string like '127.0.0.1' only if all headers are missing.
 */
export function getClientIp(
  req:
    | NextRequest
    | Request
    | {
        headers?: Headers | { get(name: string): string | null };
        ip?: string;
        socket?: { remoteAddress?: string };
      }
): string {
  try {
    const headers = req.headers;

    // 1. Cloudflare connecting IP
    const cfConnectingIp = headers?.get("cf-connecting-ip");
    if (cfConnectingIp) {
      const sanitized = sanitizeIp(cfConnectingIp);
      if (isValidIp(sanitized)) {
        return sanitized;
      }
    }

    // 2. Standard X-Real-IP
    const xRealIp = headers?.get("x-real-ip");
    if (xRealIp) {
      const sanitized = sanitizeIp(xRealIp);
      if (isValidIp(sanitized)) {
        return sanitized;
      }
    }

    // 3. X-Forwarded-For (Comma-separated list; grab the very first IP in the list and trim whitespace)
    const xForwardedFor = headers?.get("x-forwarded-for");
    if (xForwardedFor) {
      const firstIp = xForwardedFor.split(",")[0]?.trim();
      if (firstIp) {
        const sanitized = sanitizeIp(firstIp);
        if (isValidIp(sanitized)) {
          return sanitized;
        }
      }
    }

    // Additional proxy headers if present (true-client-ip / fastly-client-ip)
    const trueClientIp =
      headers?.get("true-client-ip") ||
      headers?.get("fastly-client-ip") ||
      headers?.get("x-client-ip");
    if (trueClientIp) {
      const sanitized = sanitizeIp(trueClientIp);
      if (isValidIp(sanitized)) {
        return sanitized;
      }
    }

    // 4. Fallback to request.ip or a safe fallback string like '127.0.0.1' only if all headers are missing
    const reqWithIp = req as { ip?: string; socket?: { remoteAddress?: string } };
    if (reqWithIp.ip) {
      const sanitized = sanitizeIp(reqWithIp.ip);
      if (isValidIp(sanitized)) {
        return sanitized;
      }
    }

    if (reqWithIp.socket?.remoteAddress) {
      const sanitized = sanitizeIp(reqWithIp.socket.remoteAddress);
      if (isValidIp(sanitized)) {
        return sanitized;
      }
    }
  } catch (err) {
    console.error("[IP Extraction] Error resolving client IP:", err);
  }

  // Safe fallback default
  return "127.0.0.1";
}
