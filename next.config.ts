import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  outputFileTracingIncludes: { "/api/v1/admin/sources/**/*": ["./node_modules/pdfjs-dist/**/*", "./node_modules/@napi-rs/canvas/**/*"] },
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
      ...["/:locale/securite", "/:locale/connexion-email", "/:locale/confirmer-email", "/:locale/signer", "/api/v1/auth/google/callback", "/:locale/mes-documents/:path*", "/:locale/profils", "/:locale/dossiers/:path*", "/:locale/notifications", "/:locale/contributions", "/:locale/admin/:path*"].map(source => ({ source, headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "Cache-Control", value: "private, no-store" }, { key: "X-Robots-Tag", value: "noindex, nofollow" }] })),
      {
        source: "/:locale/verifier-email",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        source: "/:locale/reinitialiser-mot-de-passe",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        source: "/:locale/partage",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
