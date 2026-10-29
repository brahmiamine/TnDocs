import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/modules/identity/service";
import { SecurityManager } from "@/modules/identity/SecurityManager";
export const dynamic = "force-dynamic";
export default async function SecurityPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== "fr" && locale !== "ar") notFound();
  if (!await getSessionUser()) redirect(`/${locale}/connexion`);
  return <main dir={locale === "ar" ? "rtl" : "ltr"}><SecurityManager locale={locale} /></main>;
}
