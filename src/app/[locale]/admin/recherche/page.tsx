import { notFound, redirect } from "next/navigation";
import { userHasRole } from "@/modules/identity/authorization";
import { SearchAdmin } from "@/modules/search/SearchAdmin";
export const dynamic = "force-dynamic";
export default async function SearchAdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; if (locale !== "fr" && locale !== "ar") notFound();
  const { user, reason } = await userHasRole("moderator"); if (!user) { if (reason === "unauthenticated") redirect(`/${locale}/connexion`); notFound(); }
  return <SearchAdmin locale={locale} />;
}
