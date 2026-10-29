import { notFound, redirect } from "next/navigation";
import { userHasRole } from "@/modules/identity/authorization";
import { SourceAdmin } from "@/modules/sources/SourceAdmin";
export const dynamic = "force-dynamic";
export default async function SourceAdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; if (locale !== "fr" && locale !== "ar") notFound();
  const { user, reason } = await userHasRole("moderator"); if (!user) { if (reason === "unauthenticated") redirect(`/${locale}/connexion`); notFound(); }
  return <SourceAdmin locale={locale} />;
}
