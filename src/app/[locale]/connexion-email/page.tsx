import { notFound } from "next/navigation";
import { MagicLinkForm } from "@/modules/identity/MagicLinkForm";
export default async function MagicPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== "fr" && locale !== "ar") notFound();
  return <main className="container section" dir={locale === "ar" ? "rtl" : "ltr"}><MagicLinkForm locale={locale} /></main>;
}
