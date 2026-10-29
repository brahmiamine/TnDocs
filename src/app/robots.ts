import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return {
    rules: [{
      userAgent: "*",
      allow: ["/fr", "/ar"],
      disallow: [
        "/api", "/fr/admin", "/ar/admin", "/fr/connexion", "/ar/connexion",
        "/fr/inscription", "/ar/inscription", "/fr/mes-documents", "/ar/mes-documents",
        "/fr/profils", "/ar/profils", "/fr/dossiers", "/ar/dossiers", "/fr/partage", "/ar/partage",
        "/fr/mot-de-passe-oublie", "/ar/mot-de-passe-oublie",
        "/fr/reinitialiser-mot-de-passe", "/ar/reinitialiser-mot-de-passe",
        "/fr/verifier-email", "/ar/verifier-email",
      ],
    }],
    sitemap: baseUrl + "/sitemap.xml",
  };
}
