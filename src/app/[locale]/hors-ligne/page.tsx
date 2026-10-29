import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { OfflineWorkspace } from "@/modules/offline/OfflineWorkspace";

export const dynamic = "force-static";
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Static shell only. Account/document identifiers live in the fragment and never reach the server. */
export default async function OfflinePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== "fr" && locale !== "ar") notFound();
  return <main className="site-shell"><section className="section"><div className="container"><OfflineWorkspace locale={locale} /></div></section></main>;
}
