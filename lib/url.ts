/**
 * Centralized Application URL and Domain Configuration for SecuritySTEX
 * 
 * Provides dynamic URL resolution across local development, Vercel preview,
 * and live production environments (https://stexsecurity.vercel.app).
 */

export const PRODUCTION_DOMAIN = "https://stexsecurity.vercel.app";

/**
 * Resolves the application base URL dynamically.
 * 
 * Priority order:
 * 1. process.env.NEXT_PUBLIC_APP_URL
 * 2. process.env.NEXT_PUBLIC_BASE_URL
 * 3. process.env.VERCEL_PROJECT_PRODUCTION_URL (Vercel production domain)
 * 4. process.env.VERCEL_URL (Vercel deployment host)
 * 5. Fallback to live production domain: https://stexsecurity.vercel.app
 */
export function getAppUrl(fallback = PRODUCTION_DOMAIN): string {
  const envUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined) ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ||
    fallback;

  return envUrl.replace(/\/$/, "");
}

/**
 * Resolves the origin URL from an incoming NextRequest, standard Request,
 * or header container. If no request or headers are available, falls back
 * to getAppUrl().
 */
export function getRequestOrigin(req?: Request | { headers?: Headers | Record<string, string | string[] | undefined> }): string {
  if (req && "headers" in req && req.headers) {
    const headers = req.headers;
    const getHeader = (name: string): string | null => {
      if (typeof (headers as Headers).get === "function") {
        return (headers as Headers).get(name);
      }
      const val = (headers as Record<string, string | string[] | undefined>)[name];
      if (Array.isArray(val)) return val[0] || null;
      return val || null;
    };

    const forwardedHost = getHeader("x-forwarded-host");
    const forwardedProto = getHeader("x-forwarded-proto") || "https";

    if (forwardedHost) {
      const primaryHost = forwardedHost.split(",")[0].trim();
      return `${forwardedProto}://${primaryHost}`.replace(/\/$/, "");
    }

    const host = getHeader("host");
    if (host) {
      const proto = host.includes("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
      return `${proto}://${host}`.replace(/\/$/, "");
    }
  }

  return getAppUrl();
}
