import { notFound } from "next/navigation";
import { SharedDossierViewer } from "@/modules/dossiers/SharedDossierViewer";
export const metadata = { title: "TnDocs — Dossier partagé", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) { const { locale } = await params; if (locale !== "fr" && locale !== "ar") notFound(); return <SharedDossierViewer locale={locale} />; }
