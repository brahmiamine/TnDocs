import { notFound } from "next/navigation";
import { EmailChangeConfirmation } from "@/modules/identity/EmailChangeConfirmation";
export default async function ConfirmEmailPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; if (locale !== "fr" && locale !== "ar") notFound();
  return <main className="container section" dir={locale === "ar" ? "rtl" : "ltr"}><EmailChangeConfirmation locale={locale} /></main>;
}
