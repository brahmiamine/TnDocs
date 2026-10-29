import { notFound } from "next/navigation";
import { GuidedAssistant } from "@/modules/procedures/GuidedAssistant";
export default async function AssistantPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; if (locale !== "fr" && locale !== "ar") notFound();
  return <GuidedAssistant locale={locale} />;
}
