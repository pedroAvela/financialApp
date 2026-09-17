/** A fresh nonce is created by the proxy, never accepted from client headers. */
export function contentSecurityPolicy(nonce: string, supabaseUrl: string, development = false) {
  if (!/^[A-Za-z0-9+/=_-]+$/.test(nonce)) throw new Error("Nonce inválido.");
  const endpoint = new URL(supabaseUrl);
  if (!["https:", "http:"].includes(endpoint.protocol)) throw new Error("URL inválida.");
  const websocket = new URL(endpoint.origin);
  websocket.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
  return [
    "default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    // Existing chart/category colors use React inline styles. Scripts remain nonce-only.
    "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self'",
    `connect-src 'self' ${endpoint.origin} ${websocket.origin}${development ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
    "worker-src 'self' blob:",
  ].join("; ");
}

export const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];
