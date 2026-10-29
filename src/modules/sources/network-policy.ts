import { isIP } from "node:net";

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 || a === 192 && b === 0 && (c === 0 || c === 2) || a === 192 && b === 88 && c === 99 || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113);
  }
  if (isIP(address) === 6) {
    // Only globally routed unicast. Mapped IPv4, ULA, NAT64, multicast and link-local fail closed.
    const canonical = new URL(`https://[${address}]/`).hostname.slice(1, -1).toLowerCase();
    const parts = canonical.split(":");
    const first = parseInt(parts[0] || "0", 16), second = parseInt(parts[1] || "0", 16);
    if (first < 0x2000 || first >= 0x3fff || first === 0x2002) return false;
    if (first === 0x2001 && (second === 0 || second === 2 || second === 0xdb8 || second >= 0x10 && second <= 0x2f)) return false;
    return true;
  }
  return false;
}
export function approvedSourceHosts() {
  return (process.env.SOURCE_ALLOWED_HOSTS ?? "").split(",").map(host => host.trim().toLowerCase()).filter(Boolean);
}
export function validateSourceUrl(raw: string, allowedHosts = approvedSourceHosts()): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443" || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(url.hostname) || isIP(url.hostname) || !allowedHosts.includes(url.hostname.toLowerCase())) throw new Error("SOURCE_URL_NOT_ALLOWED");
  url.hash = "";
  return url;
}
