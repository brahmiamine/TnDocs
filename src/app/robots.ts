import type { MetadataRoute } from 'next';
export default function robots(): MetadataRoute.Robots {
  const privateRoutes = ['connexion', 'inscription', 'profils', 'mes-documents', 'dossiers', 'partage', 'signer', 'securite', 'admin', 'contributions', 'contact', 'verifier-email', 'mot-de-passe-oublie', 'reinitialiser-mot-de-passe'];
  return { rules: { userAgent: '*', allow: ['/', '/fr/catalogue', '/ar/catalogue', '/fr/aide', '/ar/aide'], disallow: ['/api/', ...['fr', 'ar'].flatMap(locale => privateRoutes.map(route => `/${locale}/${route}`))] }, sitemap: `${(process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')}/sitemap.xml` };
}
